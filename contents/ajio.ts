import type { PlasmoCSConfig } from 'plasmo'
import type { ExtensionMessage, ApplyMessage } from '../lib/config'
import { getConfig } from '../lib/storage'
import { AjioAdapter } from '../lib/adapters/ajio'

export const config: PlasmoCSConfig = {
  matches: ['https://www.ajio.com/*'],
  run_at: 'document_idle',
}

const adapter = new AjioAdapter()

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.action === 'applyProfile') {
    handleApply(message).then(sendResponse)
    return true
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
    await adapter.expandBrandFilter() // expands Brands accordion + waits 300ms
    const cfg = await getConfig()
    const profile = cfg.profiles.find((p) => p.id === message.profileId)
    if (!profile) return { ok: false }

    const brands = cfg.masterBrands.filter((b) => profile.brandIds.includes(b.id))
    await adapter.applyBrands(brands)
    return { ok: true }
  } catch {
    return { ok: false }
  }
}
