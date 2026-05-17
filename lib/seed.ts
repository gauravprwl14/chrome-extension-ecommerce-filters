import type { Brand, Profile } from './config'

/**
 * Profile definitions seeded into a fresh install AND merged into existing
 * installs by the idempotent migration in background.ts.
 *
 * Each entry lists `brandIds` that MUST exist in the masterBrands seed
 * (assets/default-brands.json) — the migration filters out any missing ones
 * defensively, but new IDs added here should be added to the JSON too.
 */
export interface SeedProfile extends Omit<Profile, 'brandIds'> {
  brandIds: string[]
}

/** Curated set of popular watch brands available on both Myntra and Ajio. */
export const WATCHES_PROFILE: SeedProfile = {
  id: 'watches',
  name: 'Watches',
  icon: '⌚',
  brandIds: [
    'timex',
    'casio',
    'fossil',
    'titan',
    'fastrack',
    'sonata',
    'guess',
    'daniel-wellington',
    'tommy-hilfiger',
    'calvin-klein',
    'armani-exchange',
    'citizen',
    'seiko',
    'skechers',
    'nautica',
    'kenneth-cole',
    'police',
    'helix',
  ],
}

/** Default "My Brands" profile id — used by first-run and migration. */
export const DEFAULT_PROFILE_ID = 'my-brands'

/**
 * Brand IDs we want REMOVED from every install. On each bootstrap pass,
 * any of these found in `masterBrands` are deleted, and any reference to
 * them in any profile's `brandIds` is stripped.
 *
 * Add an ID here when a brand should be retired. Removing the entry from
 * `assets/default-brands.json` alone is NOT enough — existing installs
 * have the brand persisted in storage and a missing-seed delta wouldn't
 * remove it.
 */
export const DEPRECATED_BRAND_IDS: readonly string[] = [
  'highlander', // retired per user request (2026-05-17)
  'red-tape', // retired per user request — sometimes spelt "Red Tape"
]

/** Result of a bootstrap pass — used by the caller to e.g. open the options page. */
export interface BootstrapResult {
  /** True only when bootstrap initialised the config from scratch (no prior data). */
  wasFirstRun: boolean
  /** True if bootstrap wrote anything to storage. */
  changed: boolean
}

/**
 * Idempotently bring the persisted config to a "seeded" state.
 *
 * Runs on every service-worker wake (NOT only on `onInstalled`/`onStartup`,
 * neither of which fires on `chrome://extensions → Reload` — the canonical
 * dev-iteration path that produced the "No profiles yet" bug).
 *
 * Behaviour:
 *  - Fresh storage (no master brands): seed brands + create the default
 *    profile (every seed brand minus deprecated) + create all curated seed
 *    profiles + assign the default profile to every built-in site. Returns
 *    wasFirstRun=true.
 *  - Existing install: top-up any missing seed brands, propagate them into
 *    the default profile, create any missing curated profile, and strip
 *    any deprecated brand IDs from masterBrands and every profile. Never
 *    touches user-customised brand entries or user-added profiles.
 *
 * `readConfig`/`writeConfig` are injected so this is unit-testable without
 * pulling in the real chrome.storage layer.
 */
export async function bootstrapConfig<
  TConfig extends {
    masterBrands: Brand[]
    profiles: Profile[]
    sites: Array<{ defaultProfileId: string }>
  },
