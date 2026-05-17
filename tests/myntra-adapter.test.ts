/**
 * MyntraAdapter — URL-driven strategy tests.
 *
 * Why the strategy changed:
 *   The previous click-per-brand implementation only ever applied 1–2
 *   brands before Myntra's per-click navigation tore down the content
 *   script. Symptom: applying a 21-brand "Watches" profile resulted in
 *   a URL like `?f=Brand:Invicta,Sonata` (just the first two) and an
 *   infinite-loop / flicker as auto-apply kept re-firing.
 *
 *   Myntra is URL-driven: every brand filter is encoded as
 *   `?f=Brand:Name1,Name2,...`. The adapter now scans the sidebar +
 *   directory modal once to learn canonical names, then performs ONE
 *   `location.assign()` with the full target URL. No click cascade.
 *
 * These tests pin:
 *   1. The pure URL grammar (parse / build).
 *   2. The DOM scan + URL construction in `applyBrands`.
 *   3. Preservation of non-Brand facets (Price, Color, ...) — the
 *      original symptom that broke when this was missed was users
 *      losing their other filters every time Apply ran.
 *   4. Behaviour when a brand isn't in either sidebar OR modal.
 *   5. clearAppliedBrands removes only the Brand facet.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { MyntraAdapter } from '../lib/adapters/myntra'

// ── DOM builders ──────────────────────────────────────────────────────────────

function brandLi(value: string, checked = false): string {
  return `
    <li>
      <label>
        <input type="checkbox" value="${value}"${checked ? ' checked' : ''}>
        ${value}
      </label>
    </li>`
}

function directoryLi(value: string, checked = false): string {
  return `
    <li>
      <label>
        <input type="checkbox" value="${value}"${checked ? ' checked' : ''}>
        ${value}
      </label>
    </li>`
}

function setupSidebar(
  sidebarBrands: Array<[value: string, checked?: boolean]>,
  onMore?: () => void,
) {
  Array.from(document.body.attributes).forEach((a) => document.body.removeAttribute(a.name))
  document.body.innerHTML = `
    <div class="vertical-filters-filters brand-container">
      <ul class="brand-list">
        ${sidebarBrands.map(([v, c]) => brandLi(v, c)).join('')}
      </ul>
      <div class="brand-more">+ 1879 more</div>
    </div>
  `
  if (onMore) {
    document.querySelector('.brand-more')!.addEventListener('click', onMore)
  }
}

function injectDirectoryModal(brands: Array<[value: string, checked?: boolean]>) {
  const panel = document.createElement('div')
  panel.className = 'FilterDirectory-panel FilterDirectory-expanded'
  panel.innerHTML = `
    <span class="FilterDirectory-close">×</span>
    <ul class="FilterDirectory-list">
      ${brands.map(([v, c]) => directoryLi(v, c)).join('')}
    </ul>
  `
  document.body.appendChild(panel)
  panel.querySelector('.FilterDirectory-close')!.addEventListener('click', () => panel.remove())
}

/**
 * Replace `window.location` with a controllable fake so the adapter's
 * `location.assign()` becomes observable in tests.
 */
function stubLocation(initialHref: string) {
  const calls: string[] = []
  const fake = {
    href: initialHref,
    pathname: new URL(initialHref).pathname,
    hostname: new URL(initialHref).hostname,
    assign: vi.fn((url: string) => {
      calls.push(url)
      fake.href = url
      fake.pathname = new URL(url).pathname
    }),
  }
  Object.defineProperty(window, 'location', { value: fake, writable: true })
  return { fake, calls }
}

// ── isFilterPage ──────────────────────────────────────────────────────────────

