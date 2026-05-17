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

  if (changed) {
    await writeConfig(config)
  }

  return { wasFirstRun: isFreshInstall, changed }
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
  const existingBrandIds = new Set(config.masterBrands.map((b) => b.id))
  const defaultProfile = options.defaultProfileId
    ? (config.profiles.find((p) => p.id === options.defaultProfileId) ?? null)
    : null
  for (const brand of seedBrands) {
    if (deprecated.has(brand.id)) continue // never re-introduce a retired brand
    if (existingBrandIds.has(brand.id)) continue
    config.masterBrands.push(brand)
    existingBrandIds.add(brand.id)
    changed = true
    if (defaultProfile && !defaultProfile.brandIds.includes(brand.id)) {
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
    })
    existingProfileIds.add(seed.id)
    changed = true
  }

  return changed
}