>(
  seedBrands: Brand[],
  seedProfiles: SeedProfile[],
  readConfig: () => Promise<TConfig>,
  writeConfig: (cfg: TConfig) => Promise<void>,
): Promise<BootstrapResult> {
  const config = await readConfig()
  const isFreshInstall = config.masterBrands.length === 0
  let changed = false

  if (isFreshInstall) {
    const deprecated = new Set(DEPRECATED_BRAND_IDS)
    const liveSeed = seedBrands.filter((b) => !deprecated.has(b.id))
    config.masterBrands = [...liveSeed]
    config.profiles = [
      {
        id: DEFAULT_PROFILE_ID,
        name: 'My Brands',
        icon: '🛍',
        brandIds: liveSeed.map((b) => b.id),
        isSystem: true,
      },
    ]
    config.sites = config.sites.map((s) => ({ ...s, defaultProfileId: DEFAULT_PROFILE_ID }))
    changed = true
  }

  if (
    mergeSeedsIntoConfig(config, seedBrands, seedProfiles, {
      deprecatedBrandIds: DEPRECATED_BRAND_IDS,
      defaultProfileId: DEFAULT_PROFILE_ID,
    })
  ) {
    changed = true
  }

  // v1 → v2 migration runs AFTER seed-merge so the my-brands superset check
  // sees post-propagation brandIds. Single end-of-function writeConfig
  // covers all three mutations (fresh-install branch, seed-merge, migration).
  if (migrateToV2(config, seedBrands, seedProfiles)) {
    changed = true
  }

  if (changed) {
    await writeConfig(config)
  }

  return { wasFirstRun: isFreshInstall, changed }
}

/**
 * Idempotent v1 → v2 migration. Runs inside `bootstrapConfig` AFTER
 * seed-merge. Tags each profile with `isSystem: true | false` and bumps
 * `version` to `'2'`. A second pass on a fully-migrated config is a no-op.
 *
 * Detection rule for a profile being "untouched seed":
 *   - id matches a known system profile (`DEFAULT_PROFILE_ID` or any
 *     entry in `seedProfiles`)
 *   - `name` and `icon` unchanged from the seed
 *   - every live (non-deprecated, currently in `masterBrands`) seed brand
 *     for that profile is present in `profile.brandIds`
 * For the default `my-brands` profile, the seed brand set is
 * `seedBrands - DEPRECATED_BRAND_IDS` (live seed). For curated profiles,
 * it's the `brandIds` array on the seed-profile object.
 *
 * Exported for direct unit-testing.
 */
export function migrateToV2<
  TConfig extends { version?: string; masterBrands: Brand[]; profiles: Profile[] },
>(config: TConfig, seedBrands: Brand[], seedProfiles: SeedProfile[]): boolean {
  // Fast-path: already v2 and every profile has isSystem set.
  if (config.version === '2' && config.profiles.every((p) => typeof p.isSystem === 'boolean')) {
    return false
  }

  const deprecated = new Set(DEPRECATED_BRAND_IDS)
  const masterIds = new Set(config.masterBrands.map((b) => b.id))

  const seedById = new Map<string, { name: string; icon: string; brandIds: string[] }>()
  // Synthetic seed-shape for my-brands.
  seedById.set(DEFAULT_PROFILE_ID, {
    name: 'My Brands',
    icon: '🛍',
    brandIds: seedBrands.filter((b) => !deprecated.has(b.id)).map((b) => b.id),
  })
  for (const seed of seedProfiles) {
    seedById.set(seed.id, { name: seed.name, icon: seed.icon, brandIds: [...seed.brandIds] })
  }

  let changed = false
  config.profiles = config.profiles.map((profile) => {
    if (typeof profile.isSystem === 'boolean') return profile
    const classified = classifyProfile(profile, seedById, masterIds, deprecated)
    if (classified !== profile) changed = true
    return classified
  })

  if (config.version !== '2') {
    config.version = '2'
    changed = true
  }

  return changed
}

function classifyProfile(
  profile: Profile,
  seedById: Map<string, { name: string; icon: string; brandIds: string[] }>,
  masterIds: Set<string>,
  deprecated: Set<string>,
): Profile {
  const seed = seedById.get(profile.id)
  if (!seed) return { ...profile, isSystem: false }
  if (profile.name !== seed.name || profile.icon !== seed.icon) {
    return { ...profile, isSystem: false }
  }
  const expectedIds = seed.brandIds.filter((id) => masterIds.has(id) && !deprecated.has(id))
  const profileIds = new Set(profile.brandIds)
  for (const id of expectedIds) {
    if (!profileIds.has(id)) return { ...profile, isSystem: false }
  }
  return { ...profile, isSystem: true }
}

