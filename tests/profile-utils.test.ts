import { describe, it, expect } from 'vitest'
import { slugifyName, generateUniqueProfileId, generateCloneName } from '../lib/profile-utils'

describe('slugifyName', () => {
  it('lowercases + hyphenates ASCII names', () => {
    expect(slugifyName('Tommy Hilfiger')).toBe('tommy-hilfiger')
  })
  it('strips punctuation and trailing whitespace', () => {
    expect(slugifyName('My Brands!!!  ')).toBe('my-brands')
  })
  it('returns empty string when nothing survives', () => {
    expect(slugifyName('???')).toBe('')
    expect(slugifyName('   ')).toBe('')
  })
  it('strips leading/trailing hyphens', () => {
    expect(slugifyName('--foo--')).toBe('foo')
  })
})

describe('generateUniqueProfileId', () => {
  it('returns the bare slug when nothing is taken', () => {
    expect(generateUniqueProfileId('My Brands', new Set())).toBe('my-brands')
  })
  it('suffixes -2 when the base slug is taken', () => {
    expect(generateUniqueProfileId('My Brands', new Set(['my-brands']))).toBe('my-brands-2')
  })
  it('skips past existing numbered suffixes', () => {
    expect(generateUniqueProfileId('My Brands', new Set(['my-brands', 'my-brands-2']))).toBe(
      'my-brands-3',
    )
  })
  it('returns empty string when the name slugs to empty', () => {
    expect(generateUniqueProfileId('???', new Set())).toBe('')
  })
})

describe('generateCloneName', () => {
  it('returns "X (copy)" when no copies exist', () => {
    expect(generateCloneName('My Brands', new Set())).toBe('My Brands (copy)')
  })
  it('returns "X (copy 2)" when "X (copy)" is taken', () => {
    expect(generateCloneName('My Brands', new Set(['My Brands (copy)']))).toBe('My Brands (copy 2)')
  })
  it('skips past existing numbered copies', () => {
    expect(
      generateCloneName(
        'My Brands',
        new Set(['My Brands (copy)', 'My Brands (copy 2)', 'My Brands (copy 3)']),
      ),
    ).toBe('My Brands (copy 4)')
  })
})
