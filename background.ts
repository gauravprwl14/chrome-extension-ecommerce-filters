import type { ExtensionMessage, Brand, Profile } from './lib/config'
import {
  getConfig,
  setConfig,
  getTabSessionState,
  setTabSessionState,
  clearTabSessionState,
} from './lib/storage'
import defaultBrands from './assets/default-brands.json'

// ── First-run onboarding ─────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason !== 'install') return

  const config = await getConfig()
  // Seed master brands from bundled default-brands.json (one-time only)
  if (config.masterBrands.length === 0) {
    config.masterBrands = defaultBrands as Brand[]
  }

  // Create a default "My Brands" profile that includes ALL seeded brands
  const defaultProfile: Profile = {
    id: 'my-brands',
    name: 'My Brands',
    icon: '🛍',
    brandIds: (defaultBrands as Brand[]).map((b) => b.id),
  }
  config.profiles = [defaultProfile]
  config.sites = config.sites.map((s) => ({
    ...s,
    defaultProfileId: 'my-brands',
  }))
  await setConfig(config)

  // Open options page so user can create their first profile
  chrome.tabs.create({ url: chrome.runtime.getURL('options.html') })
})

// ── Auto-apply on tab navigation ─────────────────────────────────────────────

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Only fire once per page load, when the page starts loading
  if (changeInfo.status !== 'loading') return
  if (!tab.url) return

  let hostname: string
  try {
    hostname = new URL(tab.url).hostname
  } catch {
    return
  }

  const config = await getConfig()
  const site = config.sites.find((s) => s.hostname === hostname)
  if (!site || !site.enabled || !site.defaultProfileId) return

  // Check session flag — stop if already applied or user turned off
  const sessionState = await getTabSessionState(tabId)
  if (sessionState !== null) return

  try {
    await chrome.tabs.sendMessage(tabId, {
      action: 'applyProfile',
      profileId: site.defaultProfileId,
    } satisfies ExtensionMessage)

    await setTabSessionState(tabId, Date.now())
  } catch {
    // Content script not ready yet (e.g. extension just installed) — ignore
  }
})

// ── Popup-triggered reapply ───────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.action === 'reapply') {
    handleReapply(message.tabId, message.profileId).then(sendResponse)
    return true
  }
})

async function handleReapply(tabId: number, profileId: string): Promise<{ ok: boolean }> {
  // Clear session flag so content script can run again
  await clearTabSessionState(tabId)

  try {
    await chrome.tabs.sendMessage(tabId, {
      action: 'applyProfile',
      profileId,
    } satisfies ExtensionMessage)
    await setTabSessionState(tabId, Date.now())
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

// ── Popup "Off" handler ───────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (message: { action: 'turnOff'; tabId: number }, _sender, sendResponse) => {
    if (message.action !== 'turnOff') return
    handleTurnOff(message.tabId).then(sendResponse)
    return true
  },
)

async function handleTurnOff(tabId: number): Promise<{ ok: boolean }> {
  await setTabSessionState(tabId, 'user-off')
  try {
    await chrome.tabs.sendMessage(tabId, { action: 'clearFilters' } satisfies ExtensionMessage)
    return { ok: true }
  } catch {
    return { ok: false }
  }
}
