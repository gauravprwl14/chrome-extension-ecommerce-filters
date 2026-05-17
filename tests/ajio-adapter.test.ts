/**
 * Tests for AjioAdapter — scoped to the BRANDS facet on a realistic page
 * with multiple sibling `.cat-facets` (Shop For, Category, Brands, Price, ...).
 *
 * Bug history this guards against:
 *   - "Apply opens Choose Category modal instead of Brands modal" — the old
 *     selector `.cat-facets .facet-more` returned the FIRST `.facet-more` in
 *     document order, which on the clothing page is **Category**'s MORE.
 *     Test "applyBrands targets ONLY the brands facet's MORE" pins the fix.
 *
 *   - "Works on watches page, breaks on clothing page" — on watches, Brands
 *     happens to be the first `.cat-facets`, so the buggy selector accidentally
 *     matched. The realistic fixtures here have Brands as the **third** facet
 *     to mirror the clothing page, so the test fails loudly on regression.
 *
 * Real Ajio DOM (clothing-4461-74582 page, confirmed from screenshot):
 *
 *   <div class="cat-facets"> <!-- 1: Shop For -->
 *     <div class="facet-head">
 *       <div class="facet-head-before" aria-label="shop for" aria-expanded="true">...</div>
 *     </div>
 *     <div class="facet-body">...</div>
 *   </div>
 *   <div class="cat-facets"> <!-- 2: Category -->
 *     <div class="facet-head">
 *       <div class="facet-head-before" aria-label="category" aria-expanded="true">...</div>
 *     </div>
 *     <div class="facet-body">
 *       <ul>...</ul>
 *       <div class="facet-more">MORE</div>  <!-- ← bug clicked THIS -->
 *     </div>
 *   </div>
 *   <div class="cat-facets"> <!-- 3: Brands -->
 *     <div class="facet-head">
 *       <div class="facet-head-before" aria-label="brands" aria-expanded="false">...</div>
 *     </div>
 *     <!-- body absent until expanded -->
 *   </div>
 *   <div class="cat-facets"> <!-- 4+: Price, Colors, ... -->
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AjioAdapter } from '../lib/adapters/ajio'

// ── DOM builders ──────────────────────────────────────────────────────────────

interface FacetSpec {
  label: string
  expanded: boolean
  /** Items in the inline list. */
  inline?: Array<{ value: string; checked?: boolean }>
  /** If the inline list has a MORE button, what brand[] does the modal contain? */
  more?: Array<{ value: string; checked?: boolean }>
  /** Use `'brand'` for the brands facet, anything else for siblings. */
  inputName?: string
}

function facetHtml(spec: FacetSpec): string {
  const inputName = spec.inputName ?? 'option'
  const bodyContent = spec.expanded
    ? `
      <div class="facet-body">
        <ul class="rilrtl-list">
          ${(spec.inline ?? [])
            .map(
              ({ value, checked }) => `
            <li class="rilrtl-list-item">
              <div class="facet-linkfref" role="checkbox" aria-checked="${!!checked}">
                <div class="facet-linkhead">
                  <input type="checkbox" name="${inputName}" id="${value}"
                         aria-hidden="true" value="${value}"${checked ? ' checked' : ''}>
                  <label class="facet-linkname" for="${value}">${value} (1)</label>
                </div>
              </div>
            </li>`,
            )
            .join('')}
        </ul>
        ${spec.more ? `<div class="facet-more" role="button"><strong>MORE</strong></div>` : ''}
      </div>`
    : ''
  return `
    <div class="cat-facets">
      <div class="facet-head">
        <div class="facet-head-before" tabindex="0" role="button"
             aria-expanded="${spec.expanded}" aria-label="${spec.label}">
          <span class="facet-left-pane-label">${spec.label}</span>
        </div>
      </div>
      ${bodyContent}
    </div>`
}

/**
 * Build a realistic Ajio sidebar with sibling facets. Wires the React-like
 * behavior on each inline `.facet-linkfref` (clicking flips its <input>) and
 * on each `.facet-more` (clicking opens a modal containing the facet's items).
 */
