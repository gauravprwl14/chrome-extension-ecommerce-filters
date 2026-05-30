import type { Brand } from '../config'
import type { SiteAdapter, ApplyResult } from './base'
import { waitForElement, pollForElement, sleep } from './base'
import { matchesBrand } from '../matching'

/**
 * AjioAdapter — modal-batched strategy, scoped to the Brands facet only.
 *
 * Page layout: Ajio renders ONE `.cat-facets` per filter group (Shop For,
 * Category, Brands, Price, Occasion, Discount Ranges, Colors, ...). EACH of
 * these has its own header toggle (`.facet-head-before[aria-label="..."]`)
 * and its own `.facet-more` button. A naïve `document.querySelector('.cat-facets .facet-more')`
 * returns the FIRST match in document order — which on the clothing page is
 * **Category**'s MORE, opening "Choose Category" instead of brands.
 *
 * EVERY selector below is scoped to the brands `.cat-facets` host via
 * `findBrandsFacetHost()` to avoid that class of cross-facet bug.
 *
 * Brand checkboxes live in two places once Brands is expanded:
 *   1. INLINE list (`.facet-body ul.rilrtl-list`) — ~5–7 most-popular brands.
 *      Each row:
 *        <div class="facet-linkfref" role="checkbox">
 *          <div class="facet-linkhead">
 *            <input type="checkbox" name="brand" value="Adidas Originals" aria-hidden="true">
 *            <label>Adidas Originals (90)</label>
 *          </div>
 *        </div>
 *      The <input> is aria-hidden — Ajio's React handler is on `.facet-linkfref`.
 *      Click that wrapper, not the input.
 *
 *   2. MORE modal (`.more-popup-container`) — opens via the brands facet's
 *      `.facet-more` button. Lists every brand A–Z. Modal row:
 *        <div class="facet-filter-modal__item facet-linkhead">
 *          <input name="brand" type="checkbox" id="modal-Timex" value="Timex">
 *        </div>
 *      Inputs here are NOT aria-hidden; checkboxes flip on click. Ajio
 *      batches every selection until the modal's "Apply" button is clicked,
 *      at which point a single navigation commits all selections.
 *
 * Strategy:
 *   - For a profile of N brands, prefer the modal: tick everything in the
 *     modal, click Apply once → single navigation, no per-click cascade.
 *   - Inline list is used only as a fast-path when MORE isn't present
 *     (rare — only for tiny brand catalogues).
 *
 * Brand matching uses `input.value` (the bare brand name without the
 * trailing " (count)").
 */
export class AjioAdapter implements SiteAdapter {
  readonly hostname = 'www.ajio.com'

  // Page-level container (any one of the filter groups). We wait for this to
  // know the filter sidebar has rendered before any other queries.
  static readonly FACET_CONTAINER_SELECTOR = '.cat-facets'

  // The brands accordion header. Targeted by aria-label — the same attribute
  // Ajio sets ("brands"). Other facets carry "category" / "shop for" / etc.
  static readonly BRAND_HEADER_TOGGLE_SELECTOR =
    '.cat-facets .facet-head-before[aria-label="brands"]'
  static readonly FACET_BODY_SELECTOR = '.facet-body'

  // Inline-list selectors — scoped within the brands host (not document-wide).
  // The naked `name="brand"` is unique to the brand facet on Ajio.
  static readonly INLINE_BRAND_INPUT_SELECTOR_LOCAL = 'input[type="checkbox"][name="brand"]'
  static readonly MORE_BTN_SELECTOR_LOCAL = '.facet-more'

  // Modal — there is only one modal at a time, so document-wide is safe here.
  static readonly MODAL_CONTAINER_SELECTOR = '.more-popup-container'
  static readonly MODAL_BRAND_INPUT_SELECTOR =
    '.more-popup-container input[type="checkbox"][name="brand"]'
  static readonly MODAL_APPLY_BTN_SELECTOR = '.more-popup-container .rilrtl-button--apply'
  // Heading of the modal — we use it to verify we opened the BRAND modal,
  // not e.g. "Choose Category". The visible heading text contains "Brands".
  static readonly MODAL_TITLE_SELECTOR =
    '.more-popup-container [aria-label*="Brand" i], .more-popup-container .facet-filter-modal__title'

