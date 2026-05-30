import { describe, it, expect } from 'vitest'
import type { Brand, Config } from '../lib/config'
import {
  siteSupportsCapture,
  reconcileCapturedBrands,
  buildCaptureProfile,
  buildCaptureUpdate,
  captureResponse,
} from '../lib/capture'

const brand = (id: string, name: string, variants?: Brand['variants']): Brand => ({
  id,
  name,
  ...(variants ? { variants } : {}),
})

const masterBrands: Brand[] = [
  brand('tommy-hilfiger', 'Tommy Hilfiger'),
  brand('levis', "Levi's", [{ type: 'string', value: 'Levis' }]),
  brand('nike', 'Nike'),
]

const baseConfig = (): Config => ({
  version: '2',
  masterBrands: masterBrands.map((b) => ({ ...b })),
  profiles: [
    { id: 'my-brands', name: 'My Brands', icon: '👜', brandIds: ['nike'], isSystem: true },
  ],
  sites: [],
})

describe('siteSupportsCapture', () => {
  it('supports myntra in v1', () => {
    expect(siteSupportsCapture('myntra')).toBe(true)
  })
  it('supports ajio (DOM-scan implementation)', () => {
    expect(siteSupportsCapture('ajio')).toBe(true)
  })
  it('does not support unknown sites', () => {
    expect(siteSupportsCapture('flipkart')).toBe(false)
  })
})

describe('reconcileCapturedBrands', () => {
  it('matches an exact brand name', () => {
    const { matched, unknown } = reconcileCapturedBrands(['Tommy Hilfiger'], masterBrands)
    expect(matched.map((b) => b.id)).toEqual(['tommy-hilfiger'])
    expect(unknown).toEqual([])
  })

  it('matches via a string variant (site name differs from master name)', () => {
    const { matched, unknown } = reconcileCapturedBrands(['Levis'], masterBrands)
    expect(matched.map((b) => b.id)).toEqual(['levis'])
    expect(unknown).toEqual([])
  })

  it('reports brands not in the library as unknown', () => {
    const { matched, unknown } = reconcileCapturedBrands(['Zara'], masterBrands)
    expect(matched).toEqual([])
    expect(unknown).toEqual(['Zara'])
  })

  it('dedupes when two captured strings map to the same master brand', () => {
    const { matched } = reconcileCapturedBrands(['Levis', "Levi's"], masterBrands)
    expect(matched.map((b) => b.id)).toEqual(['levis'])
  })

  it('dedupes unknown strings case-insensitively, preserving first casing', () => {
    const { unknown } = reconcileCapturedBrands(['Zara', 'zara'], masterBrands)
    expect(unknown).toEqual(['Zara'])
  })

  it('splits a mixed selection into matched and unknown', () => {
    const { matched, unknown } = reconcileCapturedBrands(
      ['Nike', 'Zara', 'Tommy Hilfiger', 'H&M'],
      masterBrands,
    )
    expect(matched.map((b) => b.id)).toEqual(['nike', 'tommy-hilfiger'])
    expect(unknown).toEqual(['Zara', 'H&M'])
  })

  it('returns empty groups for an empty capture', () => {
    expect(reconcileCapturedBrands([], masterBrands)).toEqual({ matched: [], unknown: [] })
  })
})

describe('captureResponse', () => {
  it('reads selected brands when on a filter page', async () => {
    const adapter = {
      isFilterPage: () => true,
      readSelectedBrands: async () => ['Nike', 'Puma'],
    }
    expect(await captureResponse(adapter)).toEqual({
      ok: true,
      isFilterPage: true,
      brands: ['Nike', 'Puma'],
    })
  })

  it('reports isFilterPage:false with no brands when not on a filter page', async () => {
    let read = false
    const adapter = {
      isFilterPage: () => false,
      readSelectedBrands: async () => {
        read = true
        return ['should-not-read']
      },
    }
    expect(await captureResponse(adapter)).toEqual({
      ok: true,
      isFilterPage: false,
      brands: [],
    })
    expect(read).toBe(false) // short-circuits — no point reading a non-listing page
  })
})