function setupRealisticPage(facets: FacetSpec[]) {
  Array.from(document.body.attributes).forEach((a) => document.body.removeAttribute(a.name))
  document.body.innerHTML = facets.map(facetHtml).join('')

  // Wire inline wrapper clicks
  document.querySelectorAll<HTMLElement>('.facet-linkfref').forEach((wrapper) => {
    wrapper.addEventListener('click', () => {
      const input = wrapper.querySelector<HTMLInputElement>('input[type="checkbox"]')
      if (input) input.checked = !input.checked
    })
  })

  // Wire MORE buttons. Each opens its OWN modal containing its OWN items —
  // mirroring real Ajio where Category's MORE opens "Choose Category" with
  // category items (no `name="brand"` inputs).
  document.querySelectorAll<HTMLElement>('.cat-facets').forEach((host) => {
    const moreBtn = host.querySelector<HTMLElement>('.facet-more')
    if (!moreBtn) return
    const spec = facets[Array.from(document.querySelectorAll('.cat-facets')).indexOf(host)]!
    moreBtn.addEventListener('click', () => {
      injectModal(spec)
    })
  })
}

function injectModal(spec: FacetSpec, opts: { onApply?: () => void } = {}) {
  // Don't double-render
  document.querySelector('.more-popup-container')?.remove()
  const inputName = spec.inputName ?? 'option'
  const items = spec.more ?? spec.inline ?? []
  const title = spec.label.replace(/\b\w/g, (c) => c.toUpperCase())
  const root = document.createElement('div')
  root.className = 'more-popup-container'
  root.innerHTML = `
    <div class="facet-filter-modal__title">Choose ${title}</div>
    <div class="facet-filter-modal__body">
      <ul class="rilrtl-list">
        ${items
          .map(
            ({ value, checked }) => `
          <li class="rilrtl-list-item">
            <div class="facet-filter-modal__item facet-linkhead">
              <input name="${inputName}" type="checkbox" id="modal-${value}"
                     value="${value}"${checked ? ' checked' : ''}>
              <label for="modal-${value}">${value} (1)</label>
            </div>
          </li>`,
          )
          .join('')}
      </ul>
    </div>
    <div class="facet-filter-modal__footer">
      <button class="rilrtl-button rilrtl-button--apply" type="submit">Apply</button>
    </div>
  `
  document.body.appendChild(root)
  root.querySelector<HTMLButtonElement>('.rilrtl-button--apply')!.addEventListener('click', () => {
    opts.onApply?.()
    root.remove() // Ajio closes the modal on Apply
  })
}

// ── isFilterPage ──────────────────────────────────────────────────────────────

describe('AjioAdapter.isFilterPage', () => {
  const adapter = new AjioAdapter()

  it('returns true for /s/ paths', () => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/s/men-watches' },
      writable: true,
    })
    expect(adapter.isFilterPage()).toBe(true)
  })

  it('returns false for non /s/ paths', () => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/product/detail' },
      writable: true,
    })
    expect(adapter.isFilterPage()).toBe(false)
  })

  it('returns false for root path', () => {
    Object.defineProperty(window, 'location', { value: { pathname: '/' }, writable: true })
    expect(adapter.isFilterPage()).toBe(false)
  })
})

// ── expandBrandFilter — must target brands header only ───────────────────────

describe('AjioAdapter.expandBrandFilter — scoped to brands header', () => {
  let adapter: AjioAdapter
  beforeEach(() => {
    adapter = new AjioAdapter()
  })

  it('clicks the BRANDS header (not Category) when collapsed', async () => {
    setupRealisticPage([
      { label: 'shop for', expanded: true, inline: [{ value: 'Men' }], inputName: 'shopFor' },
      { label: 'category', expanded: true, inline: [{ value: 'Tshirts' }], inputName: 'category' },
      { label: 'brands', expanded: false, inputName: 'brand' },
    ])

    let brandsClicks = 0
    let categoryClicks = 0
    document
      .querySelector<HTMLElement>('.facet-head-before[aria-label="brands"]')!
      .addEventListener('click', () => {
        brandsClicks += 1
        const host = document.querySelectorAll('.cat-facets')[2]!
        const toggle = host.querySelector('.facet-head-before')!
        toggle.setAttribute('aria-expanded', 'true')
        const body = document.createElement('div')
        body.className = 'facet-body'
        host.appendChild(body)
      })
    document
      .querySelector<HTMLElement>('.facet-head-before[aria-label="category"]')!
      .addEventListener('click', () => (categoryClicks += 1))

    await adapter.expandBrandFilter()
    expect(brandsClicks).toBe(1)
    expect(categoryClicks).toBe(0)
  })

  it('is a no-op when brands header is already expanded', async () => {
    setupRealisticPage([
      {
        label: 'brands',
        expanded: true,
        inline: [{ value: 'Timex' }],
        more: [{ value: 'Timex' }],
        inputName: 'brand',
      },
    ])
    let clicks = 0
    document
      .querySelector<HTMLElement>('.facet-head-before[aria-label="brands"]')!
      .addEventListener('click', () => (clicks += 1))
    await adapter.expandBrandFilter()
    expect(clicks).toBe(0)
  })

  it('is a no-op when brands header is absent', async () => {
    document.body.innerHTML = '<div></div>'
    await expect(adapter.expandBrandFilter()).resolves.toBeUndefined()
  })
})