  // Body-attribute tracking so clearAppliedBrands can reach modal-only brands.
  static readonly TRACK_ATTR = 'data-brandfilter-ajio-applied'

  isFilterPage(): boolean {
    return window.location.pathname.startsWith('/s/')
  }

  /**
   * Find the `.cat-facets` that hosts the BRANDS accordion. Ajio's clothing
   * page has multiple `.cat-facets` siblings; the brands one is identified
   * by the aria-label on its header toggle. Returns null if Brands isn't
   * rendered (rare — taught-site scenarios or non-listing pages).
   */
  private findBrandsFacetHost(): Element | null {
    const toggle = document.querySelector<HTMLElement>(AjioAdapter.BRAND_HEADER_TOGGLE_SELECTOR)
    return toggle?.closest('.cat-facets') ?? null
  }

  /**
   * Ajio's Brands facet can be collapsed (aria-expanded="false") in which
   * case `.facet-body` isn't rendered. Click the brands header (and ONLY the
   * brands header — see findBrandsFacetHost above) to expand, then wait for
   * the body. No-op if already expanded or if the header is absent.
   */
  async expandBrandFilter(): Promise<void> {
    const toggle = document.querySelector<HTMLElement>(AjioAdapter.BRAND_HEADER_TOGGLE_SELECTOR)
    if (!toggle) return

    const isExpanded = toggle.getAttribute('aria-expanded') === 'true'
    if (isExpanded) {
      await this.waitForBrandFacetBody(2000)
      return
    }

    toggle.click()
    await this.waitForBrandFacetBody(5000)
  }

