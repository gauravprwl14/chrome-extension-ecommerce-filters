# BrandFilter Chrome Extension — CLAUDE.md

> This file is the authoritative guide for anyone (human or AI) working in this codebase.
> Read it before touching any file.

---

## What This Project Is

**BrandFilter** is a Chrome extension (Manifest V3) that automatically applies a user's saved brand filter preferences on e-commerce listing pages (Myntra, Ajio). Instead of re-selecting "Tommy Hilfiger, Levi's, H&M" on every visit, the extension does it on page load.

- Built with **Plasmo + React + TypeScript**
- No backend. All state lives in `chrome.storage.sync` (config) and `chrome.storage.session` (per-tab flags)
- Supports **built-in adapters** (Myntra, Ajio) and **user-taught custom sites** (teach mode)

---

## Tech Stack

| Layer           | Technology                                                                |
| --------------- | ------------------------------------------------------------------------- |
| Framework       | [Plasmo](https://docs.plasmo.com/) v0.90.5                                |
| UI              | React 18 + TypeScript 5 (strict mode)                                     |
| Manifest        | Chrome MV3 (`host_permissions`, `storage`, `tabs`)                        |
| Storage         | `chrome.storage.sync` (config) + `chrome.storage.session` (session flags) |
| Test runner     | Vitest 4 + jsdom + @testing-library/react                                 |
| Linting         | ESLint v10 (flat config `eslint.config.js`) + Prettier                    |
| Git hooks       | Husky + lint-staged (typecheck + lint + test on commit)                   |
| Package manager | pnpm                                                                      |

---

## Running the Extension

```bash
pnpm install          # install dependencies
pnpm dev              # start hot-reload dev server
# Then in Chrome: chrome://extensions → Load unpacked → select build/chrome-mv3-dev/
pnpm build            # production build → build/chrome-mv3-prod/
pnpm package          # zip → build/chrome-mv3-prod.zip
```

## Running Tests & Checks

```bash
pnpm test             # Vitest unit + integration tests
pnpm test:watch       # watch mode
pnpm typecheck        # tsc --noEmit (strict)
pnpm lint             # ESLint + Prettier check
```

---

## Architecture Overview

```
chrome.tabs.onUpdated (background.ts → handleAutoApply in lib/auto-apply.ts)
    │ status=loading
    ▼
hostname match in config.sites?  →  enabled?  →  defaultProfileId set?
    │ all yes
    ▼
session flag is null?  (number = already applied; 'user-off' = user disabled)
    │ yes
    ▼
setTabSessionState(tabId, Date.now())     ← STAMP BEFORE sendMessage (see rule #1)
    │
    ▼
chrome.tabs.sendMessage { action: 'applyProfile' } → content script
    │ content script calls sendResponse({ok:true}) IMMEDIATELY (see rule #2)
    │ then runs handleApply async
    ▼
isFilterPage()? → waitForFilterContainer → expandBrandFilter
    │
    ▼
adapter.applyBrands(brands)
    │
    ├── MyntraAdapter (URL-driven)
    │       scan ul.brand-list + .FilterDirectory-list for canonical names
    │       build new URL preserving non-Brand facets (Price, Color, ...)
    │       window.location.assign(newUrl)   ← ONE navigation, ALL brands
    │
    └── AjioAdapter (modal-batched)
            tick checkboxes in .more-popup-container
            click .rilrtl-button--apply       ← ONE navigation, ALL brands
```

### Key Components

| File                                     | Responsibility                                                                                                                                    |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/config.ts`                          | All TypeScript interfaces (Brand, Profile, Site, Config, messages). Single source of truth for types.                                             |
| `lib/storage.ts`                         | Typed chrome.storage.local + session helpers. STORAGE_KEY = `'brandfilter_config'`. One-time `sync → local` migration on first read.              |
| `lib/matching.ts`                        | Brand name matching: exact → string variant (contains) → regex variant.                                                                           |
| `lib/seed.ts`                            | `bootstrapConfig` (idempotent first-run + ongoing seed-merge), `WATCHES_PROFILE`, `DEFAULT_PROFILE_ID`.                                           |
| `lib/auto-apply.ts`                      | Pure `handleAutoApply` / `handleReapply` / `handleTurnOff`. Stamps session flag BEFORE sendMessage (prevents apply-loop).                         |
| `lib/popup-init.ts`                      | Pure `initPopupState`. Catches storage errors so popup never hangs on "Loading…".                                                                 |
| `lib/adapters/base.ts`                   | SiteAdapter interface, `waitForElement()` (MutationObserver + 8s timeout), `pollForElement()`, `sleep()`.                                         |
| `lib/adapters/myntra.ts`                 | URL-driven adapter: scan DOM → build `?f=Brand:...` URL → ONE `location.assign()`. Exports `parseBrandsFromUrl` + `buildUrlWithBrands` for tests. |
| `lib/adapters/ajio.ts`                   | Click+modal+Apply adapter: ticks modal checkboxes then clicks `.rilrtl-button--apply` for a single navigation.                                    |
| `background.ts`                          | Service-worker shell — delegates to `bootstrapConfig` + `handleAutoApply` + `handleReapply` + `handleTurnOff`.                                    |
| `contents/myntra.ts`, `contents/ajio.ts` | ACK message synchronously (`sendResponse({ok:true})`), then run apply async (page may navigate mid-flight).                                       |
| `contents/teachable.ts`                  | Teach mode content script (matches all_urls, activates on `startTeach` message).                                                                  |
| `popup.tsx`                              | Popup UI; wraps `initPopupState` and surfaces errors instead of hanging.                                                                          |
| `options.tsx`                            | Options page entry: 4 tabs (Master Brands, Profiles, Sites, Export/Import).                                                                       |
| `assets/default-brands.json`             | 90 pre-seeded brands (75 fashion + 15 watches). Seeded on first install, missing brands top-up on every SW wake.                                  |

---

## Data Model

All user data lives in `chrome.storage.local` under key `brandfilter_config`:

```typescript
interface Config {
  version: string // "1"
  masterBrands: Brand[] // source of truth — all brands
  profiles: Profile[] // named subsets
  sites: Site[] // per-site settings
}
```

**Key invariants:**

- A brand must exist in `masterBrands` before it can appear in any `profile.brandIds`
- A brand CAN belong to multiple profiles simultaneously
- Adding a brand via the UI auto-promotes it to `masterBrands`
- Storage is `chrome.storage.local` (5 MB quota). We previously used `chrome.storage.sync` but its 8 KB per-item quota was exceeded once the seed grew past ~90 brands — see `tests/storage-quota.test.ts`. Migration from sync→local happens automatically on first `getConfig()` read.

**Session state** (per-tab, clears on browser close):

- Key: `applied_{tabId}`
- Value: `number` (timestamp = auto-applied), `'user-off'` (user turned off), absent (fresh)

---

## Core Rules & Constraints

### Never break these

1. **ESLint uses flat config** — `eslint.config.js` only. Do NOT create `.eslintrc.json` or `.eslintrc.js`. ESLint v10 does not support legacy config alongside flat config.

2. **`resolveJsonModule: true`** must stay in `tsconfig.json` — importing `default-brands.json` in background.ts requires it.

3. **Session flag is stamped BEFORE `chrome.tabs.sendMessage`, not after.** The previous order caused an infinite apply-loop because Myntra's per-click navigation re-fired `chrome.tabs.onUpdated` while `sendMessage` was still pending. Lives in `lib/auto-apply.ts`. Pinned by `tests/auto-apply.test.ts` — reversing the order makes the suite fail with a 5 s timeout.

4. **Content scripts call `sendResponse({ok:true})` synchronously**, then run apply work async. The Myntra adapter ends with `window.location.assign()` which destroys the content script — if we waited to ack, `sendMessage` would reject and the background's recovery path would re-trigger apply. See `contents/myntra.ts` and `contents/ajio.ts`.

5. **MyntraAdapter is URL-driven, not click-driven.** It scans the sidebar + directory modal for canonical brand names once, then performs ONE `window.location.assign()` to a URL of the form `?f=Brand:Name1,Name2::Price:500-1000::...`. The previous click-per-brand approach only ever applied 1–2 brands before Myntra's navigation killed the script. Lives in `lib/adapters/myntra.ts`. Pinned by `tests/myntra-adapter.test.ts` (including a 21-brand regression test).

6. **AjioAdapter is modal-batched.** Tick checkboxes in `.more-popup-container`, then click `.rilrtl-button--apply` once to commit. Ajio's modal does NOT navigate per checkbox — only Apply navigates. `expandBrandFilter()` looks up the brands accordion by `aria-label="brands"` and clicks the toggle if `aria-expanded="false"`.

7. **Ajio accordion wait is 300ms** — `expandBrandFilter()` clicks the expand button then waits 300 ms. Do not reduce this.

8. **Session state stores timestamps, not booleans** — `setTabSessionState(tabId, Date.now())`, not `true`. The popup's StatusBar uses this to show "Applied X min ago".

9. **Teach mode uses DOM API, not innerHTML** — `showConfirmToast()` uses `el.textContent = text`, never `innerHTML`, to prevent XSS from user-provided CSS selectors.

10. **Storage is `chrome.storage.local`, not `chrome.storage.sync`** (5 MB vs 8 KB per-item). Switching back would break installs with >~90 brands. `tests/storage-quota.test.ts` is a tripwire.

11. **Default profile on first install** — `background.ts` creates a "My Brands" profile with all seeded brands and sets it as `defaultProfileId` for both Myntra and Ajio. Never remove this.

### TypeScript

- Strict mode is ON: `"strict": true, "noUncheckedIndexedAccess": true`
- All interfaces defined in `lib/config.ts`. Import from there everywhere else.
- Use `satisfies` keyword for message objects to catch mismatched action names at compile time.

### Testing

- Test files live in `tests/`
- Run with `pnpm test` (Vitest)
- Chrome APIs are mocked in `tests/setup.ts` — check there before adding new chrome.\* calls
- All adapters must have tests for: `isFilterPage()`, `applyBrands()` success + notFound + skip-if-checked, `clearAppliedBrands()`
- Integration tests live in `tests/integration/`

---

## Adapter CSS Selectors

### Myntra (✅ Confirmed from live DOM)

```typescript
FILTER_CONTAINER_SELECTOR = 'ul.brand-list'
BRAND_CHECKBOX_SELECTOR = 'input[type="checkbox"]'
```

**Key:** Myntra stores the brand name in `input.value` (e.g. `<input type="checkbox" value="Tommy Hilfiger">`). Do NOT use label text for matching — it includes the count "(4736)" and react-text comment nodes. Match against `checkbox.value` directly.

DOM path: `.vertical-filters-filters.brand-container > ul.brand-list > li > label > input[type="checkbox"]`

### Ajio (✅ Confirmed from live DOM, multi-facet page)

Ajio renders ONE `.cat-facets` per filter group (Shop For, Category, Brands, Price, Colors, Discount Ranges, …). All selectors must be scoped to the BRANDS host found via `aria-label="brands"` — a document-wide `.cat-facets .facet-more` selector returns the FIRST match, which on the clothing page is **Category**'s MORE (opens "Choose Category" modal instead of the brands picker).

```typescript
// Page-wide
FACET_CONTAINER_SELECTOR = '.cat-facets' // wait for any one
BRAND_HEADER_TOGGLE_SELECTOR = '.cat-facets .facet-head-before[aria-label="brands"]'
FACET_BODY_SELECTOR = '.facet-body'

// Within the brands `.cat-facets` host (use findBrandsFacetHost())
INLINE_BRAND_INPUT_SELECTOR_LOCAL = 'input[type="checkbox"][name="brand"]'
MORE_BTN_SELECTOR_LOCAL = '.facet-more'

// Modal (only one open at a time, so document-wide is fine here)
MODAL_CONTAINER_SELECTOR = '.more-popup-container'
MODAL_BRAND_INPUT_SELECTOR = '.more-popup-container input[type="checkbox"][name="brand"]'
MODAL_APPLY_BTN_SELECTOR = '.more-popup-container .rilrtl-button--apply'
```

**The rule**: any DOM query the Ajio adapter performs MUST be scoped to either `findBrandsFacetHost()` or the `.more-popup-container`. Never use a bare `.cat-facets X` selector — it will silently pick up Category, Shop For, or whichever facet renders first.

**Alternative for unsupported sites:** Use the extension's Teach Mode to let the DOM inspection tool find the selectors automatically.

---

## First-Run Flow

1. `chrome.runtime.onInstalled` (reason = "install")
2. Seeds `masterBrands` from `assets/default-brands.json` (60 brands)
3. Creates profile "My Brands" (`id: 'my-brands'`) with all brand IDs
4. Sets `defaultProfileId: 'my-brands'` on both Myntra and Ajio sites
5. Opens `options.html` in a new tab

If you see "No profiles yet" in the popup, the user hasn't gone through first-run OR the extension was loaded from a build directory that already had stale storage. **Clear extension storage** via DevTools → Application → Storage → Clear site data, then reload.

---

## Teach Mode

For unsupported sites:

1. Popup shows "Teach this site" button on unrecognized hostnames
2. `contents/teachable.ts` activates on `startTeach` message
3. User clicks a brand checkbox — extension infers a CSS selector by walking up 5 DOM ancestors
4. Toast confirmation → saved to `site.customSelector` in config

Security: the inferred selector is displayed using `textContent` (not innerHTML). Never use innerHTML with user-provided or page-provided strings.

---

## Profile & Brand Slugs

- Brand IDs and profile IDs are URL-safe slugs: lowercase, spaces → hyphens, strip special chars
- Generated via: `name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')`
- Empty slug after generation → silently return (prevents empty-ID records)
- Duplicate ID check is performed before saving both brands and profiles

---

## Loop Prevention

Auto-apply fires at most once per tab per page load:

- Background checks `applied_{tabId}` in `chrome.storage.session` before sending applyProfile
- After apply: sets `applied_{tabId} = Date.now()`
- Popup "Apply" button: sends `reapply` to background, which clears the flag first (always wins over auto-apply)
- Popup "✕ Off": sets `applied_{tabId} = 'user-off'` (blocks auto-apply even on soft navigation)
- Flags are per-tab, cleared automatically when browser closes

---

## V0 Scope

### In scope

Myntra + Ajio adapters · popup with profile + brand selection · options page (4 tabs) · teach mode · first-run onboarding · MutationObserver dynamic handling · brand matching (name + variants + regex) · loop prevention · unit + integration tests · TypeScript strict · ESLint + Prettier + Husky

### Out of scope (do not add without explicit approval)

Amazon Fashion · Nykaa · Flipkart adapters · login/auth · analytics/history · Firefox/Edge · keyboard shortcuts · CSV import · price/discount/rating filters

---

## Feature Workflow

Non-trivial changes go through a role-based workflow defined in `.claude/skills/`:

- `/po` — Product Owner: writes per-feature PRD under `docs/superpowers/specs/<slug>-prd.md`
- `/vp-eng` — VP Engineering: writes tech spec, runs principles audit
- `/tl` — Tech Lead: writes plan + test plan, executes via TDD
- `/qa` — QA: validates against acceptance criteria
- `/feature` — Delivery Lead: orchestrates all four with approval gates

Design spec: [`docs/superpowers/specs/2026-05-17-role-based-workflow-design.md`](docs/superpowers/specs/2026-05-17-role-based-workflow-design.md).

Strictness scales with change size (Trivial / Small / Large) — see the size classifier inside any role's `SKILL.md`. Trivial changes (selector tweaks, copy changes) skip the workflow.

---

## Common Pitfalls

| Symptom                             | Cause                                                                                                         | Fix                                                                                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| "No profiles yet" in popup          | Storage cleared or first-run didn't complete                                                                  | Clear extension storage, reload                                                                                                       |
| 0 brands applied, no errors         | Wrong CSS selectors                                                                                           | Verify selectors in DevTools                                                                                                          |
| Filters applied twice               | Session flag cleared unexpectedly                                                                             | Check background.ts reapply handler                                                                                                   |
| ESLint fails with "no config found" | Created `.eslintrc.json` by accident                                                                          | Delete it; only `eslint.config.js` is used                                                                                            |
| TS error importing JSON             | `resolveJsonModule` missing                                                                                   | Ensure `tsconfig.json` has it                                                                                                         |
| StatusBar always shows "just now"   | Stored `true` instead of `Date.now()`                                                                         | storage.ts must store `Date.now()`                                                                                                    |
| Teach mode XSS                      | Used `innerHTML` in toast                                                                                     | Use `textContent` only                                                                                                                |
| Ajio opens "Choose Category" modal  | Used unscoped `.cat-facets .facet-more` — matched first facet, not Brands                                     | Scope via `findBrandsFacetHost()` (looks up the `.cat-facets` ancestor of `.facet-head-before[aria-label="brands"]`) before any query |
| Myntra only applies 1–2 brands      | Click-per-checkbox strategy; each click navigates and kills the content script                                | URL-driven strategy: scan canonical names, build `?f=Brand:Name1,Name2,...`, ONE `location.assign()`                                  |
| Popup loops "Loading…" forever      | `setConfig` to `chrome.storage.sync` threw QUOTA_BYTES_PER_ITEM (>8 KB); IIFE swallowed rejection             | Use `chrome.storage.local`; `initPopupState` returns `{ok:false, error}` instead of throwing                                          |
| Auto-apply infinite loop on Myntra  | Session flag stamped AFTER sendMessage; Myntra's per-click navigation fired onUpdated → re-fired apply → loop | Stamp BEFORE; content scripts ACK synchronously (`sendResponse({ok:true})` before doing work)                                         |