// ── applyBrands — the regression that brought us here ────────────────────────

describe('AjioAdapter.applyBrands — multi-facet page (Choose Category bug regression)', () => {
  let adapter: AjioAdapter
  beforeEach(() => {
    adapter = new AjioAdapter()
  })

  /** The exact page shape from the user's screenshot: 4 sibling .cat-facets,
   *  Brands is the 3rd. Category has its own MORE button. */
  function setupClothingPage() {
    setupRealisticPage([
      { label: 'shop for', expanded: true, inline: [{ value: 'Men' }], inputName: 'shopFor' },
      {
        label: 'category',
        expanded: true,
        inline: [{ value: 'Tshirts' }, { value: 'Shirts' }],
        more: [{ value: 'Tshirts' }, { value: 'Shirts' }, { value: 'Jeans' }],
        inputName: 'category',
      },
      {
        label: 'brands',
        expanded: true,
        inline: [{ value: 'Adidas Originals' }, { value: 'Aries Gold' }],
        more: [
          { value: 'Adidas Originals' },
          { value: 'Aries Gold' },
          { value: 'Tommy Hilfiger' },
          { value: 'Levis' },
          { value: 'Calvin Klein' },
        ],
        inputName: 'brand',
      },
      { label: 'price', expanded: true, inline: [{ value: '500-1000' }], inputName: 'price' },
    ])
  }

  it('clicks the BRANDS facet MORE, NOT the Category facet MORE', async () => {
    setupClothingPage()
    // Spy on every MORE button to see which ones get clicked
    const moreSpies = Array.from(document.querySelectorAll<HTMLElement>('.cat-facets')).map(
      (host) => {
        const moreBtn = host.querySelector<HTMLElement>('.facet-more')
        const label = host
          .querySelector<HTMLElement>('.facet-head-before')!
          .getAttribute('aria-label')!
        const spy = vi.fn()
        moreBtn?.addEventListener('click', spy)
        return { label, spy }
      },
    )

    await adapter.applyBrands([
      { id: 'tommy', name: 'Tommy Hilfiger' },
      { id: 'levis', name: 'Levis' },
    ])

    const categorySpy = moreSpies.find((s) => s.label === 'category')!.spy
    const brandsSpy = moreSpies.find((s) => s.label === 'brands')!.spy
    expect(categorySpy).not.toHaveBeenCalled() // ← THE BUG: this used to be called
    expect(brandsSpy).toHaveBeenCalledTimes(1)
  })

  it('opens the BRAND modal (not Choose Category) and ticks the requested brands', async () => {
    setupClothingPage()
    const result = await adapter.applyBrands([
      { id: 'tommy', name: 'Tommy Hilfiger' },
      { id: 'calvin', name: 'Calvin Klein' },
    ])

    expect(result.applied.sort()).toEqual(['calvin', 'tommy'])
    expect(result.notFound).toEqual([])

    // The "Choose Category" modal must NOT be lingering on screen.
    const modalTitle = document.querySelector('.facet-filter-modal__title')
    expect(modalTitle?.textContent ?? '').not.toMatch(/category/i)
  })

  it('clicks Apply once after ticking modal checkboxes', async () => {
    setupClothingPage()
    let applyClicks = 0
    // Re-inject the brands modal with an onApply spy
    const brandsHost = document.querySelectorAll('.cat-facets')[2]!
    const moreBtn = brandsHost.querySelector<HTMLElement>('.facet-more')!
    moreBtn.replaceWith(moreBtn.cloneNode(true)) // strip old listeners
    document
      .querySelectorAll('.cat-facets')[2]!
      .querySelector<HTMLElement>('.facet-more')!
      .addEventListener('click', () => {
        injectModal(
          {
            label: 'brands',
            expanded: true,
            more: [{ value: 'Timex' }, { value: 'Casio' }],
            inputName: 'brand',
          },
          { onApply: () => (applyClicks += 1) },
        )
      })

    await adapter.applyBrands([
      { id: 'timex', name: 'Timex' },
      { id: 'casio', name: 'Casio' },
    ])

    expect(applyClicks).toBe(1)
  })

  it('records brands missing from BOTH inline and modal as notFound', async () => {
    setupClothingPage()
    const result = await adapter.applyBrands([{ id: 'nonexistent', name: 'Nonexistent Brand' }])
    expect(result.notFound).toEqual(['nonexistent'])
    expect(result.applied).toEqual([])
  })

  it('skips brands already checked in the modal', async () => {
    setupRealisticPage([
      {
        label: 'brands',
        expanded: true,
        inline: [{ value: 'Timex' }],
        more: [{ value: 'Timex', checked: true }, { value: 'Casio' }],
        inputName: 'brand',
      },
    ])

    let applyClicks = 0
    const brandsHost = document.querySelectorAll('.cat-facets')[0]!
    const moreBtn = brandsHost.querySelector<HTMLElement>('.facet-more')!
    moreBtn.replaceWith(moreBtn.cloneNode(true))
    document
      .querySelectorAll('.cat-facets')[0]!
      .querySelector<HTMLElement>('.facet-more')!
      .addEventListener('click', () => {
        injectModal(
          {
            label: 'brands',
            expanded: true,
            more: [{ value: 'Timex', checked: true }, { value: 'Casio' }],
            inputName: 'brand',
          },
          { onApply: () => (applyClicks += 1) },
        )
      })

    const result = await adapter.applyBrands([
      { id: 'timex', name: 'Timex' },
      { id: 'casio', name: 'Casio' },
    ])

    expect(result.skipped).toEqual(['timex'])
    expect(result.applied).toEqual(['casio'])
    expect(applyClicks).toBe(1) // one new tick → apply commits
  })

  it('does NOT click Apply when nothing new needs to be ticked', async () => {
    setupRealisticPage([
      {
        label: 'brands',
        expanded: true,
        inline: [],
        more: [{ value: 'Timex', checked: true }],
        inputName: 'brand',
      },
    ])
    let applyClicks = 0
    const host = document.querySelectorAll('.cat-facets')[0]!
    const moreBtn = host.querySelector<HTMLElement>('.facet-more')!
    moreBtn.replaceWith(moreBtn.cloneNode(true))
    document
      .querySelectorAll('.cat-facets')[0]!
      .querySelector<HTMLElement>('.facet-more')!
      .addEventListener('click', () => {
        injectModal(
          {
            label: 'brands',
            expanded: true,
            more: [{ value: 'Timex', checked: true }],
            inputName: 'brand',
          },
          { onApply: () => (applyClicks += 1) },
        )
      })

    await adapter.applyBrands([{ id: 'timex', name: 'Timex' }])
    expect(applyClicks).toBe(0)
  })
})

