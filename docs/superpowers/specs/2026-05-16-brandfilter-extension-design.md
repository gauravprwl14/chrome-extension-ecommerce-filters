# BrandFilter Chrome Extension — Design Spec

**Date:** 2026-05-16  
**Version:** V0  
**Stack:** Plasmo + React + TypeScript + Manifest V3

---

## 1. Problem Statement

Users visiting e-commerce sites (Myntra, Ajio) must manually re-select their preferred brand filters on every visit. This extension auto-applies a configured set of brand filters on page load, with a one-click popup to switch between named brand profiles.

---

## 2. Core Decisions

| Decision     | Choice                                                     | Rationale                                       |
| ------------ | ---------------------------------------------------------- | ----------------------------------------------- |
| Trigger mode | Hybrid: auto-apply + popup override                        | Zero effort by default, user stays in control   |
| Site support | Built-in adapters (Myntra, Ajio) + user-teachable fallback | Reliable on known sites, extensible to any site |
| Data model   | Global master brands + named profiles per site             | Brands defined once, reused across profiles     |
| Storage      | `chrome.storage.sync` (JSON)                               | No backend, cross-device sync, exportable       |
| Framework    | Plasmo + React + TypeScript                                | Best-in-class DX for Chrome extensions in 2025  |

---

## 3. JSON Config Schema

All user data lives in `chrome.storage.sync` as a single JSON object:

```typescript
interface Config {
  version: string // schema version, currently "1"
  masterBrands: Brand[] // single source of truth for all brands
  profiles: Profile[] // named subsets of masterBrands
  sites: Site[] // per-site config + default profile
}

interface Brand {
  id: string // slug, e.g. "tommy-hilfiger"
  name: string // display name, e.g. "Tommy Hilfiger"
  variants?: BrandVariant[] // alternative names for matching
}

interface BrandVariant {
  type: 'string' | 'regex'
  value: string // literal string or regex pattern
}

interface Profile {
  id: string // slug, e.g. "casual-wear"
  name: string // display name
  icon: string // emoji
  brandIds: string[] // references Brand.id — a brand can be in multiple profiles
}

interface Site {
  id: string // slug, e.g. "myntra"
  hostname: string // e.g. "www.myntra.com"
  defaultProfileId: string // which profile auto-applies
  enabled: boolean // user toggle
  customSelector: string | null // null for built-in adapters; for taught sites: CSS selector targeting the brand filter checkbox container (e.g. ".brand-list input[type=checkbox]")
}
```

**Key rules:**

- A brand must exist in `masterBrands` before it can appear in any `profile.brandIds`
- A brand can belong to multiple profiles simultaneously
- Adding a brand anywhere in the UI auto-promotes it to `masterBrands` if not already present
- `chrome.storage.sync` quota: 100KB — sufficient for hundreds of brands and profiles
- Entire config is exportable/importable as a single JSON blob from the options page

**Seed file:** `assets/default-brands.json` ships with the extension and seeds `masterBrands` on first install only. Never overwrites user additions.

---

## 4. Project Structure

```
chrome-extension/
├── popup.tsx                    # Popup UI entry point
├── options.tsx                  # Options page entry point
├── background.ts                # Service worker — auto-apply orchestration
├── contents/
│   ├── myntra.ts                # Myntra content script (Plasmo content script)
│   ├── ajio.ts                  # Ajio content script
│   └── teachable.ts             # Teach-mode content script (matches <all_urls>, inactive unless teach mode triggered)
├── lib/
│   ├── storage.ts               # chrome.storage.sync typed read/write helpers
│   ├── config.ts                # TypeScript interfaces (Brand, Profile, Site, Config)
│   ├── matching.ts              # Brand name matching algorithm
│   └── adapters/
│       ├── base.ts              # SiteAdapter interface
│       ├── myntra.ts            # Myntra DOM selectors + isFilterPage()
│       └── ajio.ts              # Ajio DOM selectors + isFilterPage()
├── components/
│   ├── ProfileDropdown.tsx      # Single-select profile switcher
│   ├── BrandMultiSelect.tsx     # Multi-select brand picker with search
│   └── StatusBar.tsx            # Applied / Off status indicator
├── assets/
│   ├── default-brands.json      # Seed brand library (ships with extension)
│   └── icon.png
├── tests/
│   ├── matching.test.ts         # Brand variant matching algorithm
│   ├── storage.test.ts          # Config read/write helpers
│   ├── myntra-adapter.test.ts   # isFilterPage(), selector logic
│   └── ajio-adapter.test.ts     # isFilterPage(), accordion expansion
└── docs/
    └── superpowers/specs/       # This file lives here
```

