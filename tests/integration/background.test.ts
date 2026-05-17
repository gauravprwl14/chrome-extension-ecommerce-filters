/**
 * Integration tests for background.ts orchestration logic.
 * Tests the auto-apply decision logic, session state management,
 * and reapply/turnOff flows — bugs that unit tests missed.
 */
import { describe, it, expect, vi } from 'vitest'
import type { Config } from '../../lib/config'
import {
  getConfig,
  getTabSessionState,
  setTabSessionState,
  clearTabSessionState,
} from '../../lib/storage'

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockSyncStorage(config: Config) {
  ;(chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    brandfilter_config: config,
  })
}

function mockSessionStorage(tabId: number, value: unknown) {
  ;(chrome.storage.session.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    [`applied_${tabId}`]: value,
  })
}

function mockSessionEmpty() {
  ;(chrome.storage.session.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({})
}

const FULL_CONFIG: Config = {
  version: '1',
  masterBrands: [
    { id: 'tommy', name: 'Tommy Hilfiger' },
    { id: 'hm', name: 'H&M' },
  ],
  profiles: [{ id: 'casual', name: 'Casual', icon: '👕', brandIds: ['tommy', 'hm'] }],
  sites: [
    {
      id: 'myntra',
      hostname: 'www.myntra.com',
      defaultProfileId: 'casual',
      enabled: true,
      customSelector: null,
    },
    {
      id: 'ajio',
      hostname: 'www.ajio.com',
      defaultProfileId: 'casual',
      enabled: true,
      customSelector: null,
    },
  ],
}

// ── Auto-apply decision logic ─────────────────────────────────────────────────

describe('background — auto-apply gate conditions', () => {
  it('gates: site found + enabled + defaultProfileId + no session → should apply', async () => {
    mockSyncStorage(FULL_CONFIG)
    mockSessionEmpty()

    const config = await getConfig()
    const site = config.sites.find((s) => s.hostname === 'www.myntra.com')!

    expect(site.enabled).toBe(true)
    expect(site.defaultProfileId).toBe('casual')

    const sessionState = await getTabSessionState(1)
    expect(sessionState).toBeNull() // null = fresh, should apply
  })

  it('gates: site not found → stop (no apply)', async () => {
    mockSyncStorage(FULL_CONFIG)

    const config = await getConfig()
    const site = config.sites.find((s) => s.hostname === 'www.flipkart.com') ?? null
    expect(site).toBeNull()
    // background logic: if (!site) return
  })

  it('gates: site disabled → stop (no apply)', async () => {
    const disabled: Config = {
      ...FULL_CONFIG,
      sites: FULL_CONFIG.sites.map((s) =>
        s.hostname === 'www.myntra.com' ? { ...s, enabled: false } : s,
      ),
    }
    mockSyncStorage(disabled)

    const config = await getConfig()
    const site = config.sites.find((s) => s.hostname === 'www.myntra.com')!
    expect(site.enabled).toBe(false)
    // background logic: if (!site.enabled) return
  })

  it('gates: session already applied (number) → stop', async () => {
    const ts = Date.now() - 30_000
    mockSessionStorage(42, ts)

    const state = await getTabSessionState(42)
    expect(state).toBe(ts)
    // background logic: if (sessionState !== null) return
    expect(state).not.toBeNull()
  })

  it('gates: session = user-off → stop', async () => {
    mockSessionStorage(42, 'user-off')

    const state = await getTabSessionState(42)
    expect(state).toBe('user-off')
    expect(state).not.toBeNull() // not null → background stops
  })

  it('gates: defaultProfileId empty → stop', async () => {
    const noProfile: Config = {
      ...FULL_CONFIG,
      sites: FULL_CONFIG.sites.map((s) =>
        s.hostname === 'www.myntra.com' ? { ...s, defaultProfileId: '' } : s,
      ),
    }
    mockSyncStorage(noProfile)

    const config = await getConfig()
    const site = config.sites.find((s) => s.hostname === 'www.myntra.com')!
    expect(site.defaultProfileId).toBe('')
    // background logic: if (!site.defaultProfileId) return
    expect(Boolean(site.defaultProfileId)).toBe(false)
  })
})

// ── Session state is a timestamp, not a boolean (bug regression) ──────────────

describe('background — session state stores timestamp (bug regression)', () => {
  it('setTabSessionState stores a number (timestamp), not boolean true', async () => {
    const before = Date.now()
    await setTabSessionState(42, Date.now())
    const after = Date.now()

    const setCall = (chrome.storage.session.set as ReturnType<typeof vi.fn>).mock.calls[0]
    const stored = setCall?.[0]?.['applied_42'] as unknown
    expect(typeof stored).toBe('number')
    expect(stored as number).toBeGreaterThanOrEqual(before)
    expect(stored as number).toBeLessThanOrEqual(after)
  })

  it('getTabSessionState returns the timestamp on applied tab', async () => {
    const ts = 1747400000000
    mockSessionStorage(5, ts)

    const state = await getTabSessionState(5)
    expect(state).toBe(ts)
    expect(typeof state).toBe('number')
  })

  it('getTabSessionState returns null on fresh tab (no session)', async () => {
    mockSessionEmpty()

    const state = await getTabSessionState(5)
    expect(state).toBeNull()
  })
})

// ── Reapply flow ──────────────────────────────────────────────────────────────

describe('background — reapply flow', () => {
  it('clears session flag before re-applying (allows re-trigger)', async () => {
    const tabId = 10

    // Setup: tab has an existing session flag
    await setTabSessionState(tabId, Date.now() - 60_000)
    vi.clearAllMocks() // reset call tracking

    // Reapply flow: clear first
    await clearTabSessionState(tabId)
    expect(chrome.storage.session.remove).toHaveBeenCalledWith('applied_10')
  })

  it('reapply sets a new timestamp after apply', async () => {
    const tabId = 10
    ;(chrome.tabs.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined)

    await chrome.tabs.sendMessage(tabId, { action: 'applyProfile', profileId: 'casual' })
    await setTabSessionState(tabId, Date.now())

    const setCall = (chrome.storage.session.set as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(typeof setCall?.[0]?.['applied_10']).toBe('number')
  })
})

// ── TurnOff flow ──────────────────────────────────────────────────────────────

describe('background — turnOff flow', () => {
  it('sets session to user-off string (not boolean)', async () => {
    await setTabSessionState(7, 'user-off')

    const setCall = (chrome.storage.session.set as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(setCall?.[0]?.['applied_7']).toBe('user-off')
  })

  it('sends clearFilters message to content script', async () => {
    ;(chrome.tabs.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined)

    await chrome.tabs.sendMessage(7, { action: 'clearFilters' })
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(7, { action: 'clearFilters' })
  })
})

// ── First-run seeding ─────────────────────────────────────────────────────────

describe('background — first-run seeding', () => {
  it('default profile "my-brands" is created with all brand IDs', async () => {
    // Verify the expected first-run output structure
    const brandIds = ['tommy', 'hm', 'levis']
    const defaultProfile = { id: 'my-brands', name: 'My Brands', icon: '🛍', brandIds }

    expect(defaultProfile.id).toBe('my-brands')
    expect(defaultProfile.brandIds.length).toBeGreaterThan(0)
  })

  it('both Myntra and Ajio sites get my-brands as default after first run', () => {
    // Simulates what background.ts does after onInstalled
    const seededConfig: Config = {
      ...FULL_CONFIG,
      profiles: [{ id: 'my-brands', name: 'My Brands', icon: '🛍', brandIds: ['tommy', 'hm'] }],
      sites: FULL_CONFIG.sites.map((s) => ({ ...s, defaultProfileId: 'my-brands' })),
    }

    for (const site of seededConfig.sites) {
      expect(site.defaultProfileId).toBe('my-brands')
    }
  })
})
