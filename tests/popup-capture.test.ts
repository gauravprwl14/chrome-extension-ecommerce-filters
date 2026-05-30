import { describe, it, expect } from 'vitest'
import type { Brand, CaptureSelectionResponse } from '../lib/config'
import { captureForPopup } from '../lib/popup-capture'

const masterBrands: Brand[] = [
  { id: 'nike', name: 'Nike' },
  { id: 'levis', name: "Levi's", variants: [{ type: 'string', value: 'Levis' }] },
]

const deps = (send: () => Promise<CaptureSelectionResponse>) => ({
  tabId: 1,
  masterBrands,
  sendCaptureMessage: send,
})

describe('captureForPopup', () => {
  it('reconciles captured brands into a review result', async () => {
    const result = await captureForPopup(
      deps(async () => ({ ok: true, isFilterPage: true, brands: ['Nike', 'Levis', 'Zara'] })),
    )
    expect(result).toEqual({
      kind: 'review',
      matched: [
        { id: 'nike', name: 'Nike' },
        { id: 'levis', name: "Levi's", variants: [{ type: 'string', value: 'Levis' }] },
      ],
      unknown: ['Zara'],
    })
  })

  it('returns "empty" when the filter page has no brands selected', async () => {
    const result = await captureForPopup(
      deps(async () => ({ ok: true, isFilterPage: true, brands: [] })),
    )
    expect(result).toEqual({ kind: 'empty' })
  })

  it('returns "not-filter-page" when the page is not a listing page', async () => {
    const result = await captureForPopup(
      deps(async () => ({ ok: true, isFilterPage: false, brands: [] })),
    )
    expect(result).toEqual({ kind: 'not-filter-page' })
  })

  it('returns an error (not a throw) when the content script is unreachable', async () => {
    const result = await captureForPopup(
      deps(async () => {
        throw new Error('Could not establish connection')
      }),
    )
    expect(result.kind).toBe('error')
  })

  it('returns an error when the content script responds ok:false', async () => {
    const result = await captureForPopup(deps(async () => ({ ok: false, reason: 'unsupported' })))
    expect(result).toEqual({ kind: 'error', message: 'unsupported' })
  })
})