// ── applyBrands — inline-only fallback (no MORE button) ──────────────────────

describe('AjioAdapter.applyBrands — inline-only fallback', () => {
  let adapter: AjioAdapter
  beforeEach(() => {
    adapter = new AjioAdapter()
  })

  it('ticks brands inline when the brands facet has no MORE button', async () => {
    setupRealisticPage([
      {
        label: 'brands',
        expanded: true,
        inline: [{ value: 'Adidas Originals' }, { value: 'Casio' }],
        inputName: 'brand',
        // no `more` → no MORE button
      },
    ])

    const result = await adapter.applyBrands([{ id: 'adidas-originals', name: 'Adidas Originals' }])
    expect(result.applied).toEqual(['adidas-originals'])
    const cb = document.querySelector<HTMLInputElement>('input[value="Adidas Originals"]')!
    expect(cb.checked).toBe(true)
    expect(cb.getAttribute('data-brandfilter')).toBe('applied')
  })

  it('does NOT touch input[name="category"] inputs from sibling facets', async () => {
    setupRealisticPage([
      { label: 'category', expanded: true, inline: [{ value: 'Tshirts' }], inputName: 'category' },
      { label: 'brands', expanded: true, inline: [{ value: 'Casio' }], inputName: 'brand' },
    ])
    await adapter.applyBrands([{ id: 'tshirts', name: 'Tshirts' }])
    const categoryCb = document.querySelector<HTMLInputElement>('input[value="Tshirts"]')!
    expect(categoryCb.checked).toBe(false) // category was never tickable as a brand
  })
})

