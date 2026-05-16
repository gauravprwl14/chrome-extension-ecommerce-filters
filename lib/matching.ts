import type { Brand } from './config'

/** Normalize for comparison: lowercase, collapsed whitespace, trimmed. */
export function normalizeLabel(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * Returns true if labelText matches this brand via name → string variants → regex variants.
 * Match order ensures exact name takes priority over partial string/regex matches.
 */
export function matchesBrand(brand: Brand, labelText: string): boolean {
  const normalized = normalizeLabel(labelText)

  // 1. Exact name match (case-insensitive)
  if (normalized === normalizeLabel(brand.name)) return true

  if (!brand.variants?.length) return false

  for (const variant of brand.variants) {
    if (variant.type === 'string') {
      if (normalized.includes(normalizeLabel(variant.value))) return true
    } else if (variant.type === 'regex') {
      try {
        if (new RegExp(variant.value, 'i').test(labelText)) return true
      } catch {
        // Skip silently — invalid regex in user config should not crash
      }
    }
  }

  return false
}

/**
 * Find the index of the first label in the list that matches the brand.
 * Returns -1 if no match found.
 */
export function findMatchIndex(brand: Brand, labels: string[]): number {
  return labels.findIndex((label) => matchesBrand(brand, label))
}
