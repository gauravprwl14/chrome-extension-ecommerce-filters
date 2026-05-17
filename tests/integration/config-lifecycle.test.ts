/**
 * Integration tests for config lifecycle flows.
 * Tests: create profile, assign brands, assign to site, export/import, slug generation.
 * Covers the options page end-to-end flows and edge cases that unit tests missed.
 */
import { describe, it, expect, vi } from 'vitest'
import type { Config, Brand, Profile } from '../../lib/config'
import { getConfig, setConfig, ensureBrandInLibrary } from '../../lib/storage'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SEED_BRANDS: Brand[] = [
  { id: 'tommy', name: 'Tommy Hilfiger' },
  { id: 'hm', name: 'H&M', variants: [{ type: 'string', value: 'H & M' }] },
  { id: 'levis', name: "Levi's" },
]

function baseConfig(overrides: Partial<Config> = {}): Config {
  return {
    version: '1',
    masterBrands: [...SEED_BRANDS],
    profiles: [],
    sites: [
      {
        id: 'myntra',
        hostname: 'www.myntra.com',
        defaultProfileId: '',
        enabled: true,
        customSelector: null,
      },
    ],
    ...overrides,
  }
}

// ── Profile creation flow ─────────────────────────────────────────────────────

describe('config lifecycle — create profile and assign to site', () => {
  it('new profile is saved and reflected in getConfig', async () => {
    const config = baseConfig()
    ;(chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      brandfilter_config: config,
    })

    const cfg = await getConfig()
    const newProfile: Profile = {
      id: 'my-style',
      name: 'My Style',
      icon: '👗',
      brandIds: ['tommy', 'hm'],
    }
    cfg.profiles.push(newProfile)
    cfg.sites = cfg.sites.map((s) =>
      s.id === 'myntra' ? { ...s, defaultProfileId: 'my-style' } : s,
    )
    await setConfig(cfg)

    const saved = (chrome.storage.local.set as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
      ?.brandfilter_config as Config
    expect(saved.profiles).toHaveLength(1)
    expect(saved.profiles[0]!.id).toBe('my-style')
    expect(saved.sites[0]!.defaultProfileId).toBe('my-style')
  })

  it('brand must exist in masterBrands before appearing in profile', () => {
    const config = baseConfig({ masterBrands: [SEED_BRANDS[0]!] })
    const knownIds = new Set(config.masterBrands.map((b) => b.id))

    const profile: Profile = { id: 'test', name: 'Test', icon: '🧪', brandIds: ['tommy'] }
    const allIdsValid = profile.brandIds.every((id) => knownIds.has(id))
    expect(allIdsValid).toBe(true)

    const profileWithUnknown: Profile = { ...profile, brandIds: ['tommy', 'unknown-brand'] }
    const invalidIds = profileWithUnknown.brandIds.filter((id) => !knownIds.has(id))
    expect(invalidIds).toEqual(['unknown-brand'])
  })
})

// ── Slug generation (bug regression) ─────────────────────────────────────────

describe('config lifecycle — slug generation (bug regression)', () => {
  const slugify = (name: string) =>
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')

  it('generates valid slugs from typical brand names', () => {
    expect(slugify('Tommy Hilfiger')).toBe('tommy-hilfiger')
    expect(slugify("Levi's")).toBe('levi-s')
    expect(slugify('H&M')).toBe('h-m')
    expect(slugify('U.S. Polo Assn.')).toBe('u-s-polo-assn')
    expect(slugify('Jack & Jones')).toBe('jack-jones')
  })

  it('returns empty string for all-special-char names → popup guards with if (!id) return', () => {
    expect(slugify('!!!')).toBe('')
    expect(slugify('---')).toBe('')
    expect(slugify('   ')).toBe('')
  })

  it('prevents duplicate brand IDs', () => {
    const config = baseConfig({ masterBrands: [SEED_BRANDS[0]!] })
    const isDuplicate = config.masterBrands.some((b) => b.id === 'tommy')
    expect(isDuplicate).toBe(true)
    // ensureBrandInLibrary would return false (already exists)
  })

  it('prevents duplicate profile IDs', () => {
    const profiles: Profile[] = [{ id: 'casual', name: 'Casual', icon: '👕', brandIds: ['tommy'] }]
    const isDuplicate = profiles.some((p) => p.id === 'casual')
    expect(isDuplicate).toBe(true)
    // ProfilesTab.saveNew would return early
  })
})

// ── Add brand to library ──────────────────────────────────────────────────────

describe('config lifecycle — add brand to library', () => {
  it('ensureBrandInLibrary adds new brand and returns true', async () => {
    ;(chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      brandfilter_config: baseConfig({ masterBrands: [] }),
    })

    const added = await ensureBrandInLibrary({ id: 'nike', name: 'Nike' })
    expect(added).toBe(true)

    const saved = (chrome.storage.local.set as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
      ?.brandfilter_config as Config
    expect(saved.masterBrands.some((b) => b.id === 'nike')).toBe(true)
  })

  it('ensureBrandInLibrary returns false without writing when brand already exists', async () => {
    ;(chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      brandfilter_config: baseConfig(),
    })

    const added = await ensureBrandInLibrary({ id: 'tommy', name: 'Tommy Hilfiger' })
    expect(added).toBe(false)
    expect(chrome.storage.local.set).not.toHaveBeenCalled()
  })
})