describe('buildCaptureProfile', () => {
  it('creates an isSystem:false profile referencing the matched brands', () => {
    const next = buildCaptureProfile(baseConfig(), {
      name: 'Weekend',
      icon: '🧥',
      matchedIds: ['nike', 'levis'],
      promoteStrings: [],
    })
    const profile = next.profiles.find((p) => p.name === 'Weekend')!
    expect(profile.isSystem).toBe(false)
    expect(profile.id).toBe('weekend')
    expect(profile.brandIds).toEqual(['nike', 'levis'])
  })

  it('promotes toggled unknown brands into masterBrands BEFORE referencing them', () => {
    const next = buildCaptureProfile(baseConfig(), {
      name: 'New',
      icon: '🧥',
      matchedIds: ['nike'],
      promoteStrings: ['Zara'],
    })
    // brand exists in master
    const promoted = next.masterBrands.find((b) => b.name === 'Zara')!
    expect(promoted).toBeDefined()
    expect(promoted.id).toBe('zara')
    // and the profile references it
    const profile = next.profiles.find((p) => p.name === 'New')!
    expect(profile.brandIds).toContain('zara')
    expect(profile.brandIds).toEqual(['nike', 'zara'])
  })

  it('drops unknown brands that were not toggled on (not in promoteStrings)', () => {
    const next = buildCaptureProfile(baseConfig(), {
      name: 'Skip',
      icon: '🧥',
      matchedIds: ['nike'],
      promoteStrings: [], // user left "Zara" unticked
    })
    expect(next.masterBrands.some((b) => b.name === 'Zara')).toBe(false)
    const profile = next.profiles.find((p) => p.name === 'Skip')!
    expect(profile.brandIds).toEqual(['nike'])
  })

  it('gives a promoted brand a unique id when its slug collides with a different existing brand', () => {
    const cfg = baseConfig()
    cfg.masterBrands.push(brand('zara', 'Zara Home')) // existing different brand owns slug "zara"
    const next = buildCaptureProfile(cfg, {
      name: 'X',
      icon: '🧥',
      matchedIds: [],
      promoteStrings: ['Zara'],
    })
    const promoted = next.masterBrands.find((b) => b.name === 'Zara')!
    expect(promoted.id).toBe('zara-2')
    expect(next.profiles.find((p) => p.name === 'X')!.brandIds).toEqual(['zara-2'])
  })

  it('gives unique ids when two promoted strings slug to the same base', () => {
    const next = buildCaptureProfile(baseConfig(), {
      name: 'Y',
      icon: '🧥',
      matchedIds: [],
      promoteStrings: ['Mango', 'mango'],
    })
    const ids = next.masterBrands.filter((b) => b.id.startsWith('mango')).map((b) => b.id)
    expect(ids).toEqual(['mango', 'mango-2'])
  })

  it('skips promoted strings that slug to empty', () => {
    const next = buildCaptureProfile(baseConfig(), {
      name: 'Z',
      icon: '🧥',
      matchedIds: ['nike'],
      promoteStrings: ['???'],
    })
    expect(next.profiles.find((p) => p.name === 'Z')!.brandIds).toEqual(['nike'])
  })

  it('gives the new profile a unique id when the name collides with an existing profile', () => {
    const cfg = baseConfig()
    cfg.profiles.push({ id: 'weekend', name: 'Weekend', icon: '🧥', brandIds: [], isSystem: false })
    const next = buildCaptureProfile(cfg, {
      name: 'Weekend',
      icon: '🧥',
      matchedIds: ['nike'],
      promoteStrings: [],
    })
    const created = next.profiles.filter((p) => p.name === 'Weekend')
    expect(created).toHaveLength(2)
    expect(created.some((p) => p.id === 'weekend-2')).toBe(true)
  })

  it('does not mutate the input config', () => {
    const cfg = baseConfig()
    const before = JSON.stringify(cfg)
    buildCaptureProfile(cfg, {
      name: 'Immutable',
      icon: '🧥',
      matchedIds: ['nike'],
      promoteStrings: ['Zara'],
    })
    expect(JSON.stringify(cfg)).toBe(before)
  })
})

describe('buildCaptureUpdate', () => {
  const withUserProfile = (): Config => {
    const cfg = baseConfig()
    cfg.profiles.push({
      id: 'weekend',
      name: 'Weekend',
      icon: '🧥',
      brandIds: ['tommy-hilfiger', 'levis'],
      isSystem: false,
    })
    return cfg
  }

  it('replace mode sets the profile brands to exactly the captured selection', () => {
    const next = buildCaptureUpdate(withUserProfile(), {
      profileId: 'weekend',
      mode: 'replace',
      matchedIds: ['nike'],
      promoteStrings: [],
    })
    expect(next.profiles.find((p) => p.id === 'weekend')!.brandIds).toEqual(['nike'])
  })

  it('merge mode unions captured brands with the existing ones (deduped, order preserved)', () => {
    const next = buildCaptureUpdate(withUserProfile(), {
      profileId: 'weekend',
      mode: 'merge',
      matchedIds: ['nike', 'levis'], // levis already present
      promoteStrings: [],
    })
    expect(next.profiles.find((p) => p.id === 'weekend')!.brandIds).toEqual([
      'tommy-hilfiger',
      'levis',
      'nike',
    ])
  })

  it('promotes new brands into masterBrands and includes them (replace)', () => {
    const next = buildCaptureUpdate(withUserProfile(), {
      profileId: 'weekend',
      mode: 'replace',
      matchedIds: ['nike'],
      promoteStrings: ['Zara'],
    })
    expect(next.masterBrands.find((b) => b.name === 'Zara')!.id).toBe('zara')
    expect(next.profiles.find((p) => p.id === 'weekend')!.brandIds).toEqual(['nike', 'zara'])
  })

  it('promotes new brands and appends them in merge mode', () => {
    const next = buildCaptureUpdate(withUserProfile(), {
      profileId: 'weekend',
      mode: 'merge',
      matchedIds: [],
      promoteStrings: ['Zara'],
    })
    expect(next.profiles.find((p) => p.id === 'weekend')!.brandIds).toEqual([
      'tommy-hilfiger',
      'levis',
      'zara',
    ])
  })

  it('refuses to update a system profile (returns config unchanged)', () => {
    const cfg = withUserProfile()
    const before = JSON.stringify(cfg)
    const next = buildCaptureUpdate(cfg, {
      profileId: 'my-brands', // isSystem: true
      mode: 'replace',
      matchedIds: ['levis'],
      promoteStrings: [],
    })
    expect(JSON.stringify(next)).toBe(before)
  })

  it('returns config unchanged when the profile id does not exist', () => {
    const cfg = withUserProfile()
    const before = JSON.stringify(cfg)
    const next = buildCaptureUpdate(cfg, {
      profileId: 'ghost',
      mode: 'replace',
      matchedIds: ['nike'],
      promoteStrings: [],
    })
    expect(JSON.stringify(next)).toBe(before)
  })

  it('does not mutate the input config', () => {
    const cfg = withUserProfile()
    const before = JSON.stringify(cfg)
    buildCaptureUpdate(cfg, {
      profileId: 'weekend',
      mode: 'merge',
      matchedIds: ['nike'],
      promoteStrings: ['Zara'],
    })
    expect(JSON.stringify(cfg)).toBe(before)
  })
})