// ── applyBrands — failure modes ──────────────────────────────────────────────

describe('AjioAdapter.applyBrands — failure modes', () => {
  let adapter: AjioAdapter
  beforeEach(() => {
    adapter = new AjioAdapter()
  })

  it('returns all notFound when the brands facet is not on the page', async () => {
    setupRealisticPage([
      { label: 'shop for', expanded: true, inline: [{ value: 'Men' }], inputName: 'shopFor' },
      { label: 'price', expanded: true, inline: [{ value: '500' }], inputName: 'price' },
    ])
    const result = await adapter.applyBrands([
      { id: 'timex', name: 'Timex' },
      { id: 'casio', name: 'Casio' },
    ])
    expect(result.notFound.sort()).toEqual(['casio', 'timex'])
  })

  it('does NOT leave a stranded modal on screen when wrong-modal opened', async () => {
    // Simulated rare case: brands header is present but its MORE button
    // (somehow) opens a modal with no brand inputs. The adapter must dismiss
    // it rather than leave the user staring at an unrelated picker.
    setupRealisticPage([
      { label: 'brands', expanded: true, inline: [], more: [], inputName: 'brand' },
    ])
    // Override the MORE handler to open a Category-style modal with no brand inputs
    const moreBtn = document.querySelector<HTMLElement>('.facet-more')!
    moreBtn.replaceWith(moreBtn.cloneNode(true))
    document.querySelector<HTMLElement>('.facet-more')!.addEventListener('click', () => {
      const root = document.createElement('div')
      root.className = 'more-popup-container'
      root.innerHTML = `
        <div class="facet-filter-modal__title">Choose Category</div>
        <input type="checkbox" name="category" value="Tshirts">
        <button class="ic-close" aria-label="close">×</button>`
      root.querySelector<HTMLElement>('.ic-close')!.addEventListener('click', () => root.remove())
      document.body.appendChild(root)
    })

    const result = await adapter.applyBrands([{ id: 'timex', name: 'Timex' }])
    expect(result.notFound).toEqual(['timex'])
    expect(document.querySelector('.more-popup-container')).toBeNull() // dismissed
  })
})

// ── clearAppliedBrands ────────────────────────────────────────────────────────

describe('AjioAdapter.clearAppliedBrands', () => {
  let adapter: AjioAdapter
  beforeEach(() => {
    adapter = new AjioAdapter()
  })

  it('unchecks inline brands marked as applied and removes the marker', async () => {
    setupRealisticPage([
      {
        label: 'brands',
        expanded: true,
        inline: [{ value: 'Casio', checked: true }],
        inputName: 'brand',
      },
    ])
    const cb = document.querySelector<HTMLInputElement>('input[value="Casio"]')!
    cb.setAttribute('data-brandfilter', 'applied')
    await adapter.clearAppliedBrands()
    expect(cb.checked).toBe(false)
    expect(cb.getAttribute('data-brandfilter')).toBeNull()
  })

  it('is a no-op when nothing was applied', async () => {
    setupRealisticPage([
      { label: 'brands', expanded: true, inline: [{ value: 'Casio' }], inputName: 'brand' },
    ])
    const cb = document.querySelector<HTMLInputElement>('input[value="Casio"]')!
    await adapter.clearAppliedBrands()
    expect(cb.checked).toBe(false)
  })
})