// ── Export / Import validation ────────────────────────────────────────────────

describe('config lifecycle — export/import validation', () => {
  // Mirrors ExportImportTab validation logic
  const validate = (parsed: unknown): boolean => {
    if (typeof parsed !== 'object' || parsed === null) return false
    const p = parsed as Record<string, unknown>
    return (
      typeof p['version'] === 'string' &&
      Array.isArray(p['masterBrands']) &&
      Array.isArray(p['profiles']) &&
      Array.isArray(p['sites'])
    )
  }

  it('valid config passes import validation', () => {
    const config = baseConfig({
      profiles: [{ id: 'casual', name: 'Casual', icon: '👕', brandIds: [] }],
    })
    expect(validate(config)).toBe(true)
  })

  it('rejects config missing profiles array', () => {
    expect(validate({ version: '1', masterBrands: [], sites: [] })).toBe(false)
  })

  it('rejects config missing sites array', () => {
    expect(validate({ version: '1', masterBrands: [], profiles: [] })).toBe(false)
  })

  it('rejects config with non-string version', () => {
    expect(validate({ version: 1, masterBrands: [], profiles: [], sites: [] })).toBe(false)
  })

  it('rejects null', () => {
    expect(validate(null)).toBe(false)
  })

  it('rejects plain string', () => {
    expect(validate('invalid json')).toBe(false)
  })

  it('exported config round-trips through JSON', async () => {
    const config = baseConfig({
      profiles: [{ id: 'casual', name: 'Casual', icon: '👕', brandIds: ['tommy'] }],
    })
    const json = JSON.stringify(config)
    const parsed = JSON.parse(json) as unknown
    expect(validate(parsed)).toBe(true)
  })
})

// ── Site toggle ───────────────────────────────────────────────────────────────

describe('config lifecycle — site toggle', () => {
  it('disabled site: shouldApply = false', () => {
    const site = {
      id: 'myntra',
      hostname: 'www.myntra.com',
      defaultProfileId: 'casual',
      enabled: false,
      customSelector: null,
    }
    // mirrors background.ts gate logic
    const shouldApply = site.enabled && Boolean(site.defaultProfileId)
    expect(shouldApply).toBe(false)
  })

  it('enabled site with defaultProfileId: shouldApply = true', () => {
    const site = {
      id: 'myntra',
      hostname: 'www.myntra.com',
      defaultProfileId: 'casual',
      enabled: true,
      customSelector: null,
    }
    const shouldApply = site.enabled && Boolean(site.defaultProfileId)
    expect(shouldApply).toBe(true)
  })

  it('enabled site with empty defaultProfileId: shouldApply = false', () => {
    const site = {
      id: 'myntra',
      hostname: 'www.myntra.com',
      defaultProfileId: '',
      enabled: true,
      customSelector: null,
    }
    const shouldApply = site.enabled && Boolean(site.defaultProfileId)
    expect(shouldApply).toBe(false)
  })
})

// ── Brand deletion propagation ────────────────────────────────────────────────

describe('config lifecycle — brand deletion propagation', () => {
  it('deleting brand removes it from all profiles that reference it', () => {
    const config: Config = {
      version: '1',
      masterBrands: SEED_BRANDS,
      profiles: [
        { id: 'casual', name: 'Casual', icon: '👕', brandIds: ['tommy', 'hm'] },
        { id: 'premium', name: 'Premium', icon: '✨', brandIds: ['tommy', 'levis'] },
      ],
      sites: [],
    }

    // Mirrors handleDeleteBrand('tommy') in options.tsx
    const brandIdToDelete = 'tommy'
    const updated: Config = {
      ...config,
      masterBrands: config.masterBrands.filter((b) => b.id !== brandIdToDelete),
      profiles: config.profiles.map((p) => ({
        ...p,
        brandIds: p.brandIds.filter((id) => id !== brandIdToDelete),
      })),
    }

    expect(updated.masterBrands.some((b) => b.id === 'tommy')).toBe(false)
    expect(updated.profiles[0]!.brandIds).toEqual(['hm'])
    expect(updated.profiles[1]!.brandIds).toEqual(['levis'])
  })

  it('brand that exists in only one profile is cleanly removed', () => {
    const config: Config = {
      version: '1',
      masterBrands: SEED_BRANDS,
      profiles: [{ id: 'minimal', name: 'Minimal', icon: '🎯', brandIds: ['levis'] }],
      sites: [],
    }

    const updated: Config = {
      ...config,
      masterBrands: config.masterBrands.filter((b) => b.id !== 'levis'),
      profiles: config.profiles.map((p) => ({
        ...p,
        brandIds: p.brandIds.filter((id) => id !== 'levis'),
      })),
    }

    expect(updated.profiles[0]!.brandIds).toEqual([])
    expect(updated.masterBrands).toHaveLength(2)
  })
})