describe('MyntraAdapter.isFilterPage', () => {
  const adapter = new MyntraAdapter()

  it('returns true for category pages', () => {
    stubLocation('https://www.myntra.com/mens-watches')
    expect(adapter.isFilterPage()).toBe(true)
  })

  it('returns false for /buy product detail pages', () => {
    stubLocation('https://www.myntra.com/brand/product/buy/12345')
    expect(adapter.isFilterPage()).toBe(false)
  })

  it('returns false for /cart, /checkout, /wishlist, /profile', () => {
    for (const path of ['/cart', '/checkout/address', '/wishlist', '/profile']) {
      stubLocation('https://www.myntra.com' + path)
      expect(adapter.isFilterPage()).toBe(false)
    }
  })
})

// ── URL parsing — pure helpers ────────────────────────────────────────────────

describe('MyntraAdapter.parseBrandsFromUrl', () => {
  const adapter = new MyntraAdapter()

  it('returns empty array when ?f= is absent', () => {
    expect(adapter.parseBrandsFromUrl('https://www.myntra.com/mens-watches')).toEqual([])
  })

  it('returns empty array when f has no Brand: facet', () => {
    expect(
      adapter.parseBrandsFromUrl('https://www.myntra.com/mens-watches?f=Price:500-1000'),
    ).toEqual([])
  })

  it('parses a single-brand Brand: facet', () => {
    expect(adapter.parseBrandsFromUrl('https://www.myntra.com/mens-watches?f=Brand:Timex')).toEqual(
      ['Timex'],
    )
  })

  it('parses comma-separated brand values', () => {
    expect(
      adapter.parseBrandsFromUrl('https://www.myntra.com/mens-watches?f=Brand:Timex,Sonata,Titan'),
    ).toEqual(['Timex', 'Sonata', 'Titan'])
  })

  it('decodes URL-encoded brand names (spaces, ampersands)', () => {
    // `?f=Brand:Tommy Hilfiger,H%26M` — searchParams.get decodes for us.
    expect(
      adapter.parseBrandsFromUrl(
        'https://www.myntra.com/mens-watches?f=Brand%3ATommy%20Hilfiger%2CH%26M',
      ),
    ).toEqual(['Tommy Hilfiger', 'H&M'])
  })

  it('ignores other facets when Brand: is present', () => {
    expect(
      adapter.parseBrandsFromUrl(
        'https://www.myntra.com/mens-watches?f=Brand:Timex,Sonata::Price:500-1000::Color:Black',
      ),
    ).toEqual(['Timex', 'Sonata'])
  })

  it('returns [] for malformed URLs instead of throwing', () => {
    expect(adapter.parseBrandsFromUrl('not a url')).toEqual([])
  })
})

describe('MyntraAdapter.buildUrlWithBrands', () => {
  const adapter = new MyntraAdapter()

  it('adds a Brand: facet when none exists', () => {
    expect(
      adapter.buildUrlWithBrands('https://www.myntra.com/mens-watches', ['Timex', 'Sonata']),
    ).toBe('https://www.myntra.com/mens-watches?f=Brand%3ATimex%2CSonata')
  })

  it('replaces an existing Brand: facet', () => {
    expect(
      adapter.buildUrlWithBrands('https://www.myntra.com/mens-watches?f=Brand:Tommy', [
        'Timex',
        'Sonata',
      ]),
    ).toBe('https://www.myntra.com/mens-watches?f=Brand%3ATimex%2CSonata')
  })

  it('preserves other facets (Price, Color) when replacing Brand', () => {
    const out = adapter.buildUrlWithBrands(
      'https://www.myntra.com/mens-watches?f=Brand:Old::Price:500-1000::Color:Black',
      ['Timex'],
    )
    // The Brand facet is rewritten, Price and Color survive.
    const url = new URL(out)
    const f = url.searchParams.get('f')!
    expect(f.split('::').sort()).toEqual(['Brand:Timex', 'Color:Black', 'Price:500-1000'].sort())
  })

  it('removes the Brand: facet entirely when brandNames is empty', () => {
    const out = adapter.buildUrlWithBrands(
      'https://www.myntra.com/mens-watches?f=Brand:Old::Price:500-1000',
      [],
    )
    const url = new URL(out)
    expect(url.searchParams.get('f')).toBe('Price:500-1000')
  })

  it('drops ?f= entirely when removing the only facet (Brand)', () => {
    const out = adapter.buildUrlWithBrands('https://www.myntra.com/mens-watches?f=Brand:Old', [])
    expect(out).toBe('https://www.myntra.com/mens-watches')
  })

  it('preserves URL path, hash, and unrelated query params', () => {
    const out = adapter.buildUrlWithBrands(
      'https://www.myntra.com/mens-watches?sort=popularity&f=Brand:X#top',
      ['Timex'],
    )
    const url = new URL(out)
    expect(url.pathname).toBe('/mens-watches')
    expect(url.hash).toBe('#top')
    expect(url.searchParams.get('sort')).toBe('popularity')
    expect(url.searchParams.get('f')).toBe('Brand:Timex')
  })
})

