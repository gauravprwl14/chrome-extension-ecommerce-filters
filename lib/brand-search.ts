import type { Brand } from './config'

/**
 * Filter and rank brands by a user query.
 *
 * Matching is case-insensitive substring across `Brand.name` and the literal
 * `value` of each `Brand.variants[]` entry (regex variants are searched as
 * plain text, not compiled — this helper is for the user-facing brand
 * picker, not the page-side matcher in `lib/matching.ts`).
 *
 * Ranking: exact case-insensitive name matches come first, then substring
 * matches in input order (stable). Whitespace-only / empty queries return
 * the input untouched.
 */
export function searchBrands(brands: Brand[], query: string): Brand[] {
  const q = query.trim().toLowerCase()
  if (!q) return brands.slice()

  const exact: Brand[] = []
  const substring: Brand[] = []

  for (const brand of brands) {
    const name = brand.name.toLowerCase()
    if (name === q) {
      exact.push(brand)
      continue
    }
    if (name.includes(q)) {
      substring.push(brand)
      continue
    }
    const variantHit = brand.variants?.some((v) => v.value.toLowerCase().includes(q))
    if (variantHit) substring.push(brand)
  }

  return [...exact, ...substring]
}
