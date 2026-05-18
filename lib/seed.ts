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

/**
 * Premium / designer / luxury brands across men & women — Tier-1 international
 * labels plus elevated Indian designer ethnic. Cross-gender by design.
 */
export const PREMIUM_PROFILE: SeedProfile = {
  id: 'premium',
  name: 'Premium',
  icon: '👑',
  brandIds: [
    'gucci',
    'prada',
    'burberry',
    'balenciaga',
    'dolce-gabbana',
    'versace',
    'versace-jeans-couture',
    'saint-laurent',
    'valentino',
    'givenchy',
    'balmain',
    'ferragamo',
    'fendi',
    'chloe',
    'max-mara',
    'miu-miu',
    'stella-mccartney',
    'tom-ford',
    'vivienne-westwood',
    'alexander-mcqueen',
    'moncler',
    'stone-island',
    'acne-studios',
    'off-white',
    'palm-angels',
    'jacquemus',
    'jil-sander',
    'jw-anderson',
    'maison-margiela',
    'moschino',
    'marni',
    'zimmermann',
    'ganni',
    'isabel-marant',
    'carolina-herrera',
    'self-portrait',
    'tory-burch',
    'tommy-hilfiger',
    'calvin-klein',
    'calvin-klein-jeans',
    'polo-ralph-lauren',
    'ralph-lauren',
    'hugo-boss',
    'hugo',
    'boss',
    'emporio-armani',
    'ea7-emporio-armani',
    'armani-exchange',
    'michael-kors',
    'guess',
    'gant',
    'ted-baker',
    'karl-lagerfeld',
    'fred-perry',
    'lacoste',
    'hackett-london',
    'dkny',
    'diesel',
    'true-religion',
    'antony-morato',
    'carhartt-wip',
    'the-north-face',
    'patagonia',
    'label-ritu-kumar',
    'ritu-kumar',
    'aarke-ritu-kumar',
    'fabindia',
    'house-of-pataudi',
    'rare-rabbit',
  ],
}

/**
 * Mid-tier / mainstream high-street brands — the day-to-day "mediocre"
 * (i.e. mass-market, not luxury) labels across men's & women's apparel,
 * activewear, denim and ethnicwear.
 */
export const MEDIOCRE_PROFILE: SeedProfile = {
  id: 'mid-tier',
  name: 'Mid-tier',
  icon: '🛒',
  brandIds: [
    'hm',
    'h-and-m-move',
    'gap',
    'mango',
    'vero-moda',
    'only',
    'forever-21',
    'forever-new',
    'american-eagle',
    'bershka',
    'marks-spencer',
    'next',
    'koton',
    'trendyol',
    'quiz',
    'boohoo',
    'dorothy-perkins',
    'french-connection',
    'levis',
    'lee',
    'lee-cooper',
    'wrangler',
    'us-polo-assn',
    'us-polo-denim',
    'uspa-sport',
    'uspa-women',
    'united-colors-benetton',
    'allen-solly',
    'allen-solly-sport',
    'allen-solly-woman',
    'van-heusen',
    'van-heusen-sport',
    'van-heusen-flex',
    'van-heusen-woman',
    'peter-england',
    'peter-england-casuals',
    'park-avenue',
    'arrow',
    'arrow-sport',
    'louis-philippe',
    'louis-philippe-sport',
    'louis-philippe-jeans',
    'raymond',
    'blackberrys',
    'being-human',
    'the-souled-store',
    'the-bear-house',
    'mufti',
    'snitch',
    'spykar',
    'flying-machine',
    'numero-uno',
    'celio',
    'nike',
    'puma',
    'puma-motorsport',
    'adidas',
    'adidas-originals',
    'reebok',
    'reebok-classic',
    'skechers',
    'champion',
    'asics',
    'fila',
    'new-balance',
    'under-armour',
    'converse',
    'woodland',
    'wildcraft',
    'decathlon',
    'columbia',
    'biba',
    'global-desi',
    'anouk',
    'aurelia',
    'janasya',
    'sassafras',
    'libas',
    'soch',
    'rangriti',
    'rare',
    'rareism',
    'madame',
    'kazo',
    'berrylush',
    'faballey',
    'lulu-and-sky',
    'stylecast',
    'corsica',
    'globus',
    'max',
    'miss-chase',
    'sangria',
    'taavi',
    'people',
    'zink-london',
    'tokyo-talkies',
    'dressberry',
    'w',
    'all-about-you',
    'athena',
    'bebe',
    'chemistry',
    'code-by-lifestyle',
    'cottinfab',
    'cover-story',
    'crimsoune-club',
    'dodo-and-moa',
    'deebaco',
    'ethnovog',
    'fablestreet',
    'femvy',
    'harpa',
    'honey-by-pantaloons',
    'iuga',
    'juniper',
    'jc-mode',
    'jc-collection',
    'kalini',
    'kassually',
    'latin-quarters',
    'lakshita',
    'moomaya',
    'nayo',
    'outzidr',
    'oxolloxo',
    'pinacolada',
    'purvaja',
    'popwings',
    'pluss',
    'qurvii',
    'qena',
    'suo',
    'szn',
    'styli',
    'street-9',
    'sera',
    'selvia',
    'showofff',
    'the-label-life',
    'uptownie',
    'vishudh',
    'virgio',
    'varanga',
    'zucchini',
    'zummer',
    'akkriti-by-pantaloons',
    'annabelle-by-pantaloons',
    'ajile-by-pantaloons',
    'rangmanch-by-pantaloons',
    'yu-by-pantaloons',
    'ginger-by-lifestyle',
    'fame-forever-by-lifestyle',
    'melange-by-lifestyle',
    'nexus-by-lifestyle',
    'trend-arrest',
    'marc-louis',
  ],
}

