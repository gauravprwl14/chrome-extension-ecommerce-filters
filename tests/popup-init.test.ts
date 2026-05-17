/**
 * Regression tests for the "popup stuck on Loading…" bug.
 *
 * Bug history: the popup's mount-time async work was a fire-and-forget IIFE
 * with no try/catch. When `setConfig` rejected (quota exceeded), the
 * rejection was swallowed → React state never advanced past the initial
 * `config = null` → the popup rendered "Loading…" forever.
 *
 * The fix moved the init logic into `initPopupState`, which now MUST:
 *   1. Return `{ ok: false, error }` for any failure — never throw.
 *   2. Treat bootstrap failures as non-fatal: a quota-exceeded write should
 *      not block reading the existing config and proceeding.
 *   3. Always advance to a terminal state (ok or err) — never hang.
 *
 * These tests pin all three properties.
 */
import { describe, it, expect, vi } from 'vitest'
import type { Brand, Config } from '../lib/config'
import { DEFAULT_CONFIG } from '../lib/config'
import { initPopupState, type PopupInitDeps } from '../lib/popup-init'

const SEED_BRANDS: Brand[] = [
  { id: 'timex', name: 'Timex' },
  { id: 'casio', name: 'Casio' },
]

function makeDeps(overrides: Partial<PopupInitDeps> = {}): PopupInitDeps {
  return {
    queryActiveTab: async () => ({ id: 42, url: 'https://www.myntra.com/mens-watches' }),
    getConfig: async () => ({
      ...DEFAULT_CONFIG,
      masterBrands: [...SEED_BRANDS],
      profiles: [{ id: 'my-brands', name: 'My Brands', icon: '🛍', brandIds: ['timex'] }],
      sites: DEFAULT_CONFIG.sites.map((s) => ({ ...s, defaultProfileId: 'my-brands' })),
    }),
    setConfig: vi.fn(async () => {}),
    getTabSession: async () => null,
    seedBrands: SEED_BRANDS,
    seedProfiles: [],
    ...overrides,
  }
}

describe('initPopupState — happy path', () => {
  it('returns a terminal ok-state with config, site, and not-applied session', async () => {
    const result = await initPopupState(makeDeps())
    expect(result.ok).toBe(true)
    if (!result.ok) return // type narrow
    expect(result.tabId).toBe(42)
    expect(result.config.masterBrands).toHaveLength(2)
    expect(result.currentSite?.hostname).toBe('www.myntra.com')
    expect(result.session.kind).toBe('not-applied')
  })

  it('maps numeric session state → applied', async () => {
    const ts = Date.now() - 60_000
    const result = await initPopupState(makeDeps({ getTabSession: async () => ts }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.session).toEqual({ kind: 'applied', appliedAt: ts })
  })

  it('maps user-off session state → off', async () => {
    const result = await initPopupState(makeDeps({ getTabSession: async () => 'user-off' }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.session.kind).toBe('off')
  })

  it('currentSite is null when hostname does not match any configured site', async () => {
    const result = await initPopupState(
      makeDeps({ queryActiveTab: async () => ({ id: 1, url: 'https://www.example.com/' }) }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.currentSite).toBeNull()
  })
})

describe('initPopupState — failure modes (regression: no infinite Loading…)', () => {
  it('returns ok:false (never throws) when queryActiveTab rejects', async () => {
    const result = await initPopupState(
      makeDeps({
        queryActiveTab: async () => {
          throw new Error('chrome.tabs unavailable')
        },
      }),
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/chrome\.tabs unavailable/)
  })

  it('returns ok:false (never throws) when getConfig rejects', async () => {
    const result = await initPopupState(
      makeDeps({
        getConfig: async () => {
          throw new Error('storage read failed')
        },
      }),
    )
    expect(result.ok).toBe(false)
  })

  it('returns "No active tab" when there is no active tab', async () => {
    const result = await initPopupState(makeDeps({ queryActiveTab: async () => undefined }))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('No active tab')
  })

  it('treats a bootstrap-write failure as NON-fatal and still returns ok with existing config', async () => {
    // This is the exact bug: setConfig throws QuotaExceededError. Before the
    // fix, the IIFE would swallow it and hang. Now: bootstrap failure is
    // logged, init proceeds to read whatever is already in storage.
    const existing: Config = {
      ...DEFAULT_CONFIG,
      masterBrands: SEED_BRANDS,
      profiles: [{ id: 'my-brands', name: 'My Brands', icon: '🛍', brandIds: ['timex'] }],
      sites: DEFAULT_CONFIG.sites.map((s) => ({ ...s, defaultProfileId: 'my-brands' })),
    }
    const result = await initPopupState(
      makeDeps({
        getConfig: async () => existing,
        setConfig: async () => {
          throw new Error('QUOTA_BYTES_PER_ITEM quota exceeded')
        },
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.config.profiles).toHaveLength(1)
  })
})
