/**
 * Regression tests for the "Myntra apply-loop / URL flicker" bug.
 *
 * Bug history: e-commerce SPAs like Myntra trigger a full top-level
 * navigation on every brand-filter click → `chrome.tabs.onUpdated` fires
 * `status: 'loading'` per click. The original orchestration code set the
 * session flag AFTER awaiting `chrome.tabs.sendMessage`, which doesn't
 * resolve until the content-script adapter finishes clicking every brand
 * (~30s for a 20-brand profile). During that ~30s window the session flag
 * stayed null, so each navigation triggered a fresh applyProfile → fresh
 * adapter → fresh navigation → infinite loop. Visible symptom: URL rapidly
 * cycling through brand combinations and the page never settling.
 *
 * The fix moves the session-flag write BEFORE the sendMessage. These tests
 * pin the ordering. If a future refactor swaps the order back, the
 * "second-onUpdated-during-apply" test will fail loudly.
 */
import { describe, it, expect, vi } from 'vitest'
import type { Config, ExtensionMessage } from '../lib/config'
import { DEFAULT_CONFIG } from '../lib/config'
import {
  handleAutoApply,
  handleReapply,
  handleTurnOff,
  type AutoApplyDeps,
} from '../lib/auto-apply'

// ── Test harness ──────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    ...DEFAULT_CONFIG,
    masterBrands: [{ id: 'timex', name: 'Timex' }],
    profiles: [{ id: 'watches', name: 'Watches', icon: '⌚', brandIds: ['timex'] }],
    sites: DEFAULT_CONFIG.sites.map((s) => ({ ...s, defaultProfileId: 'watches' })),
    ...overrides,
  }
}

/**
 * Build a deps object backed by an in-memory session store, with a
 * `sendToTab` mock whose resolution can be deferred (to simulate the real
 * adapter taking ~30s to click all the brands).
 */
function makeDeps(
  opts: {
    config?: Config
    sendToTab?: AutoApplyDeps['sendToTab']
    now?: () => number
  } = {},
) {
  const session = new Map<number, number | 'user-off'>()
  const calls: Array<{ when: number; event: string; payload?: unknown }> = []
  let clock = 1_000

  const deps: AutoApplyDeps = {
    getConfig: async () => opts.config ?? makeConfig(),
    getTabSession: async (tabId) => session.get(tabId) ?? null,
    setTabSession: vi.fn(async (tabId, value) => {
      calls.push({ when: clock++, event: 'setSession', payload: { tabId, value } })
      session.set(tabId, value)
    }),
    clearTabSession: vi.fn(async (tabId) => {
      calls.push({ when: clock++, event: 'clearSession', payload: { tabId } })
      session.delete(tabId)
    }),
    sendToTab:
      opts.sendToTab ??
      vi.fn(async (tabId, msg) => {
        calls.push({ when: clock++, event: 'sendToTab', payload: { tabId, msg } })
      }),
    now: opts.now ?? (() => 1_700_000_000_000),
  }

  return { deps, session, calls }
}

// ── Critical ordering tests ───────────────────────────────────────────────────

