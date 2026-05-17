import type { Brand } from '../config'

/** Result returned by applyBrands(). */
export interface ApplyResult {
  /** Brand ids whose checkboxes were successfully checked. */
  applied: string[]
  /** Brand ids whose checkboxes were already checked — skipped to avoid toggling off. */
  skipped: string[]
  /** Brand ids with no matching checkbox found on this page. */
  notFound: string[]
}

/**
 * Interface all site adapters must implement.
 * Each adapter is responsible for one hostname.
 */
export interface SiteAdapter {
  readonly hostname: string

  /** Returns true only on category/listing pages where brand filters exist. */
  isFilterPage(): boolean

  /**
   * Expands any collapsed filter accordions that contain brand checkboxes.
   * No-op for adapters where brand filters are always visible (e.g. Myntra).
   */
  expandBrandFilter(): Promise<void>

  /**
   * Resolves when the brand filter container is present in the DOM.
   * Rejects with Error('timeout') after timeoutMs (default 8000ms).
   */
  waitForFilterContainer(timeoutMs?: number): Promise<void>

  /**
   * Applies the given brands by checking their filter checkboxes.
   * - Already-checked checkboxes are recorded in skipped (not toggled off).
   * - Checkboxes that were checked are marked with data-brandfilter="applied".
   * - Brands with no matching checkbox are recorded in notFound.
   */
  applyBrands(brands: Brand[]): Promise<ApplyResult>

  /**
   * Unchecks all checkboxes that have data-brandfilter="applied".
   * Called when user clicks "Off" in the popup.
   */
  clearAppliedBrands(): Promise<void>
}

/**
 * Waits for a DOM element matching selector to appear.
 * Returns the element, or rejects after timeoutMs.
 */
export function waitForElement(selector: string, timeoutMs = 8000): Promise<Element> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(selector)
    if (existing) {
      resolve(existing)
      return
    }

    const timer = setTimeout(() => {
      observer.disconnect()
      reject(new Error(`timeout waiting for "${selector}"`))
    }, timeoutMs)

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector)
      if (el) {
        clearTimeout(timer)
        observer.disconnect()
        resolve(el)
      }
    })

    observer.observe(document.body, { childList: true, subtree: true })
  })
}

/**
 * Polls for an element to be present, with a short backoff.
 * Designed for the case where a React-driven picker is mid-rerender and the
 * container disappears for a few frames between commits.
 *
 * Returns the element, or null if it didn't appear within `timeoutMs`.
 */
export async function pollForElement(
  selector: string,
  timeoutMs = 2000,
  intervalMs = 50,
): Promise<Element | null> {
  const start = Date.now()
  // Fast path
  const immediate = document.querySelector(selector)
  if (immediate) return immediate

  while (Date.now() - start < timeoutMs) {
    await sleep(intervalMs)
    const el = document.querySelector(selector)
    if (el) return el
  }
  return null
}

/** Sleep for ms milliseconds. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
