import type { ExtensionMessage, Brand } from './lib/config'
import {
  getConfig,
  setConfig,
  getTabSessionState,
  setTabSessionState,
  clearTabSessionState,
} from './lib/storage'
import defaultBrands from './assets/default-brands.json'
import { WATCHES_PROFILE, bootstrapConfig } from './lib/seed'
import { handleAutoApply, handleReapply, handleTurnOff } from './lib/auto-apply'

const SEED_BRANDS = defaultBrands as Brand[]
const SEED_PROFILES = [WATCHES_PROFILE]

// ── Dependencies for the orchestration functions ─────────────────────────────

const orchestrationDeps = {
  getConfig,
  getTabSession: getTabSessionState,
  setTabSession: setTabSessionState,
  clearTabSession: clearTabSessionState,
  sendToTab: (tabId: number, msg: ExtensionMessage) => chrome.tabs.sendMessage(tabId, msg),
  now: () => Date.now(),
}

// ── Bootstrap ────────────────────────────────────────────────────────────────
//
// IMPORTANT: bootstrap is called at MODULE LOAD time (every SW wake) — not
// only from onInstalled/onStartup. Neither of those fires on
// `chrome://extensions → Reload`, which is the canonical dev-iteration path.

async function runBootstrap(opts: { openOptionsOnFirstRun: boolean }): Promise<void> {
  const result = await bootstrapConfig(SEED_BRANDS, SEED_PROFILES, getConfig, setConfig)
  if (result.wasFirstRun && opts.openOptionsOnFirstRun) {
    chrome.tabs.create({ url: chrome.runtime.getURL('options.html') })
  }
}

void runBootstrap({ openOptionsOnFirstRun: false })
chrome.runtime.onInstalled.addListener(({ reason }) => {
  void runBootstrap({ openOptionsOnFirstRun: reason === 'install' })
})
chrome.runtime.onStartup.addListener(() => {
  void runBootstrap({ openOptionsOnFirstRun: false })
})

// ── Auto-apply on tab navigation ─────────────────────────────────────────────

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'loading') return
  if (!tab.url) return

  let hostname: string
  try {
    hostname = new URL(tab.url).hostname
  } catch {
    return
  }

  await handleAutoApply(tabId, hostname, orchestrationDeps)
})

// ── Popup-triggered reapply ───────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.action === 'reapply') {
    handleReapply(message.tabId, message.profileId, orchestrationDeps).then(sendResponse)
    return true
  }
})

// ── Popup "Off" handler ───────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (message: { action: 'turnOff'; tabId: number }, _sender, sendResponse) => {
    if (message.action !== 'turnOff') return
    handleTurnOff(message.tabId, orchestrationDeps).then(sendResponse)
    return true
  },
)