describe('handleAutoApply — session-flag ordering (Myntra apply-loop regression)', () => {
  it('sets session flag BEFORE sending applyProfile (not after)', async () => {
    const { deps, calls } = makeDeps()
    await handleAutoApply(1, 'www.myntra.com', deps)

    const sessionIdx = calls.findIndex((c) => c.event === 'setSession')
    const sendIdx = calls.findIndex((c) => c.event === 'sendToTab')
    expect(sessionIdx).toBeGreaterThanOrEqual(0)
    expect(sendIdx).toBeGreaterThanOrEqual(0)
    expect(sessionIdx).toBeLessThan(sendIdx) // ← THE BUG: this used to be reversed
  })

  it('a second onUpdated fired DURING an in-flight applyProfile is blocked by the session flag', async () => {
    // Simulate the real bug: first sendToTab "hangs" (adapter clicking brands
    // takes 30s on real Myntra). Meanwhile chrome.tabs.onUpdated fires again
    // because Myntra navigated on the adapter's first click.
    let resolveFirstSend: () => void = () => {}
    const firstSendPromise = new Promise<void>((r) => (resolveFirstSend = r))
    let sendCallCount = 0

    const sendToTab = vi.fn(async () => {
      sendCallCount += 1
      if (sendCallCount === 1) await firstSendPromise // simulate slow adapter
    })

    const { deps } = makeDeps({ sendToTab })

    // First onUpdated — starts the apply (will hang on firstSendPromise)
    const first = handleAutoApply(1, 'www.myntra.com', deps)
    // Give the first call a tick to set the session flag
    await Promise.resolve()
    await Promise.resolve()

    // Second onUpdated — Myntra navigated mid-adapter-click. MUST be blocked.
    const second = await handleAutoApply(1, 'www.myntra.com', deps)
    expect(second.outcome).toBe('session-blocks')
    expect(sendCallCount).toBe(1) // ← THE BUG: this used to be 2+ → loop

    // Let the first sendToTab finish so the test completes.
    resolveFirstSend()
    await first
  })

  it('clears the session flag when sendToTab rejects so the user can retry', async () => {
    const sendToTab = vi.fn(async () => {
      throw new Error('content script gone')
    })
    const { deps, session } = makeDeps({ sendToTab })
    const result = await handleAutoApply(1, 'www.myntra.com', deps)
    expect(result.outcome).toBe('apply-failed')
    expect(session.has(1)).toBe(false) // ← cleared, so next nav can retry
  })

  it('respects an existing session flag (does NOT re-apply on subsequent navigations)', async () => {
    const { deps } = makeDeps()
    await deps.setTabSession(1, 1) // pre-existing stamp
    const result = await handleAutoApply(1, 'www.myntra.com', deps)
    expect(result.outcome).toBe('session-blocks')
  })

  it('respects user-off and never re-applies', async () => {
    const { deps, calls } = makeDeps()
    await deps.setTabSession(1, 'user-off')
    const result = await handleAutoApply(1, 'www.myntra.com', deps)
    expect(result.outcome).toBe('session-blocks')
    expect(calls.find((c) => c.event === 'sendToTab')).toBeUndefined()
  })

  it('skips when site is not configured', async () => {
    const { deps } = makeDeps()
    const result = await handleAutoApply(1, 'www.unknown.com', deps)
    expect(result.outcome).toBe('no-matching-site')
  })

  it('skips when site is disabled', async () => {
    const cfg = makeConfig({
      sites: DEFAULT_CONFIG.sites.map((s) =>
        s.hostname === 'www.myntra.com' ? { ...s, enabled: false, defaultProfileId: 'watches' } : s,
      ),
    })
    const { deps } = makeDeps({ config: cfg })
    const result = await handleAutoApply(1, 'www.myntra.com', deps)
    expect(result.outcome).toBe('site-disabled')
  })

  it('skips when defaultProfileId is empty', async () => {
    const cfg = makeConfig({
      sites: DEFAULT_CONFIG.sites.map((s) => ({ ...s, defaultProfileId: '' })),
    })
    const { deps } = makeDeps({ config: cfg })
    const result = await handleAutoApply(1, 'www.myntra.com', deps)
    expect(result.outcome).toBe('no-default-profile')
  })
})

describe('handleReapply — session-flag ordering (popup Apply button)', () => {
  it('sets session flag BEFORE sending applyProfile (not after)', async () => {
    const { deps, calls } = makeDeps()
    await handleReapply(1, 'watches', deps)
    const sessionIdx = calls.findIndex(
      (c) => c.event === 'setSession' && (c.payload as { value: unknown }).value !== 'user-off',
    )
    const sendIdx = calls.findIndex((c) => c.event === 'sendToTab')
    expect(sessionIdx).toBeGreaterThanOrEqual(0)
    expect(sendIdx).toBeGreaterThanOrEqual(0)
    expect(sessionIdx).toBeLessThan(sendIdx)
  })

  it('blocks the auto-apply listener that fires from the FIRST adapter click', async () => {
    // The realistic sequence: popup-Apply → handleReapply → adapter clicks
    // brand 1 → Myntra navigates → chrome.tabs.onUpdated → handleAutoApply.
    // The autoApply must see the session stamp set by reapply.
    let resolvePopupSend: () => void = () => {}
    const sendToTab = vi.fn<AutoApplyDeps['sendToTab']>(
      async () => new Promise<void>((r) => (resolvePopupSend = r)),
    )
    const { deps } = makeDeps({ sendToTab })

    const popupCall = handleReapply(1, 'watches', deps)
    await Promise.resolve()
    await Promise.resolve()

    const autoCall = await handleAutoApply(1, 'www.myntra.com', deps)
    expect(autoCall.outcome).toBe('session-blocks')

    resolvePopupSend()
    await popupCall
  })

  it('clears session on sendToTab failure so retry works', async () => {
    const sendToTab = vi.fn(async () => {
      throw new Error('disconnected')
    })
    const { deps, session } = makeDeps({ sendToTab })
    const result = await handleReapply(1, 'watches', deps)
    expect(result.ok).toBe(false)
    expect(session.has(1)).toBe(false)
  })
})

describe('handleTurnOff — user-off semantics', () => {
  it('writes user-off BEFORE sending clearFilters', async () => {
    const { deps, calls } = makeDeps()
    await handleTurnOff(1, deps)
    const setIdx = calls.findIndex(
      (c) => c.event === 'setSession' && (c.payload as { value: unknown }).value === 'user-off',
    )
    const sendIdx = calls.findIndex(
      (c) =>
        c.event === 'sendToTab' &&
        ((c.payload as { msg: ExtensionMessage }).msg as { action: string }).action ===
          'clearFilters',
    )
    expect(setIdx).toBeLessThan(sendIdx)
  })

  it('keeps user-off set even when clearFilters fails (user explicitly disabled — honor it)', async () => {
    const sendToTab = vi.fn(async () => {
      throw new Error('content script not loaded')
    })
    const { deps, session } = makeDeps({ sendToTab })
    const result = await handleTurnOff(1, deps)
    expect(result.ok).toBe(false)
    expect(session.get(1)).toBe('user-off') // ← do NOT clear; user intent persists
  })
})