/**
 * Budget / entry-level brands — value-priced high-street labels that sit
 * below the Mid-tier band. Mostly Indian fast-fashion and basic-essentials
 * houses, plus a few accessible international labels.
 *
 * Brands here are removed from MEDIOCRE_PROFILE so a brand appears in
 * exactly one tier (Premium / Mid-tier / Budget). Master list is NOT
 * affected — users can still find any of them in their library.
 */
export const BUDGET_PROFILE: SeedProfile = {
  id: 'budget',
  name: 'Budget',
  icon: '🏷️',
  brandIds: [
    'mast-harbour',
    'roadster',
    'hrx',
    'szn',
    'moda-rapido',
    'here-and-now',
    'suo',
    'ketch',
    'kotty',
    'baesd',
    'campus-sutra',
    'bewakoof',
    'monte-carlo',
    'aeropostale',
    'fcuk',
    'the-indian-garage-co',
    'indian-terrain',
    'jack-jones',
    'duke',
    'invictus',
    'pepe-jeans',
    'hummel',
  ],
}

/** Default "My Brands" profile id — used by first-run and migration. */
export const DEFAULT_PROFILE_ID = 'my-brands'

/**
 * Brand IDs excluded from the "My Brands" default profile.
 * These brands only appear in their tier-specific profiles (Premium, Mid-tier, Budget, etc.)
 * and never in the catch-all "My Brands" mix.
 */
export function getExcludedFromMyBrandsIds(): Set<string> {
  // Only Budget brands are excluded from "My Brands". Premium and Mid-tier brands
  // are curated enough that most users want them in the catch-all default profile.
  // If a second tier is ever excluded, add its brandIds here (not in callers).
  return new Set(BUDGET_PROFILE.brandIds)
}

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
    const excluded = getExcludedFromMyBrandsIds()
    const liveSeed = seedBrands.filter((b) => !deprecated.has(b.id))
    config.masterBrands = [...liveSeed]
    config.profiles = [
      {
        id: DEFAULT_PROFILE_ID,
        name: 'My Brands',
        icon: '🛍',
        brandIds: liveSeed.filter((b) => !excluded.has(b.id)).map((b) => b.id),
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
  // sees post-propagation brandIds.
  if (migrateToV2(config, seedBrands, seedProfiles)) {
    changed = true
  }

  // Sync system profiles (my-brands, curated profiles) for existing installs.
  // Ensures stale profiles (e.g., mid-tier with budget brands) align with
  // current seed shape without touching user-edited profiles.
  if (syncSystemProfiles(config, seedBrands, seedProfiles)) {
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

/**
 * Sync system profiles (my-brands + curated tiers) to match current seed shapes.
 * Only touches profiles marked isSystem: true. Existing user-edited profiles
 * (isSystem: false) are never modified.
 *
 * Use case: an existing install created before Budget segregation now sees
 * mid-tier with budget brands. This pass strips them out if mid-tier is
 * still untouched (isSystem: true), and also removes budget brands from
 * my-brands if that's still untouched.
 *
 * Mutates config and returns whether anything changed.
 */
export function syncSystemProfiles(
  config: { masterBrands: Brand[]; profiles: Profile[] },
  seedBrands: Brand[],
  seedProfiles: SeedProfile[],
): boolean {
  let changed = false
  const deprecated = new Set(DEPRECATED_BRAND_IDS)
  const excluded = getExcludedFromMyBrandsIds()
  const masterIds = new Set(config.masterBrands.map((b) => b.id))

  // Build map of seed profile id → expected brand ids (filtered to existing master)
  const seedById = new Map<string, string[]>()
  seedById.set(
    DEFAULT_PROFILE_ID,
    seedBrands
      .filter((b) => !deprecated.has(b.id) && !excluded.has(b.id))
      .map((b) => b.id)
      .filter((id) => masterIds.has(id)),
  )
  for (const seed of seedProfiles) {
    seedById.set(
      seed.id,
      seed.brandIds.filter((id) => masterIds.has(id) && !deprecated.has(id)),
    )
  }

  // For each system profile, sync brandIds if its shape is stale.
  for (const profile of config.profiles) {
    if (profile.isSystem !== true) continue // only sync untouched system profiles
    const expectedIds = seedById.get(profile.id)
    if (!expectedIds) continue // not a known system profile
    const currentIds = new Set(profile.brandIds)
    const expectedSet = new Set(expectedIds)
    // Only sync if they differ (helps avoid marking as changed when not needed)
    if (
      currentIds.size === expectedSet.size &&
      [...currentIds].every((id) => expectedSet.has(id))
    ) {
      continue
    }
    profile.brandIds = expectedIds
    changed = true
  }

  return changed
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
  //    Excluded brands (e.g., Budget tier) never propagate to My Brands.
  const excluded = getExcludedFromMyBrandsIds()
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
    if (
      propagateToDefault &&
      defaultProfile &&
      !excluded.has(brand.id) &&
      !defaultProfile.brandIds.includes(brand.id)
    ) {
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
