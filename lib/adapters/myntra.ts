import type { Brand } from '../config'
import type { SiteAdapter, ApplyResult } from './base'
import { waitForElement, sleep } from './base'
import { matchesBrand } from '../matching'

/**
 * MyntraAdapter — URL-first strategy.
 *
 * Why URL-first instead of clicking checkboxes:
 *   Myntra is URL-driven. Every brand filter is encoded into the query
 *   string as `?f=Brand:Name1,Name2,...` (with `::` separating different
 *   facets like `Brand:`, `Price:`, `Color:`). Clicking a checkbox is just
 *   Myntra's UI sugar for navigating to that URL. Each click triggers a
 *   real top-level navigation — the content script that's mid-iteration
 *   gets destroyed before it can click the next brand.
 *
 *   The original click-per-brand implementation only ever applied 1–2
 *   brands before the first click navigated and killed the script.
 *
 * The strategy now:
 *   1. Read the canonical brand names visible in the sidebar AND the
 *      "+ N more" directory modal (single non-navigating click to open).
 *   2. Match every requested profile brand against those names.
 *   3. Build a new URL that adds the matched brand names to the existing
 *      `Brand:` facet (preserving any user-set Price/Color/etc. facets).
 *   4. Perform ONE `location.assign()` to navigate. Myntra renders the
 *      full filtered listing on the next page-load.
 *
 * Trade-off: brands the user has typed by name but that don't exist in
 * Myntra's catalogue at all are reported as `notFound` (we can't see them
 * in any list). The previous implementation reported the same thing — it
 * just took ~3 minutes to do so.
 */
export class MyntraAdapter implements SiteAdapter {
  readonly hostname = 'www.myntra.com'

  // DOM selectors — confirmed against live Myntra (Mar 2026).
  static readonly BRAND_LIST_SELECTOR = 'ul.brand-list'
  static readonly BRAND_MORE_BTN_SELECTOR = '.brand-more'
  static readonly DIRECTORY_LIST_SELECTOR = '.FilterDirectory-list'
  static readonly DIRECTORY_CLOSE_SELECTOR = '.FilterDirectory-close'
  static readonly CHECKBOX_SELECTOR = 'input[type="checkbox"]'

  // Myntra filter-URL grammar:
  //   ?f=Brand:Tommy Hilfiger,Levis::Price:500-1000::Color:Black
  // ↑ FACET_PARAM       ↑ BRAND_PREFIX        ↑ FACET_SEPARATOR  ↑ FACET_SEPARATOR
  // Values within a facet are joined by VALUE_SEPARATOR.
  static readonly URL_FACET_PARAM = 'f'
  static readonly URL_FACET_SEPARATOR = '::'
  static readonly URL_BRAND_FACET_PREFIX = 'Brand:'
  static readonly URL_BRAND_VALUE_SEPARATOR = ','

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

  isFilterPage(): boolean {
    const path = window.location.pathname
    // /buy/... is the product-detail page (PDP) — no brand sidebar there.
    if (path.includes('/buy')) return false
    // Skip non-product areas (cart, login, wishlist, etc.).
    if (this.NON_LISTING_PREFIXES.some((p) => path.startsWith(p))) return false
    // The Myntra home page is just "/" (0 segments after split+filter).
    // Any listing page — /tshirts, /men-shirts, /brands/levis — has ≥ 1 segment.
    return path.split('/').filter(Boolean).length >= 1
  }

  /** No-op for Myntra — the brand sidebar is visible by default. */
  async expandBrandFilter(): Promise<void> {
    // intentional no-op
  }

  async waitForFilterContainer(timeoutMs = 8000): Promise<void> {
    await waitForElement(MyntraAdapter.BRAND_LIST_SELECTOR, timeoutMs)
    // The <ul> mounts before React populates its <li> children.
    // 200ms lets the first render batch flush before we query checkboxes.
    await sleep(200)
  }

  async applyBrands(brands: Brand[]): Promise<ApplyResult> {
    const result: ApplyResult = { applied: [], skipped: [], notFound: [] }
    if (brands.length === 0) return result

    // Step 1 — read what's visible in the sidebar.
    const sidebarNames = this.collectBrandValues(MyntraAdapter.BRAND_LIST_SELECTOR)

    // Step 2 — if any requested brand isn't in the sidebar, open the
    // "+ N more" directory once (a non-navigating UI click) to learn the
    // rest of Myntra's canonical brand names.
    const missingFromSidebar = brands.some((b) => !sidebarNames.some((v) => matchesBrand(b, v)))
    let modalNames: string[] = []
    let openedModal = false
    if (missingFromSidebar) {
      openedModal = await this.openDirectoryModal()
      if (openedModal) {
        modalNames = this.collectBrandValues(MyntraAdapter.DIRECTORY_LIST_SELECTOR)
      }
    }

    const allCanonicalNames = Array.from(new Set([...sidebarNames, ...modalNames]))

    // Step 3 — for each requested brand, find its canonical Myntra name.
    // Brand id ≠ Myntra name; we match by Brand.name / variants against
    // the `input.value` strings we collected.
    const matchedCanonical: string[] = []
    const currentBrandsInUrl = this.parseBrandsFromUrl(window.location.href)
    const currentLower = new Set(currentBrandsInUrl.map((b) => b.toLowerCase()))

    for (const brand of brands) {
      const canonical = allCanonicalNames.find((v) => matchesBrand(brand, v))
      if (!canonical) {
        result.notFound.push(brand.id)
        continue
      }
      if (currentLower.has(canonical.toLowerCase())) {
        // Already in the URL — don't re-add (it's a duplicate facet value)
        result.skipped.push(brand.id)
        continue
      }
      matchedCanonical.push(canonical)
      result.applied.push(brand.id)
    }

    // Step 4 — close the directory if we opened it. (Best-effort; the
    // upcoming navigation will tear it down anyway.)
    if (openedModal) {
      document.querySelector<HTMLElement>(MyntraAdapter.DIRECTORY_CLOSE_SELECTOR)?.click()
    }

    // Step 5 — if nothing new to apply, no navigation needed.
    if (matchedCanonical.length === 0) return result

    // Step 6 — additive: append new brands to whatever is in the URL,
    // preserving every other facet the user has set.
    const newBrandList = uniqueCaseInsensitive([...currentBrandsInUrl, ...matchedCanonical])
    const newUrl = this.buildUrlWithBrands(window.location.href, newBrandList)
    if (newUrl !== window.location.href) {
      // location.assign() (as opposed to .href = ...) is explicit and
      // testable — adapters can be unit-tested by stubbing a fake location.
      window.location.assign(newUrl)
    }
    return result
  }

