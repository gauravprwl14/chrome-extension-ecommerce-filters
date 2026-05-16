import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AjioAdapter } from '../lib/adapters/ajio'

describe('AjioAdapter.isFilterPage', () => {
  const adapter = new AjioAdapter()

  it('returns true for /s/ paths', () => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/s/men-watches-3991-40341' },
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
    Object.defineProperty(window, 'location', {
      value: { pathname: '/' },
      writable: true,
    })
    expect(adapter.isFilterPage()).toBe(false)
  })
})

describe('AjioAdapter.expandBrandFilter', () => {
  it('clicks the Brands accordion expand button if present', async () => {
    document.body.innerHTML = `
      <div class="${AjioAdapter.FACET_CONTAINER_SELECTOR.replace('.', '')}">
        <div class="${AjioAdapter.BRAND_FACET_TITLE_SELECTOR.replace('.', '')}">
          Brands <button class="${AjioAdapter.EXPAND_BTN_SELECTOR.replace('.', '')}">+</button>
        </div>
        <div class="${AjioAdapter.BRAND_CHECKBOX_CONTAINER_SELECTOR.replace('.', '')}" style="display:none">
        </div>
      </div>
    `
    const adapter = new AjioAdapter()
    const btn = document.querySelector<HTMLElement>(AjioAdapter.EXPAND_BTN_SELECTOR)
    const clickSpy = vi.spyOn(btn!, 'click')
    await adapter.expandBrandFilter()
    expect(clickSpy).toHaveBeenCalled()
  })

  it('does nothing when expand button is not present', async () => {
    document.body.innerHTML = `<div></div>`
    const adapter = new AjioAdapter()
    // Should not throw
    await expect(adapter.expandBrandFilter()).resolves.toBeUndefined()
  })
})

describe('AjioAdapter.applyBrands', () => {
  let adapter: AjioAdapter

  beforeEach(() => {
    adapter = new AjioAdapter()
    document.body.innerHTML = `
      <div class="${AjioAdapter.BRAND_CHECKBOX_CONTAINER_SELECTOR.replace('.', '')}">
        <label><input type="checkbox" /><span class="${AjioAdapter.BRAND_LABEL_SELECTOR.replace('.', '')}">Casio</span></label>
        <label><input type="checkbox" checked /><span class="${AjioAdapter.BRAND_LABEL_SELECTOR.replace('.', '')}">Fossil</span></label>
        <label><input type="checkbox" /><span class="${AjioAdapter.BRAND_LABEL_SELECTOR.replace('.', '')}">Titan</span></label>
      </div>
    `
  })

  it('checks unchecked brand and sets data-brandfilter attribute', async () => {
    const result = await adapter.applyBrands([{ id: 'casio', name: 'Casio' }])
    expect(result.applied).toContain('casio')
    const checkbox = document.querySelector<HTMLInputElement>(`[data-brandfilter="applied"]`)
    expect(checkbox).not.toBeNull()
    expect(checkbox?.checked).toBe(true)
  })

  it('skips already-checked brand', async () => {
    const result = await adapter.applyBrands([{ id: 'fossil', name: 'Fossil' }])
    expect(result.skipped).toContain('fossil')
    expect(result.applied).toHaveLength(0)
  })

  it('records not-found brands', async () => {
    const result = await adapter.applyBrands([{ id: 'nike', name: 'Nike' }])
    expect(result.notFound).toContain('nike')
  })

  it('pushes to notFound when click does not flip checkbox', async () => {
    // Simulate a checkbox where .click() doesn't toggle the state (e.g. React-controlled)
    const container = document.querySelector(
      `.${AjioAdapter.BRAND_CHECKBOX_CONTAINER_SELECTOR.replace('.', '')}`,
    )!
    const label = document.createElement('label')
    const input = document.createElement('input')
    input.type = 'checkbox'
    // Override click to do nothing (simulate React-controlled input)
    input.addEventListener('click', (e) => e.preventDefault())
    const span = document.createElement('span')
    span.className = AjioAdapter.BRAND_LABEL_SELECTOR.replace('.', '')
    span.textContent = 'Reebok'
    label.appendChild(input)
    label.appendChild(span)
    container.appendChild(label)

    const result = await adapter.applyBrands([{ id: 'reebok', name: 'Reebok' }])
    // checkbox.checked remains false after click → notFound
    expect(result.notFound).toContain('reebok')
    expect(result.applied).not.toContain('reebok')
  })
})

describe('AjioAdapter.clearAppliedBrands', () => {
  it('unchecks applied brands and removes data-brandfilter attribute', async () => {
    const adapter = new AjioAdapter()
    document.body.innerHTML = `
      <input type="checkbox" data-brandfilter="applied" />
    `
    const checkbox = document.querySelector<HTMLInputElement>('input')!
    checkbox.checked = true

    await adapter.clearAppliedBrands()

    expect(checkbox.checked).toBe(false)
    expect(checkbox.getAttribute('data-brandfilter')).toBeNull()
  })
})
