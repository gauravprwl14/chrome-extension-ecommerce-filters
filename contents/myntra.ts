import type { PlasmoCSConfig } from 'plasmo'
import type { ExtensionMessage, ApplyMessage } from '../lib/config'
import { getConfig } from '../lib/storage'
import { MyntraAdapter } from '../lib/adapters/myntra'

export const config: PlasmoCSConfig = {
  matches: ['https://www.myntra.com/*'],
  run_at: 'document_idle',
}

const adapter = new MyntraAdapter()

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.action === 'applyProfile') {
    handleApply(message).then(sendResponse)
    return true // keep channel open for async response
  }
  if (message.action === 'clearFilters') {
    adapter.clearAppliedBrands().then(() => sendResponse({ ok: true }))
    return true
  }
})

async function handleApply(message: ApplyMessage): Promise<{ ok: boolean }> {
  if (!adapter.isFilterPage()) return { ok: false }

  try {
    await adapter.waitForFilterContainer()
    await adapter.expandBrandFilter()

    const cfg = await getConfig()
    const profile = cfg.profiles.find((p) => p.id === message.profileId)
    if (!profile) return { ok: false }

    const brands = cfg.masterBrands.filter((b) => profile.brandIds.includes(b.id))
    await adapter.applyBrands(brands)
    return { ok: true }
  } catch {
    // timeout or DOM error — fail silently
    return { ok: false }
  }
}