  async clearAppliedBrands(): Promise<void> {
    // Strip the Brand facet entirely, preserve all other facets.
    const newUrl = this.buildUrlWithBrands(window.location.href, [])
    if (newUrl !== window.location.href) {
      window.location.assign(newUrl)
    }
  }

  // ── URL helpers (pure — exported for unit testing) ───────────────────────

  /**
   * Parse the values from the `Brand:` portion of a Myntra `f=` parameter.
   *
   *   parseBrandsFromUrl('https://www.myntra.com/x?f=Brand:Timex,Sonata::Price:500-1000')
   *   // → ['Timex', 'Sonata']
   *
   *   parseBrandsFromUrl('https://www.myntra.com/x')   // → []
   *   parseBrandsFromUrl('https://www.myntra.com/x?f=Price:500-1000')  // → []
   */
  parseBrandsFromUrl(href: string): string[] {
    let url: URL
    try {
      url = new URL(href)
    } catch {
      return []
    }
    const f = url.searchParams.get(MyntraAdapter.URL_FACET_PARAM)
    if (!f) return []
    const facets = f.split(MyntraAdapter.URL_FACET_SEPARATOR)
    const brandFacet = facets.find((p) => p.startsWith(MyntraAdapter.URL_BRAND_FACET_PREFIX))
    if (!brandFacet) return []
    const values = brandFacet.slice(MyntraAdapter.URL_BRAND_FACET_PREFIX.length)
    if (!values) return []
    return values
      .split(MyntraAdapter.URL_BRAND_VALUE_SEPARATOR)
      .map((s) => s.trim())
      .filter(Boolean)
  }

  /**
   * Replace the `Brand:` facet in a Myntra URL with `brandNames`. Preserves
   * URL host, pathname, hash, and every other facet (Price, Color, etc.).
   * If `brandNames` is empty, the `Brand:` facet is removed; if there are
   * no other facets either, the `?f=` parameter is dropped entirely.
   */
  buildUrlWithBrands(href: string, brandNames: string[]): string {
    const url = new URL(href)
    const f = url.searchParams.get(MyntraAdapter.URL_FACET_PARAM) ?? ''
    const otherFacets = f
      .split(MyntraAdapter.URL_FACET_SEPARATOR)
      .filter((p) => p && !p.startsWith(MyntraAdapter.URL_BRAND_FACET_PREFIX))

    const newFacets =
      brandNames.length > 0
        ? [
            MyntraAdapter.URL_BRAND_FACET_PREFIX +
              brandNames.join(MyntraAdapter.URL_BRAND_VALUE_SEPARATOR),
            ...otherFacets,
          ]
        : otherFacets

    if (newFacets.length === 0) {
      url.searchParams.delete(MyntraAdapter.URL_FACET_PARAM)
    } else {
      url.searchParams.set(
        MyntraAdapter.URL_FACET_PARAM,
        newFacets.join(MyntraAdapter.URL_FACET_SEPARATOR),
      )
    }
    return url.toString()
  }

  // ── DOM helpers ──────────────────────────────────────────────────────────

  private collectBrandValues(containerSelector: string): string[] {
    const container = document.querySelector(containerSelector)
    if (!container) return []
    return Array.from(container.querySelectorAll<HTMLInputElement>(MyntraAdapter.CHECKBOX_SELECTOR))
      .map((cb) => cb.value)
      .filter(Boolean)
  }

  /**
   * Click the "+ N more" link and wait for the directory modal to render.
   * NOTE: the `.brand-more` click does NOT navigate — it's a JS-only UI
   * toggle that mounts `.FilterDirectory-list`. Safe to call.
   */
  private async openDirectoryModal(): Promise<boolean> {
    if (document.querySelector(MyntraAdapter.DIRECTORY_LIST_SELECTOR)) return true
    const moreBtn = document.querySelector<HTMLElement>(MyntraAdapter.BRAND_MORE_BTN_SELECTOR)
    if (!moreBtn) return false
    moreBtn.click()
    try {
      await waitForElement(MyntraAdapter.DIRECTORY_LIST_SELECTOR, 5000)
      await sleep(300) // directory streams items in for a beat after mount
      return true
    } catch {
      return false
    }
  }
}

/** Deduplicate strings, case-insensitive, preserving the first occurrence. */
function uniqueCaseInsensitive(values: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const v of values) {
    const key = v.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(v)
  }
  return out
}