// ── applyBrands — DOM scan + URL navigation ───────────────────────────────────

describe('MyntraAdapter.applyBrands — navigates ONCE with the right URL', () => {
  let adapter: MyntraAdapter
  beforeEach(() => {
    adapter = new MyntraAdapter()
  })

  it('navigates to a URL containing every requested brand visible in the sidebar', async () => {
    setupSidebar([['Tommy Hilfiger'], ['Roadster'], ['HRX']])
    const { calls } = stubLocation('https://www.myntra.com/mens-tshirts')

    const result = await adapter.applyBrands([
      { id: 'tommy', name: 'Tommy Hilfiger' },
      { id: 'hrx', name: 'HRX' },
    ])

    expect(result.applied.sort()).toEqual(['hrx', 'tommy'])
    expect(result.notFound).toEqual([])
    expect(calls).toHaveLength(1)
    expect(adapter.parseBrandsFromUrl(calls[0]!)).toEqual(['Tommy Hilfiger', 'HRX'])
  })

  it('opens the directory modal ONLY when a requested brand is missing from the sidebar', async () => {
    let moreClicks = 0
    setupSidebar([['Tommy Hilfiger'], ['Roadster']], () => {
      moreClicks += 1
      injectDirectoryModal([['Tommy Hilfiger'], ['Timex'], ['SONATA']])
    })
    const { calls } = stubLocation('https://www.myntra.com/mens-watches')

    const result = await adapter.applyBrands([
      { id: 'tommy', name: 'Tommy Hilfiger' }, // in sidebar
      { id: 'timex', name: 'Timex' }, // only in modal
      { id: 'sonata', name: 'SONATA' }, // only in modal
    ])

    expect(result.applied.sort()).toEqual(['sonata', 'timex', 'tommy'])
    expect(moreClicks).toBe(1) // exactly one modal open
    expect(calls).toHaveLength(1) // exactly one navigation
    // Adapter uses the canonical name from the modal DOM (Myntra-supplied
    // case) — NOT the brand.name in the profile.
    expect(adapter.parseBrandsFromUrl(calls[0]!)).toEqual(['Tommy Hilfiger', 'Timex', 'SONATA'])
  })

  it('does NOT open the directory modal when every brand is in the sidebar', async () => {
    let moreClicks = 0
    setupSidebar([['Tommy Hilfiger'], ['Roadster']], () => (moreClicks += 1))
    stubLocation('https://www.myntra.com/mens-tshirts')

    await adapter.applyBrands([{ id: 'tommy', name: 'Tommy Hilfiger' }])
    expect(moreClicks).toBe(0)
  })

  it('applies all 21 watch-profile brands in a single navigation (regression: only-2-brands bug)', async () => {
    // The exact scenario from the bug report: every watch brand is in the
    // modal. The old click-based adapter only applied the first 1–2 before
    // Myntra navigated and killed it.
    setupSidebar([['Tommy Hilfiger'], ['Roadster']], () => {
      injectDirectoryModal([
        ['Timex'],
        ['Casio'],
        ['FOSSIL'],
        ['TITAN'],
        ['FASTRACK'],
        ['SONATA'],
        ['GUESS'],
        ['Daniel Wellington'],
        ['Tommy Hilfiger'],
        ['Calvin Klein'],
        ['Armani Exchange'],
        ['Citizen'],
        ['Seiko'],
        ['Skechers'],
        ['MVMT'],
        ['Nautica'],
        ['KENNETH COLE'],
        ['POLICE'],
        ['HELIX'],
        ['Daniel Klein'],
        ['Invicta'],
      ])
    })
    const { calls } = stubLocation('https://www.myntra.com/mens-watches')

    const watchesProfile = [
      { id: 'timex', name: 'Timex' },
      { id: 'casio', name: 'Casio' },
      { id: 'fossil', name: 'FOSSIL' },
      { id: 'titan', name: 'TITAN' },
      { id: 'fastrack', name: 'FASTRACK' },
      { id: 'sonata', name: 'SONATA' },
      { id: 'guess', name: 'GUESS' },
      { id: 'daniel-wellington', name: 'Daniel Wellington' },
      { id: 'tommy-hilfiger', name: 'Tommy Hilfiger' },
      { id: 'calvin-klein', name: 'Calvin Klein' },
      { id: 'armani-exchange', name: 'Armani Exchange' },
      { id: 'citizen', name: 'Citizen' },
      { id: 'seiko', name: 'Seiko' },
      { id: 'skechers', name: 'Skechers' },
      { id: 'mvmt', name: 'MVMT' },
      { id: 'nautica', name: 'Nautica' },
      { id: 'kenneth-cole', name: 'KENNETH COLE' },
      { id: 'police', name: 'POLICE' },
      { id: 'helix', name: 'HELIX' },
      { id: 'daniel-klein', name: 'Daniel Klein' },
      { id: 'invicta', name: 'Invicta' },
    ]
    const result = await adapter.applyBrands(watchesProfile)

    expect(result.applied).toHaveLength(21) // ← previously was 1–2
    expect(result.notFound).toEqual([])
    expect(calls).toHaveLength(1) // ← previously was 21 (one per click)
    expect(adapter.parseBrandsFromUrl(calls[0]!)).toHaveLength(21)
  })

  it('preserves an existing non-Brand facet (Price, Color) in the navigation', async () => {
    setupSidebar([['Timex']])
    const { calls } = stubLocation(
      'https://www.myntra.com/mens-watches?f=Price:500-1000::Color:Black',
    )

    await adapter.applyBrands([{ id: 'timex', name: 'Timex' }])
    expect(calls).toHaveLength(1)
    const facets = new URL(calls[0]!).searchParams.get('f')!.split('::').sort()
    expect(facets).toEqual(['Brand:Timex', 'Color:Black', 'Price:500-1000'].sort())
  })

  it('appends to existing Brand: facet additively, deduping case-insensitively', async () => {
    setupSidebar([['Timex'], ['Sonata']])
    const { calls } = stubLocation('https://www.myntra.com/mens-watches?f=Brand:Sonata')

    const result = await adapter.applyBrands([
      { id: 'timex', name: 'Timex' },
      { id: 'sonata', name: 'SONATA' }, // already in URL — dedupe & skip
    ])

    expect(result.applied).toEqual(['timex'])
    expect(result.skipped).toEqual(['sonata'])
    expect(adapter.parseBrandsFromUrl(calls[0]!)).toEqual(['Sonata', 'Timex'])
  })

  it('records brands missing from BOTH sidebar and modal as notFound', async () => {
    setupSidebar([['Timex']], () => injectDirectoryModal([['Timex'], ['Sonata']]))
    stubLocation('https://www.myntra.com/mens-watches')

    const result = await adapter.applyBrands([
      { id: 'timex', name: 'Timex' }, // present
      { id: 'totally-fake', name: 'Totally Fake Brand' }, // absent
    ])

    expect(result.applied).toEqual(['timex'])
    expect(result.notFound).toEqual(['totally-fake'])
  })

  it('does NOT navigate if no matched brand would add anything new', async () => {
    setupSidebar([['Timex']])
    const { calls } = stubLocation('https://www.myntra.com/mens-watches?f=Brand:Timex')

    const result = await adapter.applyBrands([{ id: 'timex', name: 'Timex' }])
    expect(result.skipped).toEqual(['timex'])
    expect(calls).toHaveLength(0)
  })

  it('does NOT navigate if every requested brand is notFound (no DOM matches)', async () => {
    setupSidebar([['Timex']], () => injectDirectoryModal([['Timex']]))
    const { calls } = stubLocation('https://www.myntra.com/mens-watches')

    const result = await adapter.applyBrands([
      { id: 'fake-1', name: 'Fake One' },
      { id: 'fake-2', name: 'Fake Two' },
    ])
    expect(result.notFound).toEqual(['fake-1', 'fake-2'])
    expect(calls).toHaveLength(0)
  })

  it('case-insensitive brand matching against input.value', async () => {
    setupSidebar([['TOMMY HILFIGER']])
    const { calls } = stubLocation('https://www.myntra.com/mens-tshirts')
    const result = await adapter.applyBrands([{ id: 'tommy', name: 'Tommy Hilfiger' }])
    expect(result.applied).toEqual(['tommy'])
    expect(adapter.parseBrandsFromUrl(calls[0]!)).toEqual(['TOMMY HILFIGER'])
  })
})

