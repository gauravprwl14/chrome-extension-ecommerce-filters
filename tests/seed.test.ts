/**
 * Tests for the idempotent seed-merge migration that runs on every startup
 * (background.ts → runSeedMigration). The migration must:
 *   - Add missing seed brands without touching existing ones
 *   - Create curated profiles (e.g. Watches) only if absent
 *   - Skip profile creation when none of its brand IDs exist yet
 *   - Be safe to invoke repeatedly
 */
import { describe, it, expect } from 'vitest'
import type { Brand, Profile, Site } from '../lib/config'
import {
  mergeSeedsIntoConfig,
  bootstrapConfig,
  migrateToV2,
  WATCHES_PROFILE,
  DEFAULT_PROFILE_ID,
  DEPRECATED_BRAND_IDS,
} from '../lib/seed'

const SEED_BRANDS: Brand[] = [
  { id: 'timex', name: 'Timex' },
  { id: 'casio', name: 'Casio' },
  { id: 'fossil', name: 'FOSSIL' },
]

function makeBaseConfig(): { masterBrands: Brand[]; profiles: Profile[] } {
  return {
    masterBrands: [
      { id: 'tommy-hilfiger', name: 'Tommy Hilfiger' },
      { id: 'calvin-klein', name: 'Calvin Klein' },
    ],
    profiles: [
      {
        id: DEFAULT_PROFILE_ID,
        name: 'My Brands',
        icon: '🛍',
        brandIds: ['tommy-hilfiger', 'calvin-klein'],
      },
    ],
  }
}

describe('mergeSeedsIntoConfig — brand merging', () => {
  it('adds brands that are missing from masterBrands', () => {
    const cfg = makeBaseConfig()
    const changed = mergeSeedsIntoConfig(cfg, SEED_BRANDS, [])
    expect(changed).toBe(true)
    const ids = cfg.masterBrands.map((b) => b.id).sort()
    expect(ids).toContain('timex')
    expect(ids).toContain('casio')
    expect(ids).toContain('fossil')
  })

  it('does NOT overwrite an existing brand with the same id', () => {
    const cfg = makeBaseConfig()
    cfg.masterBrands.push({ id: 'timex', name: 'Timex — user edited' })
    mergeSeedsIntoConfig(cfg, SEED_BRANDS, [])
    const timex = cfg.masterBrands.find((b) => b.id === 'timex')!
    expect(timex.name).toBe('Timex — user edited')
  })

  it('is idempotent: a second invocation reports no change', () => {
    const cfg = makeBaseConfig()
    mergeSeedsIntoConfig(cfg, SEED_BRANDS, [])
    const changedAgain = mergeSeedsIntoConfig(cfg, SEED_BRANDS, [])
    expect(changedAgain).toBe(false)
  })
})