---

## 5. Adapter Interface

```typescript
interface SiteAdapter {
  hostname: string

  /** Returns true only on category/listing pages where filters exist */
  isFilterPage(): boolean

  /** Expands collapsed filter sections if needed (e.g. Ajio's Brands accordion) */
  expandBrandFilter(): Promise<void>

  /** Finds a brand's checkbox element using name + variant matching */
  findBrandCheckbox(brand: Brand): Element | null

  /** Applies all brands in profile. Skips already-checked. Returns apply result. */
  applyBrands(brands: Brand[]): Promise<ApplyResult>

  /** Unticks all checkboxes that were applied in this session */
  clearAppliedBrands(): Promise<void>
}

interface ApplyResult {
  applied: string[] // brand ids successfully checked
  skipped: string[] // already checked, skipped
  notFound: string[] // no matching checkbox found on page
}
```

---

## 6. Brand Matching Algorithm

```
For each brand in active profile:
  1. Get all filter label texts visible on page (normalized: trimmed, whitespace-collapsed)
  2. For each label text, attempt to match the brand:
     a. Try brand.name → case-insensitive exact match against label
     b. Try each variant where type = "string" → case-insensitive contains match
     c. Try each variant where type = "regex" → new RegExp(variant.value, 'i').test(label)
     d. First match → check the corresponding checkbox, move to next brand
  3. If no label matched this brand → add brand.id to notFound (silent, no error)
```

**Example config:**

```json
{
  "id": "hm",
  "name": "H&M",
  "variants": [
    { "type": "string", "value": "H & M" },
    { "type": "string", "value": "H and M" },
    { "type": "regex", "value": "H\\s*&\\s*M" }
  ]
}
```

---

## 7. Filter Page Detection

### Myntra

```typescript
isFilterPage(): boolean {
  const path = window.location.pathname
  const NON_LISTING = ['/login', '/cart', '/checkout', '/wishlist',
                       '/profile', '/gateway', '/my-account']
  if (path.includes('/buy')) return false        // product detail pages
  if (NON_LISTING.some(p => path.startsWith(p))) return false
  return path.split('/').filter(Boolean).length >= 1
}
```

Filter container selector: `.filter-main-wrapper` or `.filter-section` (to be confirmed against live DOM).

### Ajio

```typescript
isFilterPage(): boolean {
  return window.location.pathname.startsWith('/s/')
}
```

Brands accordion selector: section with heading "Brands" inside `.plp-facets` (to be confirmed against live DOM).  
**Ajio-specific:** Must click `+` on the Brands accordion to expand it, then wait 300ms for checkboxes to render before applying.

---

## 8. Dynamic Filter Handling (MutationObserver)

Both sites render filters via JS after page load. Content scripts use a `MutationObserver` strategy:

1. Register observer on `document.body` watching for `childList` + `subtree`
2. On each mutation, check if the filter container selector exists
3. On first detection: disconnect observer, wait 300ms debounce, run `applyBrands()`
4. Hard timeout: 8 seconds — if filter container never appears, log silently and stop
5. Ajio extra step: after filter container detected, check if Brands accordion is expanded; if not, click its expand button and wait another 300ms

---

## 9. Loop Prevention (Session State)

Stored in `chrome.storage.session` (cleared on browser close, per-tab):

| Key               | Value        | Meaning                                                           |
| ----------------- | ------------ | ----------------------------------------------------------------- |
| `applied_{tabId}` | `true`       | Auto-applied this page load; auto-apply won't fire again          |
| `applied_{tabId}` | `"user-off"` | User explicitly turned off; auto-apply blocked even on navigation |
| _(absent)_        | —            | Fresh page load; auto-apply will fire                             |

**Rules:**

- Auto-apply checks flag before running — stops if `true` or `"user-off"`
- Popup "Apply / Re-apply" explicitly clears flag then runs apply (always wins)
- Popup "✕ Off" unticks applied checkboxes + sets flag to `"user-off"`
- Flag is per-tab, never persists across browser sessions

---

## 10. Key Flows

### Flow 1 — Auto-Apply on Page Load

1. `chrome.tabs.onUpdated` (status = "loading") → background checks hostname against `config.sites`
2. Site not found or `site.enabled = false` → stop
3. `applied_{tabId}` set → stop (user in control)
4. Send `{ action: "applyProfile", profileId }` to content script
5. Content script: `isFilterPage()` → false → stop
6. MutationObserver waits for filter container (8s timeout)
7. Ajio only: expand Brands accordion, wait 300ms
8. For each brand: find checkbox (skip if already checked), click
9. Set `applied_{tabId} = true`, update popup badge to green

