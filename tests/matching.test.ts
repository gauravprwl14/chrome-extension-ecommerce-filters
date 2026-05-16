import { describe, it, expect } from 'vitest'
import { normalizeLabel, matchesBrand, findMatchIndex } from '../lib/matching'
import type { Brand } from '../lib/config'

describe('normalizeLabel', () => {
  it('lowercases and trims', () => {
    expect(normalizeLabel('  Tommy Hilfiger  ')).toBe('tommy hilfiger')
  })
  it('collapses multiple spaces', () => {
    expect(normalizeLabel('H &  M')).toBe('h & m')
  })
})

describe('matchesBrand — exact name', () => {
  const brand: Brand = { id: 'titan', name: 'Titan' }
  it('matches exact name case-insensitively', () => {
    expect(matchesBrand(brand, 'TITAN')).toBe(true)
    expect(matchesBrand(brand, 'titan')).toBe(true)
  })
  it('does not match unrelated label', () => {
    expect(matchesBrand(brand, 'Timex')).toBe(false)
  })
})

describe('matchesBrand — string variants', () => {
  const brand: Brand = {
    id: 'hm',
    name: 'H&M',
    variants: [
      { type: 'string', value: 'H & M' },
      { type: 'string', value: 'H and M' },
    ],
  }
  it('matches string variant via contains (case-insensitive)', () => {
    expect(matchesBrand(brand, 'H & M')).toBe(true)
    expect(matchesBrand(brand, 'h and m')).toBe(true)
  })
  it('does not match when neither name nor variant matches', () => {
    expect(matchesBrand(brand, 'Zara')).toBe(false)
  })
})

describe('matchesBrand — regex variants', () => {
  const brand: Brand = {
    id: 'hm',
    name: 'H&M',
    variants: [{ type: 'regex', value: 'H\\s*&\\s*M' }],
  }
  it('matches via regex', () => {
    expect(matchesBrand(brand, 'H&M')).toBe(true)
    expect(matchesBrand(brand, 'H & M')).toBe(true)
    expect(matchesBrand(brand, 'H  &  M')).toBe(true)
  })
  it('does not match non-matching label', () => {
    expect(matchesBrand(brand, 'HnM')).toBe(false)
  })
})

describe('matchesBrand — invalid regex', () => {
  const brand: Brand = {
    id: 'bad',
    name: 'Bad',
    variants: [{ type: 'regex', value: '[invalid' }],
  }
  it('skips invalid regex without throwing', () => {
    expect(() => matchesBrand(brand, 'Bad')).not.toThrow()
    expect(matchesBrand(brand, 'Bad')).toBe(true) // still matches by name
  })
})

describe('findMatchIndex', () => {
  const brand: Brand = { id: 'casio', name: 'Casio' }
  it('returns index of matching label', () => {
    expect(findMatchIndex(brand, ['Titan', 'Casio', 'Fossil'])).toBe(1)
  })
  it('returns -1 when no match', () => {
    expect(findMatchIndex(brand, ['Titan', 'Fossil'])).toBe(-1)
  })
})