describe('mergeSeedsIntoConfig — profile merging', () => {
  it('creates a seed profile when absent, with only valid brand IDs', () => {
    const cfg = makeBaseConfig()
    // Add brands so the Watches profile has something to point at
    mergeSeedsIntoConfig(cfg, SEED_BRANDS, [])
    const changed = mergeSeedsIntoConfig(cfg, SEED_BRANDS, [WATCHES_PROFILE])
    expect(changed).toBe(true)
    const watches = cfg.profiles.find((p) => p.id === 'watches')
    expect(watches).toBeDefined()
    // Watches seed references many brands; only ones in masterBrands should survive.
    for (const id of watches!.brandIds) {
      expect(cfg.masterBrands.some((b) => b.id === id)).toBe(true)
    }
    // The seed listed 'timex' & 'casio' which we added; both should be in the profile
    expect(watches!.brandIds).toContain('timex')
    expect(watches!.brandIds).toContain('casio')
  })

  it('does NOT overwrite an existing profile with the same id', () => {
    const cfg = makeBaseConfig()
    cfg.profiles.push({
      id: 'watches',
      name: 'My Custom Watches',
      icon: '🕰',
      brandIds: ['tommy-hilfiger'],
    })
    mergeSeedsIntoConfig(cfg, SEED_BRANDS, [WATCHES_PROFILE])
    const watches = cfg.profiles.find((p) => p.id === 'watches')!
    expect(watches.name).toBe('My Custom Watches')
    expect(watches.brandIds).toEqual(['tommy-hilfiger'])
  })

  it('skips creating a profile when none of its brand IDs exist yet', () => {
    // Base config with brands that do NOT overlap WATCHES_PROFILE.brandIds.
    const cfg = {
      masterBrands: [{ id: 'wholly-unrelated', name: 'Wholly Unrelated' }],
      profiles: [
        {
          id: DEFAULT_PROFILE_ID,
          name: 'My Brands',
          icon: '🛍',
          brandIds: ['wholly-unrelated'],
        },
      ],
    }
    // Pass NO seed brands so Watches has nothing to point at
    const changed = mergeSeedsIntoConfig(cfg, [], [WATCHES_PROFILE])
    expect(changed).toBe(false)
    expect(cfg.profiles.find((p) => p.id === 'watches')).toBeUndefined()
  })

  it('does NOT touch the default "my-brands" profile when no defaultProfileId opt given', () => {
    const cfg = makeBaseConfig()
    const before = JSON.stringify(cfg.profiles.find((p) => p.id === DEFAULT_PROFILE_ID))
    mergeSeedsIntoConfig(cfg, SEED_BRANDS, [WATCHES_PROFILE])
    const after = JSON.stringify(cfg.profiles.find((p) => p.id === DEFAULT_PROFILE_ID))
    expect(after).toBe(before)
  })
})

// ── New-brand propagation into the default profile ──────────────────────────
//
// When a new brand is added to assets/default-brands.json on an existing
// install, it should appear BOTH in masterBrands AND in the user's "My Brands"
// default profile — otherwise the user has to manually re-tick each new brand
// every time we release the extension. The Watches profile (and any other
// curated profile) is unaffected: only the explicitly-named defaultProfileId
// receives the propagation.

describe('mergeSeedsIntoConfig — default-profile propagation', () => {
  it('pushes a newly-added seed brand into the named default profile', () => {
    const cfg = makeBaseConfig()
    const seedWithExtra = [...SEED_BRANDS, { id: 'new-brand', name: 'New Brand' }]
    mergeSeedsIntoConfig(cfg, seedWithExtra, [], { defaultProfileId: DEFAULT_PROFILE_ID })
    const defaultProfile = cfg.profiles.find((p) => p.id === DEFAULT_PROFILE_ID)!
    expect(defaultProfile.brandIds).toContain('new-brand')
  })

  it('does NOT push the new brand into OTHER (curated) profiles', () => {
    const cfg = makeBaseConfig()
    cfg.profiles.push({
      id: 'watches',
      name: 'Watches',
      icon: '⌚',
      brandIds: ['tommy-hilfiger'],
    })
    mergeSeedsIntoConfig(cfg, [{ id: 'rare-rabbit', name: 'RARE RABBIT' }], [], {
      defaultProfileId: DEFAULT_PROFILE_ID,
    })
    const watches = cfg.profiles.find((p) => p.id === 'watches')!
    expect(watches.brandIds).not.toContain('rare-rabbit')
  })

  it('does NOT push when the brand was already in masterBrands (respects later user trims)', () => {
    // Simulates: user previously had "old-brand" in my-brands, then removed it.
    // On subsequent bootstraps we must NOT re-add it.
    const cfg = makeBaseConfig()
    cfg.masterBrands.push({ id: 'old-brand', name: 'Old Brand' })
    // user removed it from my-brands → not in brandIds
    mergeSeedsIntoConfig(cfg, [{ id: 'old-brand', name: 'Old Brand' }], [], {
      defaultProfileId: DEFAULT_PROFILE_ID,
    })
    const defaultProfile = cfg.profiles.find((p) => p.id === DEFAULT_PROFILE_ID)!
    expect(defaultProfile.brandIds).not.toContain('old-brand')
  })

  it('is a no-op for profile push when the default profile is missing', () => {
    const cfg: { masterBrands: Brand[]; profiles: Profile[] } = {
      masterBrands: [],
      profiles: [],
    }
    const changed = mergeSeedsIntoConfig(cfg, [{ id: 'new-brand', name: 'New' }], [], {
      defaultProfileId: DEFAULT_PROFILE_ID,
    })
    expect(changed).toBe(true) // brand was still added to masterBrands
    expect(cfg.masterBrands.map((b) => b.id)).toContain('new-brand')
    expect(cfg.profiles).toEqual([])
  })
})