export interface MergeOptions {
  /**
   * Brand IDs to remove from `masterBrands` and from EVERY profile's
   * `brandIds`. Use `DEPRECATED_BRAND_IDS` in production.
   */
  deprecatedBrandIds?: readonly string[]
  /**
   * If set and the profile exists, newly-added seed brands are also pushed
   * to that profile's `brandIds`. Lets the curated "My Brands" default keep
   * up with new seed additions on existing installs (without overwriting
   * brands the user has explicitly removed from earlier seed waves — the
   * "newly-added" check below uses masterBrands membership, so once a
   * brand has been added once it won't be re-pushed even if the user
   * trims it out later).
   */
  defaultProfileId?: string
}

/**
 * Idempotently merge seed data into an existing config:
 *  1. Remove `deprecatedBrandIds` from `masterBrands` and every profile's
 *     `brandIds` (so retired brands disappear from installs that had them).
 *  2. Add any master brand from `seedBrands` that's missing (by id). When
 *     `defaultProfileId` is supplied and that profile exists, the new
 *     brand id is also pushed to that profile.
 *  3. Ensure each profile in `seedProfiles` exists (by id); if absent,
 *     create it from the seed using only brand IDs that exist post-merge.
 *
 * Never touches user edits to existing brands or to brands a user
 * deliberately removed from their default profile (provided those brands
 * were already in `masterBrands` before this call — see "newly-added"
 * check above).
 *
 * Mutates `config` and returns whether anything changed.
 */
export function mergeSeedsIntoConfig(
  config: { masterBrands: Brand[]; profiles: Profile[] },
  seedBrands: Brand[],
  seedProfiles: SeedProfile[],
  options: MergeOptions = {},
): boolean {
  let changed = false

  // 1. Strip deprecated brand IDs from masterBrands and from every profile.
  const deprecated = new Set(options.deprecatedBrandIds ?? [])
  if (deprecated.size > 0) {
    const beforeMaster = config.masterBrands.length
    config.masterBrands = config.masterBrands.filter((b) => !deprecated.has(b.id))
    if (config.masterBrands.length !== beforeMaster) changed = true

    for (const profile of config.profiles) {
      const beforeProfile = profile.brandIds.length
      profile.brandIds = profile.brandIds.filter((id) => !deprecated.has(id))
      if (profile.brandIds.length !== beforeProfile) changed = true
    }
  }

  // 2. Add missing seed brands, propagating to the default profile if asked.
  //    Propagation is gated on the default profile's `isSystem` flag — only
  //    untouched system profiles receive new seed brands. Legacy fixtures
  //    without the field (`isSystem === undefined`) still propagate, which
  //    keeps pre-v2 seed tests green.
  const existingBrandIds = new Set(config.masterBrands.map((b) => b.id))
  const defaultProfile = options.defaultProfileId
    ? (config.profiles.find((p) => p.id === options.defaultProfileId) ?? null)
    : null
  const propagateToDefault = defaultProfile !== null && defaultProfile.isSystem !== false
  for (const brand of seedBrands) {
    if (deprecated.has(brand.id)) continue // never re-introduce a retired brand
    if (existingBrandIds.has(brand.id)) continue
    config.masterBrands.push(brand)
    existingBrandIds.add(brand.id)
    changed = true
    if (propagateToDefault && defaultProfile && !defaultProfile.brandIds.includes(brand.id)) {
      defaultProfile.brandIds.push(brand.id)
    }
  }

  // 3. Create any missing curated profiles, filtered to live brand IDs.
  const existingProfileIds = new Set(config.profiles.map((p) => p.id))
  for (const seed of seedProfiles) {
    if (existingProfileIds.has(seed.id)) continue
    const validIds = seed.brandIds.filter((id) => existingBrandIds.has(id) && !deprecated.has(id))
    if (validIds.length === 0) continue
    config.profiles.push({
      id: seed.id,
      name: seed.name,
      icon: seed.icon,
      brandIds: validIds,
      isSystem: true,
    })
    existingProfileIds.add(seed.id)
    changed = true
  }

  return changed
}
