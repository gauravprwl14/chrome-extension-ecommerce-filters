import { describe, it, expect, beforeEach } from 'vitest'
import { MyntraAdapter } from '../lib/adapters/myntra'

describe('MyntraAdapter.isFilterPage', () => {
  const adapter = new MyntraAdapter()

  it('returns true for category pages', () => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/mens-watches', hostname: 'www.myntra.com' },
      writable: true,
    })
    expect(adapter.isFilterPage()).toBe(true)
  })

  it('returns false for product pages containing /buy', () => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/some-brand/product-name/buy' },
      writable: true,
    })
    expect(adapter.isFilterPage()).toBe(false)
  })

  it('returns false for cart page', () => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/checkout/cart' },
      writable: true,
    })
    expect(adapter.isFilterPage()).toBe(false)
  })
})

describe('MyntraAdapter.applyBrands', () => {
  let adapter: MyntraAdapter

  beforeEach(() => {
    adapter = new MyntraAdapter()
    document.body.innerHTML = `
      <div class="${MyntraAdapter.FILTER_CONTAINER_SELECTOR.replace('.', '')}">
        <label data-testid="brand-filter">
          <input type="checkbox" /> <span class="${MyntraAdapter.BRAND_LABEL_SELECTOR.replace('.', '')}">Titan</span>
        </label>
        <label data-testid="brand-filter">
          <input type="checkbox" checked /> <span class="${MyntraAdapter.BRAND_LABEL_SELECTOR.replace('.', '')}">Casio</span>
        </label>
        <label data-testid="brand-filter">
          <input type="checkbox" /> <span class="${MyntraAdapter.BRAND_LABEL_SELECTOR.replace('.', '')}">Fossil</span>
        </label>
      </div>
    `
  })

  it('checks unchecked matching brand', async () => {
    const result = await adapter.applyBrands([{ id: 'titan', name: 'Titan' }])
    expect(result.applied).toContain('titan')
    expect(result.skipped).toHaveLength(0)
    const checkbox = document.querySelector<HTMLInputElement>(`label:nth-child(1) input`)
    expect(checkbox?.checked).toBe(true)
  })

  it('skips already-checked brand', async () => {
    const result = await adapter.applyBrands([{ id: 'casio', name: 'Casio' }])
    expect(result.skipped).toContain('casio')
    expect(result.applied).toHaveLength(0)
  })

  it('records not-found brands', async () => {
    const result = await adapter.applyBrands([{ id: 'nike', name: 'Nike' }])
    expect(result.notFound).toContain('nike')
  })
})