// ── Deprecated brand removal ───────────────────────────────────────────────
//
// User asked to retire "highlander" and "red-tape" from every install. The
// migration must remove them from masterBrands AND from every profile's
// brandIds, never re-add them on a subsequent pass even if they reappear in
// the seed by mistake, and be idempotent.

describe('mergeSeedsIntoConfig — deprecated brand removal', () => {
  it('removes a deprecated brand from masterBrands', () => {
    const cfg = makeBaseConfig()
    cfg.masterBrands.push({ id: 'highlander', name: 'HIGHLANDER' })
    const changed = mergeSeedsIntoConfig(cfg, [], [], { deprecatedBrandIds: ['highlander'] })
    expect(changed).toBe(true)
    expect(cfg.masterBrands.find((b) => b.id === 'highlander')).toBeUndefined()
  })

  it('removes a deprecated brand from every profile.brandIds', () => {
    const cfg = makeBaseConfig()
    cfg.masterBrands.push({ id: 'highlander', name: 'HIGHLANDER' })
    cfg.profiles[0]!.brandIds.push('highlander')
    cfg.profiles.push({
      id: 'streetwear',
      name: 'Streetwear',
      icon: '🧢',
      brandIds: ['highlander', 'tommy-hilfiger'],
    })

    mergeSeedsIntoConfig(cfg, [], [], { deprecatedBrandIds: ['highlander'] })
    for (const profile of cfg.profiles) {
      expect(profile.brandIds).not.toContain('highlander')
    }
    // Other brand IDs in those profiles are preserved
    expect(cfg.profiles.find((p) => p.id === 'streetwear')!.brandIds).toEqual(['tommy-hilfiger'])
  })

  it('refuses to re-introduce a deprecated brand even if it appears in seedBrands', () => {
    const cfg = makeBaseConfig()
    // Seed includes the deprecated id (e.g. a stale JSON we forgot to update)
    const changed = mergeSeedsIntoConfig(cfg, [{ id: 'highlander', name: 'HIGHLANDER' }], [], {
      deprecatedBrandIds: ['highlander'],
    })
    expect(changed).toBe(false)
    expect(cfg.masterBrands.find((b) => b.id === 'highlander')).toBeUndefined()
  })

  it('skips deprecated IDs when populating a newly-created curated profile', () => {
    const cfg = makeBaseConfig()
    cfg.masterBrands.push({ id: 'highlander', name: 'HIGHLANDER' })
    const profileWithDeprecated: typeof WATCHES_PROFILE = {
      id: 'street',
      name: 'Street',
      icon: '👟',
      brandIds: ['highlander', 'tommy-hilfiger'],
    }
    mergeSeedsIntoConfig(cfg, [], [profileWithDeprecated], {
      deprecatedBrandIds: ['highlander'],
    })
    const street = cfg.profiles.find((p) => p.id === 'street')!
    expect(street.brandIds).toEqual(['tommy-hilfiger']) // deprecated stripped
  })

  it('is idempotent: a second pass with no new deprecations reports no change', () => {
    const cfg = makeBaseConfig()
    cfg.masterBrands.push({ id: 'highlander', name: 'HIGHLANDER' })
    cfg.profiles[0]!.brandIds.push('highlander')
    mergeSeedsIntoConfig(cfg, [], [], { deprecatedBrandIds: ['highlander'] })
    const changedAgain = mergeSeedsIntoConfig(cfg, [], [], { deprecatedBrandIds: ['highlander'] })
    expect(changedAgain).toBe(false)
  })

  it('DEPRECATED_BRAND_IDS includes the user-retired brands', () => {
    expect(DEPRECATED_BRAND_IDS).toContain('highlander')
    expect(DEPRECATED_BRAND_IDS).toContain('red-tape')
  })
})

