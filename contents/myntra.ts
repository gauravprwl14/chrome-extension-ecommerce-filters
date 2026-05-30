import type { PlasmoCSConfig } from 'plasmo'
import type { ExtensionMessage, ApplyMessage } from '../lib/config'
import { getConfig } from '../lib/storage'
import { MyntraAdapter } from '../lib/adapters/myntra'
import { captureResponse } from '../lib/capture'

export const config: PlasmoCSConfig = {
  matches: ['https://www.myntra.com/*'],
  run_at: 'document_idle',
}

const adapter = new MyntraAdapter()

/**
 * CRITICAL: ACK the message synchronously, BEFORE doing any work.
 *
 * Myntra's URL-driven filter system means `adapter.applyBrands()` will
 * end with `window.location.assign()` — the content script is destroyed
 * by that navigation. If we waited until the adapter finished before
 * calling `sendResponse()`, the message port would close during the
 * navigation and `chrome.tabs.sendMessage` in the background would
 * reject. The background's error-recovery path used to clear the
 * session flag, which then unblocked the auto-apply listener on the
 * post-navigation `onUpdated` → fresh adapter run → INFINITE LOOP.
 *
 * Acknowledging first decouples the success of the message round-trip
 * from the success of the apply work. The background's session flag
 * gets stamped reliably, the post-navigation auto-apply skips, and
 * any adapter failure becomes a no-op (the user can retry from popup).
 */
chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.action === 'applyProfile') {
    sendResponse({ ok: true })
    void handleApply(message) // fire-and-forget — page may navigate
    return false
  }
  if (message.action === 'clearFilters') {
    sendResponse({ ok: true })
    void adapter.clearAppliedBrands()
    return false
  }
  if (message.action === 'captureSelection') {
    // INVERSE of applyProfile (see Core Rule #4): this is read-only and never
    // navigates, so we must keep the channel open and respond AFTER awaiting
    // the read. `return true` tells Chrome to expect an async sendResponse.
    captureResponse(adapter).then(sendResponse)
    return true
  }
})

async function handleApply(message: ApplyMessage): Promise<void> {
  if (!adapter.isFilterPage()) return

  try {
    await adapter.waitForFilterContainer()
    await adapter.expandBrandFilter()

    const cfg = await getConfig()
    const profile = cfg.profiles.find((p) => p.id === message.profileId)
    if (!profile) return

    const brands = cfg.masterBrands.filter((b) => profile.brandIds.includes(b.id))
    await adapter.applyBrands(brands)
  } catch (err) {
    console.warn('[BrandFilter/Myntra] applyBrands failed:', err)
  }
}