### Flow 2 — Popup Override

- **Switch profile:** Dropdown → select profile → brands update → "Apply" clears flag and re-applies
- **Tweak brands:** Open brand multi-select → search → check/uncheck → auto-saves to profile in storage → "Apply" pushes to page
- **Add new brand:** Type name not in master list → "+ Add to library" option → auto-adds to `masterBrands` + profile

### Flow 3 — Teach Mode

1. Unsupported site → popup shows "Teach this site" button
2. User navigates to a filter/listing page, clicks "Teach this site"
3. Page enters teach mode: crosshair cursor, blue overlay border, instruction tooltip
4. User clicks a brand filter element
5. Extension captures element, infers container CSS selector
6. Confirmation toast: "Found selector: `X` — confirm?" → [Confirm] [Try again]
7. Confirmed: saves to `site.customSelector`, prompts user to pick default profile
8. Extension immediately applies using new selector

### Flow 4 — First-Run Onboarding

1. `chrome.runtime.onInstalled` (reason = "install") → seed `masterBrands` from `default-brands.json`
2. Options page auto-opens in new tab, lands on Master Brands tab
3. Banner: "Your brand library is ready. Create a profile to get started →"
4. User creates profile, assigns brands, sets default per site
5. Done — visits Myntra, filters auto-apply

---

## 11. UI Components

### Popup

- **Header:** Extension name + current site detected (green dot = supported, grey = unsupported)
- **Profile dropdown:** Single-select, auto-detects current site's default, collapses to dropdown when > 3 profiles
- **Brand multi-select:** Search box inside dropdown, checkboxes per brand, "Select all / Clear" footer, "+ Add brand" at bottom
- **Status bar:** "Last applied: Xm ago" or "Not applied" or "Off"
- **Footer:** "Apply" (primary) + "✕ Off" (secondary)

### Options Page (4 tabs)

- **Master Brands:** Searchable table, "Used in Profiles" column shows all profile tags per brand, edit/delete per row, "+ Add Brand"
- **Profiles:** Card grid, each card shows icon + name + brand pills + edit/delete, "+ New Profile" card
- **Sites:** List rows, hostname + adapter type + default profile badge + enable toggle + edit button, "+ Teach a new site" row
- **Export / Import:** Export full config as JSON, import from JSON file, reset to defaults

---

## 12. Engineering Standards

- **TypeScript:** Strict mode (`"strict": true`). All interfaces defined in `lib/config.ts`.
- **Comments:** JSDoc on all exported functions and interfaces. Inline comments only for non-obvious logic (MutationObserver timeout, session flag values, Ajio accordion workaround).
- **Testing:** Vitest. Unit tests cover: matching algorithm (all variant types), `isFilterPage()` for each adapter, storage read/write helpers, session flag logic.
- **Linting:** ESLint + Prettier. Config committed to repo.
- **Pre-commit:** Husky + lint-staged running `typecheck + lint + test` on every commit.
- **Git:** Conventional commits. `.gitignore` covers `build/`, `node_modules/`, `.plasmo/`, `.superpowers/`.
- **Parallelization:** Implementation uses git worktrees with parallel agents: adapter work, UI work, and storage/lib work are independent and can be built simultaneously.

---

## 13. Build & Deploy

```bash
pnpm dev          # Hot-reload dev build, loads unpacked in Chrome
pnpm build        # Production build → build/chrome-mv3-prod/
pnpm package      # Zip → build/chrome-mv3-prod.zip (ready for Web Store)
pnpm test         # Vitest unit tests
pnpm typecheck    # tsc --noEmit
pnpm lint         # ESLint + Prettier check
```

**Chrome Web Store upload:**

1. Build: `pnpm package`
2. Upload `build/chrome-mv3-prod.zip` to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
3. Fill listing metadata (name, description, screenshots, 128x128 icon)
4. Submit for review (~1-3 days first publish, hours for updates)

---

## 14. V0 Scope Boundary

### In V0

- Myntra + Ajio built-in adapters
- Popup with profile dropdown + brand multi-select with search
- Options page: master brands, profiles, sites, export/import
- Hybrid auto-apply + popup override
- Teach mode for unsupported sites
- First-run onboarding
- MutationObserver dynamic filter handling
- Brand matching: name + string variants + regex variants
- Loop prevention via session flags
- Unit tests, TypeScript strict, ESLint, Prettier, Husky

### Explicitly Out of V0

- Amazon Fashion, Nykaa, Flipkart adapters
- Login / authentication
- Usage analytics or apply history
- Firefox / Edge support
- Keyboard shortcut (Alt+Shift+F)
- Brand import from CSV
- Price / discount / rating filter automation
