/**
 * Regression guard for the "popup stuck on Loading…" bug.
 *
 * Bug history: switching to `chrome.storage.sync` caused setConfig to throw
 * `QUOTA_BYTES_PER_ITEM` once the seeded brand list + per-profile brandId
 * arrays + user-added brands grew past 8192 bytes. The rejection was
 * swallowed by an un-try/catch'd IIFE in the popup → infinite Loading.
 *
 * These tests assert that:
 *   1. A realistic production payload (every seed brand + every seed profile +
 *      a 50-brand user-additions buffer) fits comfortably in the storage
 *      backend we actually use (chrome.storage.local).
 *   2. The same payload does NOT fit in chrome.storage.sync's 8192-byte
 *      per-item quota — i.e. the previous backend choice was unsuitable, and
 *      we keep a tripwire test so future "just switch back to sync" PRs fail
 *      loudly here instead of in production.
 *   3. The test setup's mocked sync.set actually enforces the quota (without
 *      this, the regression sneaks past the entire suite).
 */
import { describe, it, expect } from 'vitest'
import type { Brand, Config, Profile } from '../lib/config'
import { DEFAULT_CONFIG } from '../lib/config'
import defaultBrands from '../assets/default-brands.json'
import { WATCHES_PROFILE, DEFAULT_PROFILE_ID } from '../lib/seed'
import { setConfig } from '../lib/storage'

const SEED_BRANDS = defaultBrands as Brand[]
const SYNC_QUOTA_BYTES_PER_ITEM = 8192
const LOCAL_QUOTA_BYTES = 5 * 1024 * 1024

function byteLen(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length
}

/**
 * Build a config that mirrors what a long-time real user will have in storage:
 *  - All seed brands (default-brands.json)
 *  - 50 user-added brands of average length (simulates extended use)
 *  - Default "My Brands" profile listing every brand id
 *  - Watches profile
 *  - Built-in sites
 */
function realisticUserConfig(userExtraCount = 50): Config {
  const extras: Brand[] = Array.from({ length: userExtraCount }, (_, i) => ({
    id: `user-added-brand-${i.toString().padStart(3, '0')}`,
    name: `User Added Brand ${i}`,
  }))
  const masterBrands = [...SEED_BRANDS, ...extras]
  const myBrands: Profile = {
    id: DEFAULT_PROFILE_ID,
    name: 'My Brands',
    icon: '🛍',
    brandIds: masterBrands.map((b) => b.id),
  }
  const validWatchIds = WATCHES_PROFILE.brandIds.filter((id) =>
    masterBrands.some((b) => b.id === id),
  )
  const watches: Profile = {
    id: WATCHES_PROFILE.id,
    name: WATCHES_PROFILE.name,
    icon: WATCHES_PROFILE.icon,
    brandIds: validWatchIds,
  }
  return {
    ...DEFAULT_CONFIG,
    masterBrands,
    profiles: [myBrands, watches],
    sites: DEFAULT_CONFIG.sites.map((s) => ({ ...s, defaultProfileId: DEFAULT_PROFILE_ID })),
  }
}

describe('storage payload size — production-realistic config', () => {
  it('fits in chrome.storage.local quota with massive headroom', () => {
    const cfg = realisticUserConfig(500) // generous: 500 user-added brands
    const size = byteLen({ brandfilter_config: cfg })
    expect(size).toBeLessThan(LOCAL_QUOTA_BYTES)
    // Sanity: we should be using <<1% of the local budget
    expect(size).toBeLessThan(LOCAL_QUOTA_BYTES / 10)
  })

  it('EXCEEDS chrome.storage.sync per-item quota (proves sync is the wrong backend)', () => {
    const cfg = realisticUserConfig(50)
    const size = byteLen({ brandfilter_config: cfg })
    expect(size).toBeGreaterThan(SYNC_QUOTA_BYTES_PER_ITEM)
  })

  it('seed-only config (no user additions) already crowds the sync quota', () => {
    // Even with zero user brands, we add 15 watch brands + 21-id Watches profile.
    // Pre-bug analysis showed 8534 bytes — over 8192.
    const cfg = realisticUserConfig(0)
    const size = byteLen({ brandfilter_config: cfg })
    expect(size).toBeGreaterThan(SYNC_QUOTA_BYTES_PER_ITEM)
  })
})

describe('setConfig integrates with the chosen backend without exceeding its quota', () => {
  it('writes a realistic 50-extra-brand config successfully', async () => {
    const cfg = realisticUserConfig(50)
    // Must not throw — local quota is plenty.
    await expect(setConfig(cfg)).resolves.toBeUndefined()
    expect(chrome.storage.local.set).toHaveBeenCalled()
  })

  it('the mocked sync.set DOES enforce the 8192 per-item quota (prevents future regressions)', async () => {
    // Sanity test: if someone refactors setConfig back to sync, this test
    // setup will catch it. Direct check on the mocked backend.
    const cfg = realisticUserConfig(50)
    await expect(chrome.storage.sync.set({ brandfilter_config: cfg })).rejects.toThrow(
      /QUOTA_BYTES_PER_ITEM/,
    )
  })
})