  private async waitForBrandFacetBody(timeoutMs: number): Promise<void> {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      const host = this.findBrandsFacetHost()
      const body = host?.querySelector(AjioAdapter.FACET_BODY_SELECTOR)
      if (body) return
      await sleep(50)
    }
  }

  async waitForFilterContainer(timeoutMs = 8000): Promise<void> {
    await waitForElement(AjioAdapter.FACET_CONTAINER_SELECTOR, timeoutMs)
    await sleep(200)
  }

  async applyBrands(brands: Brand[]): Promise<ApplyResult> {
    const result: ApplyResult = { applied: [], skipped: [], notFound: [] }
    if (brands.length === 0) return result

    const brandsHost = this.findBrandsFacetHost()
    if (!brandsHost) {
      brands.forEach((b) => result.notFound.push(b.id))
      return result
    }

    // Prefer the modal — it lists every brand A–Z and commits in ONE click.
    // Fall back to the inline list only when this facet has no MORE button
    // (i.e. the entire brand catalogue fits inline).
    const moreBtn = brandsHost.querySelector<HTMLElement>(AjioAdapter.MORE_BTN_SELECTOR_LOCAL)
    if (moreBtn) {
      return this.applyViaModal(brandsHost, moreBtn, brands, result)
    }
    return this.applyViaInline(brandsHost, brands, result)
  }

  /**
   * Open the brand-facet's MORE modal, tick every matching brand checkbox,
   * then click Apply once. Single navigation. If we somehow opened the
   * wrong modal (e.g. the brands accordion was hidden and MORE belongs to
   * another facet), we detect "no input[name=brand] in modal" and bail
   * without leaving the user stranded on an unrelated picker.
   */
  private async applyViaModal(
    brandsHost: Element,
    moreBtn: HTMLElement,
    brands: Brand[],
    result: ApplyResult,
  ): Promise<ApplyResult> {
    moreBtn.click()
    const opened = await pollForElement(AjioAdapter.MODAL_CONTAINER_SELECTOR, 5000, 50)
    if (!opened) {
      brands.forEach((b) => result.notFound.push(b.id))
      return result
    }
    await sleep(200)

    // Sanity check — make sure this is the BRANDS modal, not Category etc.
    // The brand modal always contains at least one input[name="brand"].
    const allModalInputs = Array.from(
      document.querySelectorAll<HTMLInputElement>(AjioAdapter.MODAL_BRAND_INPUT_SELECTOR),
    )
    if (allModalInputs.length === 0) {
      // Wrong modal opened (or brand list empty). Close it so the user
      // isn't stranded on the wrong picker, and mark everything notFound.
      this.dismissModal()
      brands.forEach((b) => result.notFound.push(b.id))
      // As a courtesy, also try the inline list — even if MORE was the
      // wrong button, the inline brand inputs in the brands facet are still
      // valid and might cover some requested brands.
      return this.applyViaInline(brandsHost, brands, result, /* keepNotFound */ true)
    }

    const toApply: HTMLInputElement[] = []
    for (const brand of brands) {
      const input = allModalInputs.find((i) => matchesBrand(brand, i.value))
      if (!input) {
        result.notFound.push(brand.id)
        continue
      }
      if (input.checked) {
        result.skipped.push(brand.id)
        continue
      }
      input.click()
      await sleep(20)
      if (input.checked) {
        toApply.push(input)
        this.trackAppliedValue(input.value)
        result.applied.push(brand.id)
      } else {
        result.notFound.push(brand.id)
      }
    }

    if (toApply.length > 0) {
      const applyBtn = document.querySelector<HTMLElement>(AjioAdapter.MODAL_APPLY_BTN_SELECTOR)
      applyBtn?.click()
      await sleep(200) // let the navigation start
    } else {
      this.dismissModal()
    }
    return result
  }

  /**
   * Inline-only fallback when the brands facet has no MORE modal (rare). For
   * each requested brand, find its checkbox in the inline list and click the
   * React-bound wrapper (`.facet-linkfref`).
   *
   * `keepNotFound=true` is used when we got here as a courtesy pass after a
   * wrong-modal bail — the requested brands have already been pushed into
   * `result.notFound`, so we only *upgrade* matches into `applied`.
   */
  private async applyViaInline(
    brandsHost: Element,
    brands: Brand[],
    result: ApplyResult,
    keepNotFound = false,
  ): Promise<ApplyResult> {
    const inputs = Array.from(
      brandsHost.querySelectorAll<HTMLInputElement>(AjioAdapter.INLINE_BRAND_INPUT_SELECTOR_LOCAL),
    )

    for (const brand of brands) {
      const input = inputs.find((i) => matchesBrand(brand, i.value))
      if (!input) {
        if (!keepNotFound) result.notFound.push(brand.id)
        continue
      }
      if (input.checked) {
        // Already applied — upgrade from notFound if courtesy pass.
        removeFromList(result.notFound, brand.id)
        if (!result.skipped.includes(brand.id)) result.skipped.push(brand.id)
        continue
      }
      const clickTarget =
        input.closest<HTMLElement>('.facet-linkfref') ??
        input.closest<HTMLElement>('label') ??
        (input as HTMLElement)
      clickTarget.click()
      await sleep(50)
      if (input.checked) {
        input.setAttribute('data-brandfilter', 'applied')
        this.trackAppliedValue(input.value)
        removeFromList(result.notFound, brand.id)
        if (!result.applied.includes(brand.id)) result.applied.push(brand.id)
      } else if (!keepNotFound && !result.notFound.includes(brand.id)) {
        result.notFound.push(brand.id)
      }
    }
    return result
  }

  /** Best-effort close of any open MORE popup. */
  private dismissModal(): void {
    const closeBtn = document.querySelector<HTMLElement>(
      '.more-popup-container .ic-close, .more-popup-container [aria-label="close" i]',
    )
    if (closeBtn) {
      closeBtn.click()
      return
    }
    // Last resort: simulate Escape (Ajio's modals respond to it)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
  }

  /**
   * Read the brands the user has currently selected on this Ajio listing page.
   *
   * Strategy: ensure the brands accordion is expanded (it may be collapsed on
   * page load), then scan the inline facet list for checked brand checkboxes.
   * Ajio always renders the user's active filter selections as checked
   * checkboxes in the inline brand list, so this captures every currently-
   * applied brand without opening the MORE modal (avoiding a side-effect).
   */
  async readSelectedBrands(): Promise<string[]> {
    // Capture is triggered after the user has already interacted with the page
    // (content script runs at document_idle). If the filter sidebar isn't in
    // the DOM yet, return [] immediately — no point waiting.
    if (!document.querySelector(AjioAdapter.FACET_CONTAINER_SELECTOR)) return []
    // Expand the brands accordion if collapsed so inline inputs are rendered.
    await this.expandBrandFilter()
    const brandsHost = this.findBrandsFacetHost()
    if (!brandsHost) return []
    const inputs = Array.from(
      brandsHost.querySelectorAll<HTMLInputElement>(AjioAdapter.INLINE_BRAND_INPUT_SELECTOR_LOCAL),
    )
    return inputs
      .filter((i) => i.checked)
      .map((i) => i.value)
      .filter(Boolean)
  }

  async clearAppliedBrands(): Promise<void> {
    const brandsHost = this.findBrandsFacetHost()

    // Pass 1 — anything still visible in the inline brands list with our marker
    if (brandsHost) {
      brandsHost
        .querySelectorAll<HTMLInputElement>('[data-brandfilter="applied"]')
        .forEach((cb) => {
          if (cb.checked) {
            const target =
              cb.closest<HTMLElement>('.facet-linkfref') ??
              cb.closest<HTMLElement>('label') ??
              (cb as HTMLElement)
            target.click()
          }
          cb.removeAttribute('data-brandfilter')
        })
    }

    // Pass 2 — modal-applied brands. Re-open MORE, untick by tracked value,
    // re-Apply. Scoped to the brands facet so we don't accidentally open
    // some other facet's MORE.
    const tracked = this.getTrackedValues()
    if (tracked.length === 0 || !brandsHost) {
      this.clearTracking()
      return
    }

    const moreBtn = brandsHost.querySelector<HTMLElement>(AjioAdapter.MORE_BTN_SELECTOR_LOCAL)
    if (!moreBtn) {
      this.clearTracking()
      return
    }
    moreBtn.click()
    const opened = await pollForElement(AjioAdapter.MODAL_CONTAINER_SELECTOR, 5000, 50)
    if (!opened) {
      this.clearTracking()
      return
    }
    let toggled = 0
    for (const value of tracked) {
      const cb = document.querySelector<HTMLInputElement>(
        `${AjioAdapter.MODAL_BRAND_INPUT_SELECTOR}[value="${cssEscape(value)}"]`,
      )
      if (cb?.checked) {
        cb.click()
        toggled += 1
        await sleep(20)
      }
    }
    if (toggled > 0) {
      document.querySelector<HTMLElement>(AjioAdapter.MODAL_APPLY_BTN_SELECTOR)?.click()
      await sleep(200)
    } else {
      this.dismissModal()
    }
    this.clearTracking()
  }

  // ── tracking helpers (survive modal close + page rerender) ───────────────
  private trackAppliedValue(value: string): void {
    const existing = this.getTrackedValues()
    if (!existing.includes(value)) {
      existing.push(value)
      // Store on document.body (not on the modal element) because React unmounts
      // the modal DOM node after Apply navigates, but body persists for the page lifetime.
      // clearAppliedBrands() reads this to know which modal brands to untick on "Off".
      document.body.setAttribute(AjioAdapter.TRACK_ATTR, JSON.stringify(existing))
    }
  }

  private getTrackedValues(): string[] {
    const raw = document.body.getAttribute(AjioAdapter.TRACK_ATTR)
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw) as unknown
      return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
    } catch {
      return []
    }
  }

  private clearTracking(): void {
    document.body.removeAttribute(AjioAdapter.TRACK_ATTR)
  }
}

function cssEscape(value: string): string {
  return value.replace(/(["\\])/g, '\\$1')
}

function removeFromList(list: string[], value: string): void {
  const idx = list.indexOf(value)
  if (idx >= 0) list.splice(idx, 1)
}
