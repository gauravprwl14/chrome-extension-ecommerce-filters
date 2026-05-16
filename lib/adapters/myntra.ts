import type { Brand } from '../config'
import type { SiteAdapter, ApplyResult } from './base'
import { waitForElement, sleep } from './base'
import { matchesBrand } from '../matching'

export class MyntraAdapter implements SiteAdapter {
  readonly hostname = 'www.myntra.com'

  /**
   * CSS selector for the brand filter container.
   * TODO: Confirm by inspecting DevTools on https://www.myntra.com/mens-watches
   * Look for the element wrapping all brand filter checkboxes/labels.
   */
  static readonly FILTER_CONTAINER_SELECTOR = '.filter-main-wrapper'

  /**
   * CSS selector for individual brand filter label elements inside the container.
   * TODO: Confirm via DevTools — each label should contain an <input type="checkbox">
   * and a text node with the brand name.
   */
  static readonly BRAND_LABEL_SELECTOR = '.filter-name'

  private readonly NON_LISTING_PREFIXES = [
    '/login',
    '/cart',
    '/checkout',
    '/wishlist',
    '/profile',
    '/gateway',
    '/my-account',
    '/offers',
  ]

  /** Listing pages: not a product page (/buy), not a known non-listing prefix. */
  isFilterPage(): boolean {
    const path = window.location.pathname
    if (path.includes('/buy')) return false
    if (this.NON_LISTING_PREFIXES.some((p) => path.startsWith(p))) return false
    return path.split('/').filter(Boolean).length >= 1
  }

  /** Myntra brand filters are always visible in the sidebar — no expansion needed. */
  async expandBrandFilter(): Promise<void> {
    // no-op
  }

  async waitForFilterContainer(timeoutMs = 8000): Promise<void> {
    await waitForElement(MyntraAdapter.FILTER_CONTAINER_SELECTOR, timeoutMs)
    // Extra debounce for lazy-rendered filter values
    await sleep(300)
  }

  async applyBrands(brands: Brand[]): Promise<ApplyResult> {
    const result: ApplyResult = { applied: [], skipped: [], notFound: [] }

    const container = document.querySelector(MyntraAdapter.FILTER_CONTAINER_SELECTOR)
    if (!container) {
      brands.forEach((b) => result.notFound.push(b.id))
      return result
    }

    const labels = Array.from(
      container.querySelectorAll<HTMLElement>(MyntraAdapter.BRAND_LABEL_SELECTOR),
    )
    const labelTexts = labels.map((el) => el.textContent?.trim() ?? '')

    for (const brand of brands) {
      const idx = labelTexts.findIndex((text) => matchesBrand(brand, text))
      if (idx === -1) {
        result.notFound.push(brand.id)
        continue
      }

      const label = labels[idx]
      const checkbox = label
        ?.closest('label')
        ?.querySelector<HTMLInputElement>('input[type="checkbox"]')

      if (!checkbox) {
        result.notFound.push(brand.id)
        continue
      }

      if (checkbox.checked) {
        result.skipped.push(brand.id)
        continue
      }

      checkbox.click()

      // Verify checkbox state after click (may not flip synchronously on React-rendered pages)
      if (checkbox.checked) {
        checkbox.setAttribute('data-brandfilter', 'applied')
        result.applied.push(brand.id)
      } else {
        result.notFound.push(brand.id)
      }
    }

    return result
  }

  async clearAppliedBrands(): Promise<void> {
    const applied = document.querySelectorAll<HTMLInputElement>(`[data-brandfilter="applied"]`)
    applied.forEach((checkbox) => {
      if (checkbox.checked) checkbox.click()
      checkbox.removeAttribute('data-brandfilter')
    })
  }
}
