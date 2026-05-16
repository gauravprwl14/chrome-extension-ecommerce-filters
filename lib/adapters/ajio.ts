import type { Brand } from '../config'
import type { SiteAdapter, ApplyResult } from './base'
import { waitForElement, sleep } from './base'
import { matchesBrand } from '../matching'

export class AjioAdapter implements SiteAdapter {
  readonly hostname = 'www.ajio.com'

  /**
   * TODO: Confirm all selectors via DevTools on https://www.ajio.com/s/watches-168315
   * Open DevTools → Elements → inspect the left "Refine By" panel.
   */
  static readonly FACET_CONTAINER_SELECTOR = '.plp-facets'
  static readonly BRAND_FACET_TITLE_SELECTOR = '.facet-title'
  static readonly EXPAND_BTN_SELECTOR = '.facet-expand-btn'
  static readonly BRAND_CHECKBOX_CONTAINER_SELECTOR = '.brand-facet-values'
  static readonly BRAND_LABEL_SELECTOR = '.facet-label'

  isFilterPage(): boolean {
    return window.location.pathname.startsWith('/s/')
  }

  /**
   * Ajio's "Brands" section is collapsed behind a "+" button.
   * Click the expand button and wait 300ms for checkboxes to render.
   */
  async expandBrandFilter(): Promise<void> {
    const expandBtn = document.querySelector<HTMLElement>(AjioAdapter.EXPAND_BTN_SELECTOR)
    if (expandBtn) {
      expandBtn.click()
      await sleep(300)
    }
  }

  async waitForFilterContainer(timeoutMs = 8000): Promise<void> {
    await waitForElement(AjioAdapter.FACET_CONTAINER_SELECTOR, timeoutMs)
    await sleep(300)
  }

  async applyBrands(brands: Brand[]): Promise<ApplyResult> {
    const result: ApplyResult = { applied: [], skipped: [], notFound: [] }

    const container = document.querySelector(AjioAdapter.BRAND_CHECKBOX_CONTAINER_SELECTOR)
    if (!container) {
      brands.forEach((b) => result.notFound.push(b.id))
      return result
    }

    const labels = Array.from(
      container.querySelectorAll<HTMLElement>(AjioAdapter.BRAND_LABEL_SELECTOR),
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
      await sleep(50) // allow React to process the click event before reading state
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
    document.querySelectorAll<HTMLInputElement>('[data-brandfilter="applied"]').forEach((cb) => {
      if (cb.checked) cb.click()
      cb.removeAttribute('data-brandfilter')
    })
  }
}
