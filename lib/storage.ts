import type { Config, Brand } from './config'
import { DEFAULT_CONFIG } from './config'

const STORAGE_KEY = 'brandfilter_config'

/**
 * We use `chrome.storage.local` (5 MB quota) instead of `chrome.storage.sync`
 * (8 KB per-item quota). With 90+ seeded brands + user-added brands + profile
 * brandId lists, the encoded payload regularly exceeds 8192 bytes, which
 * causes `chrome.storage.sync.set` to throw QUOTA_BYTES_PER_ITEM. That
 * rejection used to surface as a silent hang in the popup ("Loading…"
 * forever) because the calling IIFE didn't await the result.
 *
 * Trade-off: no cross-device sync. Given users teach site-specific selectors
 * and accumulate large brand lists, sync was unrealistic anyway.
 */
const STORAGE_AREA = 'local' as const

/**
 * Read full config. Returns DEFAULT_CONFIG clone if storage is empty.
 *
 * Migrates from legacy `chrome.storage.sync` on first read: if local has no
 * value but sync does, copy it into local and proceed from local.
 */
export async function getConfig(): Promise<Config> {
  const localResult = await chrome.storage[STORAGE_AREA].get(STORAGE_KEY)
  if (localResult[STORAGE_KEY]) return localResult[STORAGE_KEY] as Config

  // Legacy migration: copy sync → local once, then never touch sync again.
  try {
    const syncResult = await chrome.storage.sync.get(STORAGE_KEY)
    if (syncResult[STORAGE_KEY]) {
      await chrome.storage[STORAGE_AREA].set({ [STORAGE_KEY]: syncResult[STORAGE_KEY] })
      return syncResult[STORAGE_KEY] as Config
    }
  } catch {
    // Sync may not be available in some test/runtime environments — ignore.
  }

  return structuredClone(DEFAULT_CONFIG)
}

/** Write full config to local storage. */
export async function setConfig(config: Config): Promise<void> {
  await chrome.storage[STORAGE_AREA].set({ [STORAGE_KEY]: config })
}

/** Update a single top-level field without overwriting others. */
export async function updateConfig<K extends keyof Config>(
  key: K,
  value: Config[K],
): Promise<void> {
  const config = await getConfig()
  config[key] = value
  await setConfig(config)
}

/**
 * Add brand to masterBrands if not already present.
 * Returns true if added, false if it already existed.
 */
export async function ensureBrandInLibrary(brand: Brand): Promise<boolean> {
  const config = await getConfig()
  if (config.masterBrands.some((b) => b.id === brand.id)) return false
  config.masterBrands.push(brand)
  await setConfig(config)
  return true
}

// number = Date.now() timestamp (popup's StatusBar renders "Applied X min ago" from it)
// 'user-off' = user explicitly turned off auto-apply; persists across soft navigations in the same tab
type SessionValue = number | 'user-off'

/** Get per-tab auto-apply session state. Returns null if not set (fresh page load). */
export async function getTabSessionState(tabId: number): Promise<SessionValue | null> {
  const key = `applied_${tabId}`
  const result = await chrome.storage.session.get(key)
  return (result[key] as SessionValue) ?? null
}

/** Set per-tab session state. true = applied, 'user-off' = user explicitly disabled. */
export async function setTabSessionState(tabId: number, value: SessionValue): Promise<void> {
  await chrome.storage.session.set({ [`applied_${tabId}`]: value })
}

/** Clear per-tab state so auto-apply can fire again on next navigation. */
export async function clearTabSessionState(tabId: number): Promise<void> {
  await chrome.storage.session.remove(`applied_${tabId}`)
}
