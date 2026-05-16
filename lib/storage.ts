import type { Config, Brand } from './config'
import { DEFAULT_CONFIG } from './config'

const STORAGE_KEY = 'brandfilter_config'

/** Read full config from chrome.storage.sync. Returns DEFAULT_CONFIG clone if not set. */
export async function getConfig(): Promise<Config> {
  const result = await chrome.storage.sync.get(STORAGE_KEY)
  return (result[STORAGE_KEY] as Config) ?? structuredClone(DEFAULT_CONFIG)
}

/** Write full config to chrome.storage.sync. */
export async function setConfig(config: Config): Promise<void> {
  await chrome.storage.sync.set({ [STORAGE_KEY]: config })
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

type SessionValue = true | 'user-off'

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