// ── bootstrapConfig — the SW-lifecycle regression suite ─────────────────────
//
// Bug history: the seed-migration originally ran only inside the
// `chrome.runtime.onInstalled` and `onStartup` listeners. NEITHER of those
// events fires on `chrome://extensions → Reload` — the canonical dev
// iteration path — so fresh dev installs ended up with profiles=[] and the
// popup showed "No profiles yet" forever. The unit tests for
// `mergeSeedsIntoConfig` didn't catch this because they hand-built configs;
// nobody simulated "service worker comes up with empty storage and NO
// chrome event ever fires".
//
// `bootstrapConfig` is now what runs at SW module load. These tests pin its
// contract for that scenario.

describe('bootstrapConfig — SW-init scenario (fresh install, no chrome event)', () => {
  type StoredCfg = {
    masterBrands: Brand[]
    profiles: Profile[]
    sites: Site[]
    version: string
  }

  function makeFakeStorage(initial: StoredCfg) {
    let stored: StoredCfg = JSON.parse(JSON.stringify(initial))
    return {
      read: async () => JSON.parse(JSON.stringify(stored)) as StoredCfg,
      write: async (cfg: unknown) => {
        stored = JSON.parse(JSON.stringify(cfg)) as StoredCfg
      },
      get: () => stored,
    }
  }

  function emptyCfg(): StoredCfg {
    return {
      version: '1',
      masterBrands: [],
      profiles: [],
      sites: [
        {
          id: 'myntra',
          hostname: 'www.myntra.com',
          defaultProfileId: '',
          enabled: true,
          customSelector: null,
        },
        {
          id: 'ajio',
          hostname: 'www.ajio.com',
          defaultProfileId: '',
          enabled: true,
          customSelector: null,
        },
      ],
    }
  }

  it('seeds the default profile + curated profiles from completely empty storage', async () => {
    const store = makeFakeStorage(emptyCfg())
    const result = await bootstrapConfig(SEED_BRANDS, [WATCHES_PROFILE], store.read, store.write)

    expect(result.wasFirstRun).toBe(true)
    expect(result.changed).toBe(true)

    const cfg = store.get()
    // Default "My Brands" profile exists with every seed brand
    const myBrands = cfg.profiles.find((p) => p.id === DEFAULT_PROFILE_ID)
    expect(myBrands).toBeDefined()
    expect(myBrands!.brandIds).toEqual(SEED_BRANDS.map((b) => b.id))

    // Curated Watches profile also exists
    expect(cfg.profiles.find((p) => p.id === 'watches')).toBeDefined()

    // Every built-in site got the default profile assigned
    for (const site of cfg.sites) {
      expect(site.defaultProfileId).toBe(DEFAULT_PROFILE_ID)
    }
  })

  it('does NOT re-seed on the second wake (idempotency)', async () => {
    const store = makeFakeStorage(emptyCfg())
    await bootstrapConfig(SEED_BRANDS, [WATCHES_PROFILE], store.read, store.write)
    const second = await bootstrapConfig(SEED_BRANDS, [WATCHES_PROFILE], store.read, store.write)

    expect(second.wasFirstRun).toBe(false)
    expect(second.changed).toBe(false)
  })

  it('preserves user edits to the default profile across subsequent wakes', async () => {
    const store = makeFakeStorage(emptyCfg())
    await bootstrapConfig(SEED_BRANDS, [WATCHES_PROFILE], store.read, store.write)

    // User trims "My Brands" down to a single brand
    const editedCfg = store.get()
    const myBrands = editedCfg.profiles.find((p) => p.id === DEFAULT_PROFILE_ID)!
    myBrands.brandIds = [SEED_BRANDS[0]!.id]
    await store.write(editedCfg)

    await bootstrapConfig(SEED_BRANDS, [WATCHES_PROFILE], store.read, store.write)
    const after = store.get().profiles.find((p) => p.id === DEFAULT_PROFILE_ID)!
    expect(after.brandIds).toEqual([SEED_BRANDS[0]!.id])
  })

  it('adds new curated profiles on a later wake without touching existing ones', async () => {
    // Simulate the "user upgraded the extension" scenario: storage already has
    // master brands + my-brands but the Watches profile didn't exist yet.
    const cfg = emptyCfg()
    cfg.masterBrands = [...SEED_BRANDS]
    cfg.profiles = [
      {
        id: DEFAULT_PROFILE_ID,
        name: 'My Brands',
        icon: '🛍',
        brandIds: SEED_BRANDS.map((b) => b.id),
      },
    ]
    cfg.sites = cfg.sites.map((s) => ({ ...s, defaultProfileId: DEFAULT_PROFILE_ID }))
    const store = makeFakeStorage(cfg)

    const result = await bootstrapConfig(SEED_BRANDS, [WATCHES_PROFILE], store.read, store.write)
    expect(result.wasFirstRun).toBe(false)
    expect(result.changed).toBe(true) // Watches profile was added

    const stored = store.get()
    expect(stored.profiles.find((p) => p.id === 'watches')).toBeDefined()
    expect(stored.profiles.find((p) => p.id === DEFAULT_PROFILE_ID)!.brandIds).toEqual(
      SEED_BRANDS.map((b) => b.id),
    )
  })
})

