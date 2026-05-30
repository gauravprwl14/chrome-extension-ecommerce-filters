/**
 * Pure orchestration for the popup's "create profile from this page" flow.
 *
 * Mirrors lib/popup-init: the popup stays a thin shell; this function owns the
 * message round-trip + interpretation and NEVER throws (a missing content
 * script must surface as a friendly state, not a hang). Injected deps keep it
 * unit-testable without chrome.* or a DOM.
 */
import type { Brand, CaptureSelectionResponse } from './config'
import { reconcileCapturedBrands } from './capture'

export interface CaptureForPopupDeps {
  tabId: number
  masterBrands: Brand[]
  /** Sends the captureSelection message to the tab's content script. */
  sendCaptureMessage: (tabId: number) => Promise<CaptureSelectionResponse>
}

export type CaptureForPopupResult =
  | { kind: 'review'; matched: Brand[]; unknown: string[] }
  | { kind: 'empty' }
  | { kind: 'not-filter-page' }
  | { kind: 'error'; message: string }

export async function captureForPopup(deps: CaptureForPopupDeps): Promise<CaptureForPopupResult> {
  let response: CaptureSelectionResponse
  try {
    response = await deps.sendCaptureMessage(deps.tabId)
  } catch (err) {
    // No content script on the page (page mid-load, or not a Myntra tab).
    return { kind: 'error', message: err instanceof Error ? err.message : 'Capture failed' }
  }

  if (!response.ok) return { kind: 'error', message: response.reason }
  if (!response.isFilterPage) return { kind: 'not-filter-page' }
  if (response.brands.length === 0) return { kind: 'empty' }

  const { matched, unknown } = reconcileCapturedBrands(response.brands, deps.masterBrands)
  if (matched.length === 0 && unknown.length === 0) return { kind: 'empty' }
  return { kind: 'review', matched, unknown }
}