// ── clearAppliedBrands ────────────────────────────────────────────────────────

describe('MyntraAdapter.clearAppliedBrands', () => {
  let adapter: MyntraAdapter
  beforeEach(() => {
    adapter = new MyntraAdapter()
  })

  it('navigates to a URL with the Brand facet removed, preserving other facets', async () => {
    const { calls } = stubLocation(
      'https://www.myntra.com/mens-watches?f=Brand:Timex,Sonata::Price:500-1000',
    )
    await adapter.clearAppliedBrands()
    expect(calls).toHaveLength(1)
    expect(new URL(calls[0]!).searchParams.get('f')).toBe('Price:500-1000')
  })

  it('removes the ?f= parameter entirely when Brand was the only facet', async () => {
    const { calls } = stubLocation('https://www.myntra.com/mens-watches?f=Brand:Timex')
    await adapter.clearAppliedBrands()
    expect(calls[0]).toBe('https://www.myntra.com/mens-watches')
  })

  it('does NOT navigate when the URL has no Brand facet to remove', async () => {
    const { calls } = stubLocation('https://www.myntra.com/mens-watches')
    await adapter.clearAppliedBrands()
    expect(calls).toHaveLength(0)
  })
})

// ── failure modes ─────────────────────────────────────────────────────────────

describe('MyntraAdapter.applyBrands — failure modes', () => {
  let adapter: MyntraAdapter
  beforeEach(() => {
    adapter = new MyntraAdapter()
  })

  it('returns empty result without navigating when no brands requested', async () => {
    setupSidebar([['Timex']])
    const { calls } = stubLocation('https://www.myntra.com/mens-watches')
    const result = await adapter.applyBrands([])
    expect(result.applied).toEqual([])
    expect(calls).toHaveLength(0)
  })

  it('records every brand as notFound when sidebar is missing and modal cannot be opened', async () => {
    document.body.innerHTML = '<div></div>' // no sidebar, no .brand-more
    const { calls } = stubLocation('https://www.myntra.com/mens-watches')
    const result = await adapter.applyBrands([
      { id: 'timex', name: 'Timex' },
      { id: 'sonata', name: 'SONATA' },
    ])
    expect(result.notFound.sort()).toEqual(['sonata', 'timex'])
    expect(calls).toHaveLength(0)
  })
})
