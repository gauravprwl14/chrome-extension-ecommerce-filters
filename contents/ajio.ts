import type { PlasmoCSConfig } from 'plasmo'
import type { ExtensionMessage, ApplyMessage } from '../lib/config'
import { getConfig } from '../lib/storage'
import { AjioAdapter } from '../lib/adapters/ajio'

export const config: PlasmoCSConfig = {
  matches: ['https://www.ajio.com/*'],
  run_at: 'document_idle',
}

const adapter = new AjioAdapter()

/**
 * ACK synchronously before any work. See contents/myntra.ts for the full
 * rationale — Ajio also navigates (once, when the modal's "Apply" button
 * is clicked) which kills the content script before applyBrands returns.
 */
chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.action === 'applyProfile') {
    sendResponse({ ok: true })
    void handleApply(message)
    return false
  }
  if (message.action === 'clearFilters') {
    sendResponse({ ok: true })
    void adapter.clearAppliedBrands()
    return false
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
    console.warn('[BrandFilter/Ajio] applyBrands failed:', err)
  }
}