describe('WATCHES_PROFILE seed metadata', () => {
  it('has the expected id, icon, and a non-empty brand list', () => {
    expect(WATCHES_PROFILE.id).toBe('watches')
    expect(WATCHES_PROFILE.icon).toBe('⌚')
    expect(WATCHES_PROFILE.brandIds.length).toBeGreaterThan(5)
  })

  it('every brand id in WATCHES_PROFILE exists in default-brands.json', async () => {
    const defaults = (await import('../assets/default-brands.json')).default as Brand[]
    const defaultIds = new Set(defaults.map((b) => b.id))
    const missing = WATCHES_PROFILE.brandIds.filter((id) => !defaultIds.has(id))
    expect(missing).toEqual([])
  })
})

// ── isSystem propagation gating ─────────────────────────────────────────────

describe('mergeSeedsIntoConfig — isSystem propagation gating', () => {
  it('pushes new brand to default profile when isSystem: true', () => {
    const cfg = makeBaseConfig()
    cfg.profiles[0]!.isSystem = true
    mergeSeedsIntoConfig(cfg, [{ id: 'new-brand', name: 'New' }], [], {
      defaultProfileId: DEFAULT_PROFILE_ID,
    })
    expect(cfg.profiles[0]!.brandIds).toContain('new-brand')
  })

  it('pushes new brand to default profile when isSystem is undefined (legacy parity)', () => {
    const cfg = makeBaseConfig()
    // isSystem unset — legacy fixture
    mergeSeedsIntoConfig(cfg, [{ id: 'new-brand', name: 'New' }], [], {
      defaultProfileId: DEFAULT_PROFILE_ID,
    })
    expect(cfg.profiles[0]!.brandIds).toContain('new-brand')
  })

  it('does NOT push to default profile when isSystem: false', () => {
    const cfg = makeBaseConfig()
    cfg.profiles[0]!.isSystem = false
    mergeSeedsIntoConfig(cfg, [{ id: 'new-brand', name: 'New' }], [], {
      defaultProfileId: DEFAULT_PROFILE_ID,
    })
    // Brand still added to masterBrands, just not to the user-owned profile
    expect(cfg.masterBrands.map((b) => b.id)).toContain('new-brand')
    expect(cfg.profiles[0]!.brandIds).not.toContain('new-brand')
  })

  it('creates a new curated profile (step 3) with isSystem: true', () => {
    const cfg = makeBaseConfig()
    mergeSeedsIntoConfig(cfg, SEED_BRANDS, [WATCHES_PROFILE])
    const watches = cfg.profiles.find((p) => p.id === 'watches')!
    expect(watches.isSystem).toBe(true)
  })
})

