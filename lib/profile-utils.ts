/**
 * Pure helpers for generating profile IDs and clone names.
 *
 * Kept dependency-free so React components can compose them without
 * pulling in side-effects, and so they unit-test trivially.
 */

/** Lowercase + hyphenate + strip non-`[a-z0-9-]`. Returns "" if nothing survives. */
export function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/^-+|-+$/g, '')
}

/**
 * Slug the name, then suffix `-2`, `-3`, ... until the result is not in
 * `taken`. Returns "" if the slug is empty after normalisation (caller
 * should treat that as an inline validation error).
 */
export function generateUniqueProfileId(name: string, taken: ReadonlySet<string>): string {
  const base = slugifyName(name)
  if (!base) return ''
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base}-${n}`)) n++
  return `${base}-${n}`
}

/**
 * "My Brands" → "My Brands (copy)", or "My Brands (copy 2)" if the first
 * is taken, etc. Comparison is against the DISPLAY NAMES of existing
 * profiles, not their ids.
 */
export function generateCloneName(original: string, taken: ReadonlySet<string>): string {
  const first = `${original} (copy)`
  if (!taken.has(first)) return first
  let n = 2
  while (taken.has(`${original} (copy ${n})`)) n++
  return `${original} (copy ${n})`
}
