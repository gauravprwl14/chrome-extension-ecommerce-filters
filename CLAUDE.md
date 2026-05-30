# BrandFilter Chrome Extension — CLAUDE.md

> This file is the authoritative guide for anyone (human or AI) working in this codebase.
> Read it before touching any file. It is regenerated from the live source — when code and
> this doc disagree, fix whichever is wrong and keep them in sync.

---

## What This Project Is

**BrandFilter** is a Chrome extension (Manifest V3) that automatically applies a user's saved brand filter preferences on e-commerce listing pages (Myntra, Ajio). Instead of re-selecting "Tommy Hilfiger, Levi's, H&M" on every visit, the extension does it on page load.

- Built with **Plasmo + React + TypeScript**
- No backend. All state lives in `chrome.storage.local` (config) and `chrome.storage.session` (per-tab flags)
- Supports **built-in adapters** (Myntra, Ajio) and **user-taught custom sites** (teach mode)
- Ships **272 curated brands** and **four system profiles** (Premium, Mid-tier, Budget, Watches) plus a catch-all "My Brands" default

---

## Tech Stack

| Layer           | Technology                                                                 |
| --------------- | -------------------------------------------------------------------------- |
| Framework       | [Plasmo](https://docs.plasmo.com/) v0.90.5                                 |
| UI              | React 18.2 + TypeScript 5.3 (strict mode)                                  |
| Manifest        | Chrome MV3 (`host_permissions`, `storage`, `tabs`)                         |
| Storage         | `chrome.storage.local` (config) + `chrome.storage.session` (session flags) |
| Test runner     | Vitest 4 + jsdom + @testing-library/react                                  |
| Linting         | ESLint v10 (flat config `eslint.config.js`) + Prettier 3                   |
| Git hooks       | Husky 9 + lint-staged (typecheck + lint + test on commit)                  |
| Package manager | pnpm                                                                       |

`package.json` name: `brand-filter` · version `0.0.1`.

**Manifest** (declared in `package.json` → `manifest`):

- `host_permissions`: `*.myntra.com`, `*.ajio.com`, `*.tatacliq.com`, `*.flipkart.com`, `*.amazon.in`, `*.nykaafashion.com`, `*.snapdeal.com`
- `permissions`: `storage`, `tabs`

---

## Running the Extension

```bash
pnpm install          # install dependencies
pnpm dev              # start hot-reload dev server (plasmo dev)
# Then in Chrome: chrome://extensions → Load unpacked → select build/chrome-mv3-dev/
pnpm build            # production build → build/chrome-mv3-prod/
pnpm package          # zip → build/chrome-mv3-prod.zip
```

## Running Tests & Checks

```bash
pnpm test             # Vitest unit + integration tests (vitest run)
pnpm test:watch       # watch mode (vitest)
pnpm typecheck        # tsc --noEmit (strict)
pnpm lint             # eslint . && prettier --check .
```

Pre-commit hook (`.husky/pre-commit`) runs, in order: `pnpm typecheck` → `pnpm lint` → `pnpm test`.
lint-staged runs `eslint --fix` + `prettier --write` on `*.{ts,tsx}` and `prettier --write` on `*.{json,md}`.

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
setTabSession(tabId, Date.now())          ← STAMP BEFORE sendMessage (see rule #1)
    │  (if sendMessage fails → clearTabSession so next load can retry)
    ▼
chrome.tabs.sendMessage { action: 'applyProfile', profileId } → content script
    │ content script calls sendResponse({ok:true}) IMMEDIATELY (see rule #2)
    │ then runs handleApply async
    ▼
isFilterPage()? → waitForFilterContainer → expandBrandFilter
    │
    ▼
adapter.applyBrands(brands) → ApplyResult { applied[], skipped[], notFound[] }
    │
    ├── MyntraAdapter (URL-driven)
    │       scan ul.brand-list + .FilterDirectory-list for canonical names
    │       build new URL preserving non-Brand facets (Price, Color, ...)
    │       window.location.assign(newUrl)   ← ONE navigation, ALL brands
    │
    └── AjioAdapter (modal-batched)
            tick checkboxes in .more-popup-container
            click .rilrtl-button--apply       ← ONE navigation, ALL brands
            (falls back to inline list when no `.facet-more` exists)
```

### Key Components

| File                                     | Responsibility                                                                                                                                                                                                                                       |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/config.ts`                          | All TypeScript interfaces (`Brand`, `BrandVariant`, `Profile`, `Site`, `Config`, message types). Single source of truth for types. `DEFAULT_CONFIG` (version `'2'`).                                                                                 |
| `lib/storage.ts`                         | Typed chrome.storage.local + session helpers. `STORAGE_KEY = 'brandfilter_config'`. One-time `sync → local` migration on first read. `ensureBrandInLibrary`, tab-session getters/setters.                                                            |
| `lib/matching.ts`                        | Brand name matching: exact name → string variant (substring) → regex variant. Exports `normalizeLabel`, `matchesBrand`, `findMatchIndex`. Invalid regex is silently skipped.                                                                         |
| `lib/seed.ts`                            | `bootstrapConfig` (idempotent first-run + ongoing seed-merge), system profile constants, `DEFAULT_PROFILE_ID`, `DEPRECATED_BRAND_IDS`, `migrateToV2`, `syncSystemProfiles`, `mergeSeedsIntoConfig`, `getExcludedFromMyBrandsIds`.                    |
| `lib/auto-apply.ts`                      | Pure `handleAutoApply` / `handleReapply` / `handleTurnOff`. Stamps session flag BEFORE sendMessage (prevents apply-loop). Takes an injected `AutoApplyDeps`.                                                                                         |
| `lib/popup-init.ts`                      | Pure `initPopupState`. Returns `{ok:false, error}` instead of throwing, so the popup never hangs on "Loading…". Bootstrap failures are non-fatal.                                                                                                    |
| `lib/profile-utils.ts`                   | Pure helpers: `slugifyName`, `generateUniqueProfileId`, `generateCloneName`. No side effects.                                                                                                                                                        |
| `lib/brand-search.ts`                    | `searchBrands(brands, query)` — case-insensitive substring search + ranking for the brand-picker UI (treats regex variants as plain text).                                                                                                           |
| `lib/use-outside-click.ts`               | `useOutsideClick(ref, onClose, active)` React hook — closes popovers on outside mousedown / Escape. `ref` MUST wrap trigger + menu together.                                                                                                         |
| `lib/adapters/base.ts`                   | `SiteAdapter` interface, `ApplyResult` type, `waitForElement()` (MutationObserver + 8s timeout), `pollForElement()` (50ms poll, React-rerender resilient), `sleep()`.                                                                                |
| `lib/adapters/myntra.ts`                 | URL-driven adapter: scan DOM → build `?f=Brand:...` URL → ONE `location.assign()`. Exports `parseBrandsFromUrl` + `buildUrlWithBrands` for tests. `readSelectedBrands()` parses selected brands from the current URL.                                |
| `lib/adapters/ajio.ts`                   | Click+modal+Apply adapter: ticks modal checkboxes then clicks `.rilrtl-button--apply` once. Tracks applied values on `document.body` (survives React unmount). `readSelectedBrands()` expands the brands accordion then reads checked inline inputs. |
| `lib/capture.ts`                         | Capture-from-page logic: `captureResponse(adapter)` (content-script entry point), `reconcileCapturedBrands`, `buildCaptureProfile`, `buildCaptureUpdate`, `siteSupportsCapture`. Myntra + Ajio are both supported.                                   |
| `lib/popup-capture.ts`                   | `captureForPopup` — sends `captureSelection` to the active tab, maps response to `CaptureForPopupResult` (review / empty / not-filter-page / error).                                                                                                 |
| `background.ts`                          | Service-worker shell — bootstraps on every wake; delegates to `bootstrapConfig` + `handleAutoApply` + `handleReapply` + `handleTurnOff`. `SEED_BRANDS`/`SEED_PROFILES` defined here.                                                                 |
| `contents/myntra.ts`, `contents/ajio.ts` | ACK `applyProfile`/`clearFilters` synchronously then run async. Also handle `captureSelection` (read-only, `return true` for async response) — calls `captureResponse(adapter)` and resolves after DOM scan.                                         |
| `contents/teachable.ts`                  | Teach mode content script (matches the 5 teachable hosts, activates on `startTeach` message). Infers a CSS selector by walking up to 5 ancestors.                                                                                                    |
| `popup.tsx`                              | Popup UI; wraps `initPopupState` and surfaces errors instead of hanging. Shows capture buttons (`＋ New profile`, `↑ Update`) on supported sites (Myntra + Ajio). Uses `ProfileDropdown`, `BrandMultiSelect`, `StatusBar`, `CaptureProfilePanel`.    |
| `options.tsx`                            | Options page entry: 4 tabs (Master Brands, Profiles, Sites, Export/Import). Owns a unified `save()` that syncs state → storage. Refreshes config on `visibilitychange` so profiles created via popup appear immediately.                             |
| `components/`                            | Popup-shared components: `BrandMultiSelect`, `ProfileDropdown`, `StatusBar`, `CaptureProfilePanel`.                                                                                                                                                  |
| `options/components/`                    | Options-only components: `BrandPicker`, `DuplicateConfirmModal`.                                                                                                                                                                                     |
| `options/tabs/`                          | `MasterBrandsTab`, `ProfilesTab`, `SitesTab`, `ExportImportTab`.                                                                                                                                                                                     |
| `assets/default-brands.json`             | **272 pre-seeded brands** (fashion + women's + activewear + watches), many with string/regex variants. Seeded on first install; missing brands top-up on every SW wake.                                                                              |

---

## Data Model

All user data lives in `chrome.storage.local` under key `brandfilter_config`:

```typescript
interface Config {
  version: string // currently "2"
  masterBrands: Brand[] // source of truth — all brands
  profiles: Profile[] // named subsets
  sites: Site[] // per-site settings
}

interface Brand {
  id: string // URL-safe slug, e.g. "tommy-hilfiger"
  name: string // display name
  variants?: BrandVariant[] // alternative names for matching
}
interface BrandVariant {
  type: 'string' | 'regex'
  value: string // literal substring, or regex pattern (no delimiters)
}

interface Profile {
  id: string
  name: string
  icon: string // single emoji
  brandIds: string[] // references Brand.id
  isSystem?: boolean // true = shipped seed profile, untouched → locked in UI
}

interface Site {
  id: string
  hostname: string // e.g. "www.myntra.com"
  defaultProfileId: string // Profile id auto-applied on page load
  enabled: boolean
  customSelector: string | null // null for built-in adapters; CSS selector for taught sites
}
```

**Messages** (`ExtensionMessage` union in `lib/config.ts`):

- `{ action: 'applyProfile', profileId }` — background → content
- `{ action: 'clearFilters' }` — background → content
- `{ action: 'reapply', tabId, profileId }` — popup → background
- `{ action: 'turnOff', tabId }` — popup → background
- `{ action: 'captureSelection' }` — popup → content (Myntra + Ajio); content responds async with `CaptureSelectionResponse { ok, isFilterPage, brands[] }`

**Key invariants:**

- A brand must exist in `masterBrands` before it can appear in any `profile.brandIds`
- A brand CAN belong to multiple profiles simultaneously
- Adding a brand via the UI auto-promotes it to `masterBrands` (`ensureBrandInLibrary`)
- Storage is `chrome.storage.local` (5 MB quota). We previously used `chrome.storage.sync` but its 8 KB per-item quota was exceeded once the seed grew large — see `tests/storage-quota.test.ts`. Migration from sync→local happens automatically on first `getConfig()` read.

**Session state** (per-tab, clears on browser close):

- Key: `applied_{tabId}` (in `chrome.storage.session`)
- Value: `number` (timestamp = auto-applied), `'user-off'` (user turned off), absent (fresh)

---

## System Profiles & Seeding

`lib/seed.ts` defines four shipped `SeedProfile`s plus the catch-all default:

| Profile   | id          | icon | Notes                                                                                 |
| --------- | ----------- | ---- | ------------------------------------------------------------------------------------- |
| Premium   | `premium`   | 👑   | Tier-1 international + elevated Indian designer/ethnic. Cross-gender.                 |
| Mid-tier  | `mid-tier`  | 🛒   | Mass-market, high-street, activewear, denim, ethnicwear. (`MEDIOCRE_PROFILE`)         |
| Budget    | `budget`    | 🏷️   | Entry-level / fast-fashion. **Removed from Mid-tier** so each brand sits in one tier. |
| Watches   | `watches`   | ⌚   | 18 watch brands.                                                                      |
| My Brands | `my-brands` | —    | Catch-all default (`DEFAULT_PROFILE_ID`); set as `defaultProfileId` on Myntra + Ajio. |

`getExcludedFromMyBrandsIds()` currently excludes only **Budget** brands from "My Brands" (Premium/Mid-tier are curated enough to keep in the catch-all).

`DEPRECATED_BRAND_IDS` (e.g. `highlander`, `red-tape`) are stripped from `masterBrands` and every profile on each bootstrap pass.

**`bootstrapConfig(seedBrands, seedProfiles, getConfig, setConfig)`** is idempotent and runs on **every service-worker wake** (not just install):

- Fresh storage → seed all brands (minus deprecated), create "My Brands" (minus excluded Budget brands) + all curated profiles, assign default to built-in sites. Returns `wasFirstRun: true`.
- Existing install → top-up missing seed brands, propagate them into the default profile **only if it's still `isSystem`**, create any missing curated profiles, strip deprecated ids. Returns `wasFirstRun: false`.

**`migrateToV2`** marks each profile `isSystem: true|false` (true only if id/name/icon and the full live seed brand set are unchanged) and bumps `version` to `'2'`.
**`syncSystemProfiles`** reshapes only `isSystem: true` profiles to match the current seed — user-edited profiles (`isSystem: false`) are never touched. This is how an old install picks up the Budget-segregation change.

System profiles are **locked in the UI**; the edit path is **Duplicate** (`DuplicateConfirmModal` → `generateCloneName`).

---

## Core Rules & Constraints

### Never break these

1. **ESLint uses flat config** — `eslint.config.js` only. Do NOT create `.eslintrc.json` or `.eslintrc.js`. ESLint v10 does not support legacy config alongside flat config. Rules: `@typescript-eslint/recommended`, `no-explicit-any: error`.

2. **`resolveJsonModule: true`** must stay in `tsconfig.json` — importing `default-brands.json` in `background.ts` requires it.

3. **Session flag is stamped BEFORE `chrome.tabs.sendMessage`, not after.** The previous order caused an infinite apply-loop because Myntra's per-click navigation re-fired `chrome.tabs.onUpdated` while `sendMessage` was still pending. Lives in `lib/auto-apply.ts` (comment: _"ALWAYS set the session flag BEFORE sending … NEVER set it after"_). Pinned by `tests/auto-apply.test.ts` — reversing the order fails the suite with a 5 s timeout. If `sendMessage` fails, `clearTabSession` so the next load can retry.

4. **Content scripts call `sendResponse({ok:true})` synchronously**, then run apply work async. The Myntra/Ajio adapters end with a navigation that destroys the content script — if we waited to ack, `sendMessage` would reject and the background's recovery path would re-trigger apply. See `contents/myntra.ts` and `contents/ajio.ts` (comment: _"CRITICAL: ACK the message synchronously, BEFORE doing any work"_).

5. **MyntraAdapter is URL-driven, not click-driven.** It scans the sidebar + directory modal for canonical brand names once, then performs ONE `window.location.assign()` to a URL of the form `?f=Brand:Name1,Name2::Price:500-1000::...`. The previous click-per-brand approach only ever applied 1–2 brands before Myntra's navigation killed the script. Lives in `lib/adapters/myntra.ts`. Pinned by `tests/myntra-adapter.test.ts` (incl. a 21-brand regression test).

6. **AjioAdapter is modal-batched.** Tick checkboxes in `.more-popup-container`, then click `.rilrtl-button--apply` once to commit. Ajio's modal does NOT navigate per checkbox — only Apply navigates. `expandBrandFilter()` looks up the brands accordion by `aria-label="brands"` and clicks the toggle if `aria-expanded="false"`. Falls back to the inline list only when no `.facet-more` button exists.

7. **Ajio accordion wait is 300ms / modal opens settle at 200ms** — do not reduce these; React streams items in after mount. (See timeout table below.)

8. **Session state stores timestamps, not booleans** — `setTabSession(tabId, Date.now())`, not `true`. The popup's StatusBar uses this to show "Applied X min ago".

9. **Teach mode uses DOM API, not innerHTML** — `showConfirmToast()` and the teach overlay use `el.textContent = text`, never `innerHTML`, to prevent XSS from page-/user-provided CSS selectors.

10. **Storage is `chrome.storage.local`, not `chrome.storage.sync`** (5 MB vs 8 KB per-item). Switching back would break installs once the seed/user brands exceed 8 KB. `tests/storage-quota.test.ts` is a tripwire.

11. **First-run default profile** — `bootstrapConfig` creates "My Brands" (`my-brands`) with all seeded brands (minus excluded Budget brands) and sets it as `defaultProfileId` for both Myntra and Ajio. Never remove this.

12. **Ajio applied-value tracking lives on `document.body`**, not on the modal element — React unmounts the modal DOM after Apply navigates, so `clearAppliedBrands()` must read the JSON list off `document.body[data-brandfilter-ajio-applied]`.

13. **`useOutsideClick` ref must wrap trigger AND menu** in one root element — otherwise the trigger's own click reopens the menu the hook just closed, toggling forever. Listens on `mousedown` + Escape.

### TypeScript

- Strict mode is ON: `"strict": true, "noUncheckedIndexedAccess": true`
- All interfaces defined in `lib/config.ts`. Import from there everywhere else.
- `tsconfig.json` extends `plasmo/templates/tsconfig.base`; path alias `~* → ./*`; `types: ["vitest/globals", "chrome", "node"]`.

### Testing

- Test files live in `tests/` (16 files, ~3.8k lines) and `tests/integration/`
- Run with `pnpm test` (Vitest, jsdom, globals on)
- Chrome APIs are mocked in `tests/setup.ts` — including a **realistic 8 KB sync / 5 MB local quota** enforced via `TextEncoder`. Check there before adding new `chrome.*` calls.
- All adapters must have tests for: `isFilterPage()`, `applyBrands()` success + notFound + skip-if-checked, `clearAppliedBrands()`

---

## Adapter CSS Selectors

### Myntra (✅ Confirmed from live DOM) — `lib/adapters/myntra.ts`

```typescript
BRAND_LIST_SELECTOR = 'ul.brand-list' // sidebar visible brands
BRAND_MORE_BTN_SELECTOR = '.brand-more' // "+ N more" directory link
DIRECTORY_LIST_SELECTOR = '.FilterDirectory-list' // directory modal list
DIRECTORY_CLOSE_SELECTOR = '.FilterDirectory-close'
CHECKBOX_SELECTOR = 'input[type="checkbox"]'
```

URL facet grammar: `?f=Brand:Name1,Name2::Price:500-1000::Color:Black`
(`f` param · `::` facet separator · `Brand:` prefix · `,` brand value separator).

**Key:** Myntra stores the brand name in `input.value` (e.g. `<input type="checkbox" value="Tommy Hilfiger">`). Do NOT use label text for matching — it includes the count "(4736)" and react-text comment nodes. Match against `checkbox.value` directly. `isFilterPage()` rejects `/buy/*` and non-listing prefixes (`/login`, `/cart`, `/checkout`, `/wishlist`, `/profile`, `/gateway`, `/my-account`, `/offers`).

### Ajio (✅ Confirmed from live DOM, multi-facet page) — `lib/adapters/ajio.ts`

Ajio renders ONE `.cat-facets` per filter group (Shop For, Category, Brands, Price, …). All selectors must be scoped to the BRANDS host found via `aria-label="brands"` — a document-wide `.cat-facets .facet-more` selector returns the FIRST match, which on the clothing page is **Category**'s MORE (opens "Choose Category" modal instead of the brands picker).

```typescript
// Page-wide
FACET_CONTAINER_SELECTOR = '.cat-facets'
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

`isFilterPage()` returns true when `pathname` starts with `/s/`. Inline inputs are `aria-hidden` — click the wrapping `.facet-linkfref` instead. Applied modal values are tracked on `document.body[data-brandfilter-ajio-applied]`.

**The rule**: any DOM query the Ajio adapter performs MUST be scoped to either `findBrandsFacetHost()` or the `.more-popup-container`. Never use a bare `.cat-facets X` selector — it will silently pick up Category, Shop For, or whichever facet renders first.

### Adapter timeouts (`lib/adapters/*`)

| Where                      | Value                                    | Purpose                                |
| -------------------------- | ---------------------------------------- | -------------------------------------- |
| `waitForElement()` default | 8000 ms                                  | MutationObserver wait                  |
| `waitForFilterContainer()` | 8000 ms + 200 ms settle                  | wait for `.brand-list` / `.cat-facets` |
| Myntra directory modal     | 5000 ms + 300 ms settle                  | `.FilterDirectory-list` stream-in      |
| Ajio `expandBrandFilter()` | 5000 ms (collapsed) / 2000 ms (expanded) | wait for `.facet-body`                 |
| Ajio modal open            | 5000 ms (50 ms poll) + 200 ms            | `.more-popup-container`                |
| Ajio per-checkbox click    | 20 ms (modal) / 50 ms (inline)           | let React register the toggle          |
| `pollForElement()` default | 2000 ms, 50 ms interval                  | React re-render resilience             |

**Alternative for unsupported sites:** use Teach Mode (below).

---

## First-Run Flow

1. `chrome.runtime.onInstalled` (reason = `"install"`)
2. `bootstrapConfig` seeds `masterBrands` from `assets/default-brands.json` (272 brands)
3. Creates profile "My Brands" (`id: 'my-brands'`) with all seeded brand ids minus excluded Budget brands; creates Premium / Mid-tier / Budget / Watches system profiles
4. Sets `defaultProfileId: 'my-brands'` on both Myntra and Ajio sites
5. Opens `options.html` in a new tab

`bootstrapConfig` also runs on `onStartup` and on module load (so `chrome://extensions → Reload` re-seeds), but only `onInstalled` opens the options tab.

If you see "No profiles yet" in the popup, first-run didn't complete OR storage is stale. **Clear extension storage** via DevTools → Application → Storage → Clear site data, then reload.

---

## Teach Mode

For unsupported sites (the teachable hosts: TataCliq, Flipkart, Amazon.in, Nykaa Fashion, Snapdeal):

1. Popup shows a teach affordance on unrecognized/taught hostnames
2. `contents/teachable.ts` activates on the `startTeach` message (dormant otherwise)
3. User clicks a brand checkbox — the extension infers a CSS selector by walking up to 5 DOM ancestors, preferring `#id`, then `.firstClass`, then tag name, and appending `input[type="checkbox"]`
4. Toast confirmation (rendered with `textContent`, never `innerHTML`) → saved to `site.customSelector` in config via `setConfig`

Security: the inferred selector is displayed using `textContent`. Never use `innerHTML` with page-provided strings.

---

## Profile & Brand Slugs (`lib/profile-utils.ts`)

- Brand/profile IDs are URL-safe slugs: lowercase, spaces → hyphens, strip everything outside `[a-z0-9-]`, trim leading/trailing hyphens
- `slugifyName(name)` returns `""` if nothing survives — callers treat empty as a validation error (no empty-ID records)
- `generateUniqueProfileId(name, taken)` suffixes `-2`, `-3`, … against a `Set` of taken ids
- `generateCloneName(name, taken)` produces "X (copy)", "X (copy 2)", … against existing display names

---

## Loop Prevention

Auto-apply fires at most once per tab per page load (`lib/auto-apply.ts`):

- Background checks `applied_{tabId}` in `chrome.storage.session` before sending `applyProfile`
- After apply: sets `applied_{tabId} = Date.now()` **before** sendMessage; clears it if sendMessage rejects
- Popup "Apply" → sends `reapply` to background, which clears the flag first (always wins over auto-apply)
- Popup "✕ Off" → sets `applied_{tabId} = 'user-off'` (blocks auto-apply even on soft navigation; persists through send failures)
- Flags are per-tab, cleared automatically when the browser closes

---

## Tests & Tripwires

Unit (`tests/`): `storage`, `storage-quota`, `auto-apply`, `matching`, `seed`, `brand-search`, `profile-utils`, `popup-init`, `use-outside-click`, `myntra-adapter`, `ajio-adapter`.
Integration (`tests/integration/`): `apply-flow`, `background`, `config-lifecycle`, `popup-flow`, `profiles-tab`.

**Tripwires — reverting the guarded behavior turns these red:**

| Test                     | Guards against                                                              |
| ------------------------ | --------------------------------------------------------------------------- |
| `storage-quota.test.ts`  | Reverting to `chrome.storage.sync` (realistic config exceeds 8 KB)          |
| `auto-apply.test.ts`     | Stamping the session flag AFTER sendMessage (infinite apply-loop on Myntra) |
| `myntra-adapter.test.ts` | Click-per-brand strategy regression (only 1–2 brands applied)               |
| `popup-init.test.ts`     | Quota error bubbling up as a thrown rejection → popup hangs on "Loading…"   |

---

## V0 Scope

### In scope

Myntra + Ajio adapters · popup (profile + brand selection) · options page (4 tabs) · teach mode · first-run onboarding · system profiles (Premium / Mid-tier / Budget / Watches) · MutationObserver dynamic handling · brand matching (name + variants + regex) · loop prevention · export/import + reset · capture-from-page (Myntra + Ajio: read selected brands → create/update profile) · unit + integration tests · TypeScript strict · ESLint + Prettier + Husky

### Out of scope (do not add without explicit approval)

Amazon Fashion · Nykaa · Flipkart **built-in** adapters (they remain teach-mode targets) · login/auth · analytics/history · Firefox/Edge · keyboard shortcuts · CSV import · price/discount/rating filters

---

## Feature Workflow

Non-trivial changes go through a role-based workflow defined in `.claude/`:

- `/po` — Product Owner: writes per-feature PRD under `docs/superpowers/specs/<slug>-prd.md`
- `/vp-eng` — VP Engineering: writes tech spec, runs principles audit
- `/tl` — Tech Lead: writes plan + test plan, executes via TDD
- `/qa` — QA: validates against acceptance criteria
- `/feature` — Delivery Lead: orchestrates all four with approval gates

Strictness scales with change size (Trivial / Small / Large). Trivial changes (selector tweaks, copy changes) skip the workflow.

---

## Common Pitfalls

| Symptom                               | Cause                                                                                                         | Fix                                                                                             |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| "No profiles yet" in popup            | Storage cleared or first-run didn't complete                                                                  | Clear extension storage, reload                                                                 |
| 0 brands applied, no errors           | Wrong CSS selectors                                                                                           | Verify selectors in DevTools                                                                    |
| Filters applied twice                 | Session flag cleared unexpectedly                                                                             | Check `background.ts` reapply handler                                                           |
| ESLint fails with "no config found"   | Created `.eslintrc.json` by accident                                                                          | Delete it; only `eslint.config.js` is used                                                      |
| TS error importing JSON               | `resolveJsonModule` missing                                                                                   | Ensure `tsconfig.json` has it                                                                   |
| StatusBar always shows "just now"     | Stored `true` instead of `Date.now()`                                                                         | storage must store `Date.now()`                                                                 |
| Teach mode XSS                        | Used `innerHTML` in toast/overlay                                                                             | Use `textContent` only                                                                          |
| Popover toggles open/closed forever   | `useOutsideClick` ref wrapped only the menu, not the trigger                                                  | Wrap trigger + menu in one root element, pass its ref                                           |
| Ajio opens "Choose Category" modal    | Used unscoped `.cat-facets .facet-more` — matched first facet, not Brands                                     | Scope via `findBrandsFacetHost()` before any query                                              |
| Ajio "clear" leaves brands ticked     | Read tracked values off the modal node (unmounted by React after Apply)                                       | Read `document.body[data-brandfilter-ajio-applied]`                                             |
| Myntra only applies 1–2 brands        | Click-per-checkbox strategy; each click navigates and kills the content script                                | URL-driven: scan canonical names, build `?f=Brand:Name1,Name2,...`, ONE `location.assign()`     |
| Popup loops "Loading…" forever        | Quota error thrown from bootstrap/setConfig; IIFE swallowed the rejection                                     | `chrome.storage.local`; `initPopupState` returns `{ok:false, error}` instead of throwing        |
| Auto-apply infinite loop on Myntra    | Session flag stamped AFTER sendMessage; Myntra's per-click navigation fired onUpdated → re-fired apply → loop | Stamp BEFORE; content scripts ACK synchronously (`sendResponse({ok:true})` before doing work)   |
| Edited a system profile, lost changes | System profiles are reshaped by `syncSystemProfiles` on wake                                                  | Duplicate the profile first (`isSystem` copy is editable); never edit a locked profile in place |