// ── bootstrapConfig — fresh install isSystem ────────────────────────────────

describe('bootstrapConfig — fresh install isSystem tagging', () => {
  function emptyCfg() {
    return {
      version: '1',
      masterBrands: [] as Brand[],
      profiles: [] as Profile[],
      sites: [
        {
          id: 'myntra',
          hostname: 'www.myntra.com',
          defaultProfileId: '',
          enabled: true,
          customSelector: null,
        },
      ] as Site[],
    }
  }
  function makeFakeStorage(initial: ReturnType<typeof emptyCfg>) {
    let stored = JSON.parse(JSON.stringify(initial)) as ReturnType<typeof emptyCfg>
    return {
      read: async () => JSON.parse(JSON.stringify(stored)) as ReturnType<typeof emptyCfg>,
      write: async (cfg: unknown) => {
        stored = JSON.parse(JSON.stringify(cfg)) as ReturnType<typeof emptyCfg>
      },
      get: () => stored,
    }
  }

  it('tags every seeded profile with isSystem: true and bumps version to 2', async () => {
    const store = makeFakeStorage(emptyCfg())
    await bootstrapConfig(SEED_BRANDS, [WATCHES_PROFILE], store.read, store.write)
    const cfg = store.get()
    expect(cfg.version).toBe('2')
    const myBrands = cfg.profiles.find((p) => p.id === DEFAULT_PROFILE_ID)!
    expect(myBrands.isSystem).toBe(true)
    const watches = cfg.profiles.find((p) => p.id === 'watches')!
    expect(watches.isSystem).toBe(true)
  })
})

// ── migrateToV2 — classification fixtures ───────────────────────────────────

describe('migrateToV2', () => {
  function liveSeedBrands(): Brand[] {
    return [
      { id: 'tommy-hilfiger', name: 'Tommy Hilfiger' },
      { id: 'calvin-klein', name: 'Calvin Klein' },
      { id: 'timex', name: 'Timex' },
      { id: 'casio', name: 'Casio' },
    ]
  }
  function v1Vanilla() {
    return {
      version: '1',
      masterBrands: liveSeedBrands(),
      profiles: [
        {
          id: DEFAULT_PROFILE_ID,
          name: 'My Brands',
          icon: '🛍',
          brandIds: liveSeedBrands().map((b) => b.id),
        },
        {
          id: 'watches',
          name: 'Watches',
          icon: '⌚',
          brandIds: ['timex', 'casio'],
        },
      ] as Profile[],
    }
  }
  const SEED_WATCHES = {
    id: 'watches',
    name: 'Watches',
    icon: '⌚',
    brandIds: ['timex', 'casio'],
  }

  it('tags pristine my-brands and watches with isSystem: true', () => {
    const cfg = v1Vanilla()
    const changed = migrateToV2(cfg, liveSeedBrands(), [SEED_WATCHES])
    expect(changed).toBe(true)
    expect(cfg.version).toBe('2')
    expect(cfg.profiles.find((p) => p.id === DEFAULT_PROFILE_ID)!.isSystem).toBe(true)
    expect(cfg.profiles.find((p) => p.id === 'watches')!.isSystem).toBe(true)
  })

  it('tags trimmed my-brands as isSystem: false', () => {
    const cfg = v1Vanilla()
    cfg.profiles[0]!.brandIds = ['tommy-hilfiger'] // user removed others
    migrateToV2(cfg, liveSeedBrands(), [SEED_WATCHES])
    expect(cfg.profiles[0]!.isSystem).toBe(false)
  })

  it('tags renamed watches as isSystem: false', () => {
    const cfg = v1Vanilla()
    cfg.profiles[1]!.name = 'My Custom Watches'
    migrateToV2(cfg, liveSeedBrands(), [SEED_WATCHES])
    expect(cfg.profiles[1]!.isSystem).toBe(false)
  })

  it('tags icon-edited watches as isSystem: false', () => {
    const cfg = v1Vanilla()
    cfg.profiles[1]!.icon = '🕰'
    migrateToV2(cfg, liveSeedBrands(), [SEED_WATCHES])
    expect(cfg.profiles[1]!.isSystem).toBe(false)
  })

  it('tags user-created profile as isSystem: false', () => {
    const cfg = v1Vanilla()
    cfg.profiles.push({
      id: 'office-wear',
      name: 'Office wear',
      icon: '👔',
      brandIds: ['tommy-hilfiger'],
    })
    migrateToV2(cfg, liveSeedBrands(), [SEED_WATCHES])
    expect(cfg.profiles.find((p) => p.id === 'office-wear')!.isSystem).toBe(false)
  })

  it('is idempotent on a fully-migrated v2 config', () => {
    const cfg = v1Vanilla()
    migrateToV2(cfg, liveSeedBrands(), [SEED_WATCHES])
    const changedAgain = migrateToV2(cfg, liveSeedBrands(), [SEED_WATCHES])
    expect(changedAgain).toBe(false)
  })

  it('re-migrates a malformed v2 config (version 2 but isSystem missing)', () => {
    const cfg = v1Vanilla()
    cfg.version = '2'
    // profiles still have no isSystem — malformed v2
    const changed = migrateToV2(cfg, liveSeedBrands(), [SEED_WATCHES])
    expect(changed).toBe(true)
    expect(cfg.profiles.every((p) => typeof p.isSystem === 'boolean')).toBe(true)
  })

  it('does not touch already-classified profiles', () => {
    const cfg = v1Vanilla()
    cfg.profiles[0]!.isSystem = false // user-modified, already classified
    cfg.profiles[0]!.brandIds = ['tommy-hilfiger'] // trimmed
    migrateToV2(cfg, liveSeedBrands(), [SEED_WATCHES])
    expect(cfg.profiles[0]!.isSystem).toBe(false)
  })
})

