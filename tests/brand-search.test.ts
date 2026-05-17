import { describe, it, expect } from 'vitest'
import type { Brand } from '../lib/config'
import { searchBrands } from '../lib/brand-search'

const BRANDS: Brand[] = [
  { id: 'levis', name: "Levi's" },
  { id: 'tommy-hilfiger', name: 'Tommy Hilfiger' },
  { id: 'tommy-jeans', name: 'Tommy Jeans' },
  { id: 'casio', name: 'Casio', variants: [{ type: 'string', value: 'CASIO Watch' }] },
  { id: 'fossil', name: 'FOSSIL', variants: [{ type: 'regex', value: '^foss' }] },
]

describe('searchBrands', () => {
  it('returns all brands (in order) for an empty query', () => {
    expect(searchBrands(BRANDS, '').map((b) => b.id)).toEqual(BRANDS.map((b) => b.id))
  })

  it('returns all brands for a whitespace-only query', () => {
    expect(searchBrands(BRANDS, '   ').map((b) => b.id)).toEqual(BRANDS.map((b) => b.id))
  })

  it('matches substrings case-insensitively on name', () => {
    expect(searchBrands(BRANDS, 'tommy').map((b) => b.id)).toEqual([
      'tommy-hilfiger',
      'tommy-jeans',
    ])
    expect(searchBrands(BRANDS, 'TOMMY').map((b) => b.id)).toEqual([
      'tommy-hilfiger',
      'tommy-jeans',
    ])
  })

  it('matches substrings on variant.value (string variant)', () => {
    expect(searchBrands(BRANDS, 'watch').map((b) => b.id)).toContain('casio')
  })

  it('matches substrings on variant.value (regex variant, treated as literal text)', () => {
    expect(searchBrands(BRANDS, '^foss').map((b) => b.id)).toContain('fossil')
  })

  it('sorts exact-name matches before substring matches', () => {
    const result = searchBrands(BRANDS, 'tommy hilfiger')
    expect(result[0]!.id).toBe('tommy-hilfiger')
  })

  it('preserves insertion order across two substring matches', () => {
    const result = searchBrands(BRANDS, 'tommy')
    expect(result.map((b) => b.id)).toEqual(['tommy-hilfiger', 'tommy-jeans'])
  })

  it('returns an empty array when nothing matches', () => {
    expect(searchBrands(BRANDS, 'no-such-brand-xyz')).toEqual([])
  })

  it('does not mutate the input', () => {
    const before = BRANDS.map((b) => b.id)
    searchBrands(BRANDS, 'tommy')
    expect(BRANDS.map((b) => b.id)).toEqual(before)
  })
})
