import type { PlasmoCSConfig } from 'plasmo'
import { getConfig, setConfig } from '../lib/storage'
import type { Site } from '../lib/config'

/**
 * Teach mode content script. Loaded on a curated list of e-commerce hosts so
 * the extension does NOT inject anything on unrelated sites (mail, banking,
 * video streaming, etc.). Adapter sites (Myntra, Ajio) already have their own
 * dedicated content scripts; this script handles teach mode for the rest.
 *
 * The script is dormant — it only adds a message listener and does NOT touch
 * the page DOM, styles, or cursor unless the user explicitly triggers teach
 * mode from the popup (which sends `{ action: 'startTeach' }`).
 */
export const config: PlasmoCSConfig = {
  matches: [
    'https://*.tatacliq.com/*',
    'https://*.flipkart.com/*',
    'https://*.amazon.in/*',
    'https://*.nykaafashion.com/*',
    'https://*.snapdeal.com/*',
  ],
  run_at: 'document_idle',
}

let teachModeActive = false

chrome.runtime.onMessage.addListener(
  (message: { action: string; defaultProfileId?: string }, _sender, sendResponse) => {
    if (message.action === 'startTeach') {
      startTeachMode(message.defaultProfileId ?? '')
      sendResponse({ ok: true })
    }
  },
)

function startTeachMode(defaultProfileId: string) {
  if (teachModeActive) return
  teachModeActive = true

  // Visual overlay: blue border + cursor crosshair
  document.body.style.cursor = 'crosshair'
  const overlay = document.createElement('div')
  overlay.id = 'brandfilter-teach-overlay'
  overlay.style.cssText = `
    position: fixed; inset: 0; pointer-events: none; z-index: 999999;
    box-shadow: inset 0 0 0 3px #6366f1;
  `
  document.body.appendChild(overlay)

  // Instruction tooltip
  const tooltip = document.createElement('div')
  tooltip.id = 'brandfilter-teach-tooltip'
  tooltip.style.cssText = `
    position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
    background: #1e293b; color: #e2e8f0; padding: 10px 16px; border-radius: 8px;
    font-size: 13px; font-family: -apple-system, sans-serif; z-index: 1000000;
    border: 1px solid #6366f1; box-shadow: 0 4px 20px rgba(0,0,0,0.4);
  `
  tooltip.textContent = '🎯 Click on any brand name in the filter panel'
  document.body.appendChild(tooltip)

  document.addEventListener('click', onElementClick, { capture: true, once: false })

  function onElementClick(e: MouseEvent) {
    e.preventDefault()
    e.stopPropagation()

    const target = e.target as Element
    const selector = inferSelector(target)

    showConfirmToast(selector, defaultProfileId, () => {
      document.removeEventListener('click', onElementClick, { capture: true })
      exitTeachMode()
    })
  }
}

function inferSelector(el: Element): string {
  // Walk up to find a container that holds multiple similar elements (filter list)
  let current: Element | null = el
  for (let i = 0; i < 5; i++) {
    if (!current) break
    const parent: Element | null = current.parentElement
    if (!parent) break
    const siblings = parent.querySelectorAll(current.tagName.toLowerCase())
    if (siblings.length >= 3) {
      const containerPath = getSimplePath(parent)
      return `${containerPath} input[type="checkbox"]`
    }
    current = parent
  }
  return el.tagName.toLowerCase()
}

function getSimplePath(el: Element): string {
  if (el.id) return `#${el.id}`
  if (el.className) {
    const firstClass = el.className.toString().trim().split(/\s+/)[0]
    if (firstClass) return `.${firstClass}`
  }
  return el.tagName.toLowerCase()
}

function showConfirmToast(selector: string, defaultProfileId: string, onDone: () => void) {
  const existing = document.getElementById('brandfilter-confirm-toast')
  existing?.remove()

  const toast = document.createElement('div')
  toast.id = 'brandfilter-confirm-toast'
  toast.style.cssText = `
    position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
    background: #1e293b; color: #e2e8f0; padding: 14px 18px; border-radius: 10px;
    font-family: -apple-system, sans-serif; z-index: 1000001;
    border: 1px solid #6366f1; box-shadow: 0 8px 32px rgba(0,0,0,0.5); min-width: 320px;
  `

  const selectorLabel = document.createElement('div')
  selectorLabel.style.cssText = 'font-size:12px;margin-bottom:8px;'
  selectorLabel.textContent = 'Found selector:'

  const selectorCode = document.createElement('code')
  selectorCode.style.cssText =
    'font-size:11px;color:#a5b4fc;background:#0f172a;padding:4px 8px;border-radius:4px;'
  selectorCode.textContent = selector // textContent is XSS-safe

  const btnRow = document.createElement('div')
  btnRow.style.cssText = 'display:flex;gap:8px;margin-top:12px;'

  const confirmBtn = document.createElement('button')
  confirmBtn.id = 'bf-confirm'
  confirmBtn.style.cssText =
    'flex:1;background:#6366f1;border:none;color:white;padding:8px;border-radius:6px;font-size:12px;cursor:pointer;font-weight:600;'
  confirmBtn.textContent = '✓ Confirm'

  const retryBtn = document.createElement('button')
  retryBtn.id = 'bf-retry'
  retryBtn.style.cssText =
    'background:#1e293b;border:1px solid #334155;color:#94a3b8;padding:8px 12px;border-radius:6px;font-size:12px;cursor:pointer;'
  retryBtn.textContent = 'Try again'

  btnRow.appendChild(confirmBtn)
  btnRow.appendChild(retryBtn)
  toast.appendChild(selectorLabel)
  toast.appendChild(selectorCode)
  toast.appendChild(btnRow)

  document.body.appendChild(toast)

  document.getElementById('bf-confirm')?.addEventListener('click', async () => {
    await saveCustomSite(selector, defaultProfileId)
    toast.remove()
    onDone()
  })

  document.getElementById('bf-retry')?.addEventListener('click', () => {
    toast.remove()
  })
}

async function saveCustomSite(selector: string, defaultProfileId: string) {
  const hostname = window.location.hostname
  const cfg = await getConfig()
  const existingSite = cfg.sites.find((s) => s.hostname === hostname)

  const newSite: Site = existingSite
    ? { ...existingSite, customSelector: selector, defaultProfileId }
    : {
        id: hostname.replace(/\./g, '-'),
        hostname,
        defaultProfileId,
        enabled: true,
        customSelector: selector,
      }

  const sites = existingSite
    ? cfg.sites.map((s) => (s.hostname === hostname ? newSite : s))
    : [...cfg.sites, newSite]

  await setConfig({ ...cfg, sites })
}

function exitTeachMode() {
  teachModeActive = false
  document.body.style.cursor = ''
  document.getElementById('brandfilter-teach-overlay')?.remove()
  document.getElementById('brandfilter-teach-tooltip')?.remove()
}
