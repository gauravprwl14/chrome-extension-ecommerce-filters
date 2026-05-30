/**
 * Capture-from-page logic (pure, side-effect free).
 *
 * "Reverse" profile creation: a user has already selected brands on a listing
 * page; we read those selections (in the content script) and turn them into a
 * saved profile. This module owns the two non-UI steps:
 *
 *   1. reconcileCapturedBrands — split the captured site-canonical names into
 *      ones already in the master library (matched) and ones that aren't
 *      (unknown), reusing the same `matchesBrand` rules the adapters use.
 *   2. buildCaptureProfile — promote the user-approved unknown brands into the
 *      master library FIRST, then append a new user profile that references the
 *      matched + newly-promoted brand ids (upholding the master-first invariant).
 *
 * Kept dependency-free of chrome.* so it unit-tests trivially and the popup can
 * compose it without side effects (mirrors lib/popup-init, lib/auto-apply).
 */
import type { Brand, CaptureSelectionResponse, Config, Profile } from './config'
import { matchesBrand, normalizeLabel } from './matching'
import { generateUniqueBrandId, generateUniqueProfileId } from './profile-utils'

/** Minimal adapter surface the capture response needs (read-only). */
interface CaptureCapableAdapter {
  isFilterPage(): boolean
  readSelectedBrands(): Promise<string[]>
}

/**
 * Build the content-script's response to a `captureSelection` message. Pure
 * over an injected adapter so it unit-tests without a DOM. Short-circuits on
 * non-listing pages (no selection to read there) so the popup can show the
 * right "open a listing page" empty state.
 */
export async function captureResponse(
  adapter: CaptureCapableAdapter,
): Promise<CaptureSelectionResponse> {
  if (!adapter.isFilterPage()) {
    return { ok: true, isFilterPage: false, brands: [] }
  }
  const brands = await adapter.readSelectedBrands()
  return { ok: true, isFilterPage: true, brands }
}

/**
 * Site ids whose adapter can reliably read the current selection. v1 ships
 * Myntra only (its selection lives in the URL — fully deterministic). Ajio's
 * DOM-scan read path is a fast-follow; until then the popup hides the capture
 * affordance for it.
 */
const CAPTURE_SUPPORTED_SITE_IDS: ReadonlySet<string> = new Set(['myntra'])

export function siteSupportsCapture(siteId: string): boolean {
  return CAPTURE_SUPPORTED_SITE_IDS.has(siteId)
}

export interface ReconcileResult {
  /** Master brands that matched at least one captured string (deduped by id). */
  matched: Brand[]
  /** Captured strings that matched no master brand (deduped, original casing). */
  unknown: string[]
}

/**
 * Split captured selection strings (site-canonical brand names) into matched
 * master brands and unknown leftovers. A captured string counts as matched if
 * any master brand matches it by name OR variant (so "Levis" → "Levi's").
 */
export function reconcileCapturedBrands(
  capturedStrings: string[],
  masterBrands: Brand[],
): ReconcileResult {
  const matched: Brand[] = []
  const matchedIds = new Set<string>()
  const unknown: string[] = []
  const unknownSeen = new Set<string>()

  for (const raw of capturedStrings) {
    const str = raw.trim()
    if (!str) continue

    const hit = masterBrands.find((b) => matchesBrand(b, str))
    if (hit) {
      if (!matchedIds.has(hit.id)) {
        matchedIds.add(hit.id)
        matched.push(hit)
      }
      continue
    }

    const key = normalizeLabel(str)
    if (unknownSeen.has(key)) continue
    unknownSeen.add(key)
    unknown.push(str)
  }

  return { matched, unknown }
}

export interface BuildCaptureProfileInput {
  /** New profile display name (caller validates non-empty + name-unique). */
  name: string
  /** Single emoji icon. */
  icon: string
  /** Ids of already-known brands to include (from reconcile's `matched`). */
  matchedIds: string[]
  /** Unknown captured strings the user toggled ON to add to the library. */
  promoteStrings: string[]
}

/**
 * Produce a NEW Config with the captured profile added. Pure — never mutates
 * `config`. Promotes each approved unknown into masterBrands with a unique id
 * (so a colliding slug can't merge into a different brand) BEFORE the profile
 * references it. Un-promoted unknowns are simply dropped.
 */
export function buildCaptureProfile(config: Config, input: BuildCaptureProfileInput): Config {
  const masterBrands = config.masterBrands.map((b) => ({ ...b }))
  const takenBrandIds = new Set(masterBrands.map((b) => b.id))

  const promotedIds: string[] = []
  for (const raw of input.promoteStrings) {
    const name = raw.trim()
    const id = generateUniqueBrandId(name, takenBrandIds)
    if (!id) continue // un-sluggable (e.g. "???") — skip, can't promote
    takenBrandIds.add(id)
    masterBrands.push({ id, name })
    promotedIds.push(id)
  }

  const profile: Profile = {
    id: generateUniqueProfileId(input.name, new Set(config.profiles.map((p) => p.id))),
    name: input.name,
    icon: input.icon,
    brandIds: [...input.matchedIds, ...promotedIds],
    isSystem: false,
  }

  return {
    ...config,
    masterBrands,
    profiles: [...config.profiles, profile],
  }
}