// ── Migration ordering: runs AFTER seed-merge ───────────────────────────────

describe('bootstrapConfig — migration ordering', () => {
  function makeFakeStorage<T>(initial: T) {
    let stored = JSON.parse(JSON.stringify(initial)) as T
    return {
      read: async () => JSON.parse(JSON.stringify(stored)) as T,
      write: async (cfg: unknown) => {
        stored = JSON.parse(JSON.stringify(cfg)) as T
      },
      get: () => stored,
    }
  }

  it('classifies my-brands as isSystem: true even when it lags a newly-shipped seed brand', async () => {
    // Pre-existing v1 install where my-brands has the old 2 seed brands.
    // Now the extension ships a 3rd seed brand — seed-merge will propagate
    // into my-brands BEFORE migration runs, so classification sees the
    // post-propagation brandIds and tags my-brands as system.
    const cfg = {
      version: '1',
      masterBrands: [
        { id: 'tommy-hilfiger', name: 'Tommy Hilfiger' },
        { id: 'calvin-klein', name: 'Calvin Klein' },
      ] as Brand[],
      profiles: [
        {
          id: DEFAULT_PROFILE_ID,
          name: 'My Brands',
          icon: '🛍',
          brandIds: ['tommy-hilfiger', 'calvin-klein'],
        },
      ] as Profile[],
      sites: [
        {
          id: 'myntra',
          hostname: 'www.myntra.com',
          defaultProfileId: DEFAULT_PROFILE_ID,
          enabled: true,
          customSelector: null,
        },
      ] as Site[],
    }
    const seedWithNewBrand: Brand[] = [
      { id: 'tommy-hilfiger', name: 'Tommy Hilfiger' },
      { id: 'calvin-klein', name: 'Calvin Klein' },
      { id: 'newly-shipped', name: 'Newly Shipped' },
    ]
    const store = makeFakeStorage(cfg)
    await bootstrapConfig(seedWithNewBrand, [], store.read, store.write)

    const after = store.get()
    expect(after.version).toBe('2')
    const myBrands = after.profiles.find((p) => p.id === DEFAULT_PROFILE_ID)!
    expect(myBrands.brandIds).toContain('newly-shipped')
    expect(myBrands.isSystem).toBe(true) // not falsely demoted
  })
})
