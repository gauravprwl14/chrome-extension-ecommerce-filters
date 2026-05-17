# BrandFilter — Architecture & Workflows

**Last updated:** 2026-05-17 (post URL-driven Myntra + orchestration extraction)

---

## Component Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Chrome Extension                              │
│                                                                         │
│  ┌──────────────────┐    ┌──────────────────────────────────────────┐   │
│  │     popup.tsx    │    │              background.ts                │   │
│  │   (React popup)  │    │           (MV3 Service Worker)            │   │
│  │                  │    │                                          │   │
│  │ initPopupState   │    │  on SW wake       → bootstrapConfig()    │   │
│  │ (lib/popup-init) │    │  on onInstalled   → bootstrapConfig()    │   │
│  │                  │    │  on onStartup     → bootstrapConfig()    │   │
│  │ ProfileDropdown  │    │  on tabs.onUpdated → handleAutoApply()   │   │
│  │ BrandMultiSelect │    │  on runtime.onMessage(reapply/turnOff)   │   │
│  │ StatusBar        │    │                                          │   │
│  │                  │    │  All decision logic lives in lib/        │   │
│  │ sendMessage:     │    │  background.ts is a thin shell           │   │
│  │  ↕ reapply       │    │                                          │   │
│  │  ↕ turnOff       │    │  Deps injected:                          │   │
│  └──────────────────┘    │   getConfig, setConfig,                  │   │
│         │                │   getTabSessionState, ...,               │   │
│         │ sendMessage    │   chrome.tabs.sendMessage                │   │
│         ▼                └──────────────────────────────────────────┘   │
│                                          │                              │
│  ┌──────────────────┐                    │ sendMessage                  │
│  │   options.tsx    │                    ▼                              │
│  │                  │  ┌────────────────────────────────────────────┐   │
│  │ 4 tabs:          │  │            Content Scripts                  │   │
│  │  Master Brands   │  │                                            │   │
│  │  Profiles        │  │  contents/myntra.ts    contents/ajio.ts    │   │
│  │  Sites           │  │  ─────────────────    ─────────────────    │   │
│  │  Export/Import   │  │  ACK synchronously    ACK synchronously    │   │
│  └──────────────────┘  │     ↓                    ↓                 │   │
│                        │  handleApply async    handleApply async    │   │
│                        │     ↓                    ↓                 │   │
│                        │  MyntraAdapter        AjioAdapter          │   │
│                        │  (URL-driven)         (modal-batched)      │   │
│                        │                                            │   │
│                        │  contents/teachable.ts                     │   │
│                        │  (dormant; activates on startTeach msg)    │   │
│                        └────────────────────────────────────────────┘   │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                      Shared Libraries (lib/)                      │   │
│  │                                                                  │   │
│  │  ── Pure orchestration (testable in isolation) ─────────────     │   │
│  │  seed.ts          bootstrapConfig + WATCHES_PROFILE +            │   │
│  │                   DEPRECATED_BRAND_IDS + mergeSeedsIntoConfig    │   │
│  │  auto-apply.ts    handleAutoApply + handleReapply +              │   │
│  │                   handleTurnOff  (session-flag-before-send rule) │   │
│  │  popup-init.ts    initPopupState  (returns {ok,error}, never     │   │
│  │                                    throws — popup-loop guard)    │   │
│  │                                                                  │   │
│  │  ── Foundation ─────────────────────────────────────────────     │   │
│  │  config.ts        Brand, Profile, Site, Config interfaces        │   │
│  │  storage.ts       chrome.storage.local + sync→local migration    │   │
│  │  matching.ts      matchesBrand (exact / string / regex variants) │   │
│  │  adapters/base.ts SiteAdapter interface + waitForElement +       │   │
│  │                   pollForElement + sleep                         │   │
│  │  adapters/myntra.ts   URL-driven                                 │   │
│  │  adapters/ajio.ts     modal-batched, brands-facet scoped         │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                            Storage                               │   │
│  │                                                                  │   │
│  │  chrome.storage.local   → key 'brandfilter_config' (Config)      │   │
│  │                            5 MB quota; current use ~10.5 KB      │   │
│  │  chrome.storage.session → key 'applied_{tabId}'                  │   │
│  │                            number | 'user-off' | absent          │   │
│  │                            cleared on browser close              │   │
│  │  chrome.storage.sync    → ONLY read once at upgrade time, then   │   │
│  │                            data migrated to local. NEVER written.│   │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

### Why `lib/` exists in its current shape

Background scripts and content scripts are tied to chrome APIs that
mutate global state on registration. Pulling decision logic out into
**pure async functions that take their chrome calls as deps** is what
lets us:

- Unit-test the rules (e.g. "stamp session before sendMessage") in
  isolation.
- Catch ordering bugs (`tests/auto-apply.test.ts` proves the regression).
- Keep `background.ts` short enough that a reviewer can audit it.

The same pattern applies to popup: `popup.tsx` is React + JSX (hard to
test in Vitest without a JSX plugin), but `lib/popup-init.ts` is plain
TypeScript that the test suite fully covers.

---

## Message Passing

Three message channels. All payloads typed via `ExtensionMessage` union
in `lib/config.ts`.

### 1. Background → Content Script

```typescript
// Auto-apply or manual re-apply
{ action: 'applyProfile', profileId: string }

// User clicked "Off" — clear applied filters
{ action: 'clearFilters' }

// Teach mode activation (taught sites only)
{ action: 'startTeach' }
```

**Content scripts ACK synchronously.** Both `contents/myntra.ts` and
`contents/ajio.ts` call `sendResponse({ok: true})` _before_ starting
adapter work. This is non-negotiable — see CLAUDE.md rule #4.

### 2. Popup → Background

```typescript
// Manual re-apply (popup's Apply button)
{ action: 'reapply', tabId: number, profileId: string }

// User clicked "Off"
{ action: 'turnOff', tabId: number }
```

Both handled by `handleReapply` / `handleTurnOff` in `lib/auto-apply.ts`.

### 3. Teach-mode Content Script → Background

```typescript
// After user confirms a selector
{ action: 'saveCustomSite', hostname: string, customSelector: string, defaultProfileId: string }
```

---

## Data Flow: Config Updates

```
User action (popup / options)
         │
         ▼
setConfig(updatedConfig)                  ← lib/storage.ts
         │
         ▼
chrome.storage.local.set(...)             ← persisted
         │
         │  next read by popup / options / content script
         ▼
getConfig()                               ← lib/storage.ts
         │  - local has data → return it
         │  - local empty + sync has legacy data → migrate
         │  - both empty → return structuredClone(DEFAULT_CONFIG)
         ▼
React state update                        ← re-renders UI
```

---

## Data Flow: Auto-Apply Decision Tree

```
chrome.tabs.onUpdated(tabId, changeInfo, tab)
         │
         ▼
status === 'loading'?  ───── no ──────→ return
         │ yes
         ▼
parse URL → hostname
         │
         ▼
handleAutoApply(tabId, hostname, deps)            ← lib/auto-apply.ts
         │
         ▼
config = await deps.getConfig()
site = config.sites.find(hostname match)
         │
         ▼
site present? enabled? has defaultProfileId? ──── no → outcome: 'no-matching-site' | 'site-disabled' | 'no-default-profile'
         │ yes
         ▼
sessionState = await deps.getTabSession(tabId)
sessionState === null?  ───── no → outcome: 'session-blocks'   ← THIS is what saves us from loops
         │ yes
         ▼
deps.setTabSession(tabId, deps.now())             ← STAMP FIRST (rule #3 in CLAUDE.md)
         │
         ▼
try {
  await deps.sendToTab(tabId, {action: 'applyProfile', profileId})
  outcome: 'applied'
} catch {
  await deps.clearTabSession(tabId)               ← retry-friendly on transient failures
  outcome: 'apply-failed'
}
```

---

## Brand Matching Algorithm

`matchesBrand(brand: Brand, labelText: string): boolean` in
`lib/matching.ts`.

```
input: brand (Brand), labels (string[])

1. normalizeLabel(text) = text.toLowerCase().replace(/\s+/g, ' ').trim()

2. For each label in labels:
   a. Try exact match: normalizeLabel(label) === normalizeLabel(brand.name)
   b. Try each string variant:
      normalizeLabel(label).includes(normalizeLabel(variant.value))
   c. Try each regex variant:
      new RegExp(variant.value, 'i').test(label)
      (invalid regex → skip silently)
   d. First match → return true

3. No match → return false (brand added to notFound list)
```

**Example:** `{ name: "H&M", variants: [{ type: "string", value: "H & M" }, { type: "string", value: "H and M" }] }`

| Label on page       | Match step                           | Result |
| ------------------- | ------------------------------------ | ------ |
| `"H&M"`             | 2a exact                             | ✅     |
| `"H & M"`           | 2b string variant (contains "h & m") | ✅     |
| `"H and M Fashion"` | 2a fails; 2b contains "h and m"      | ✅     |
| `"HM"`              | none                                 | ❌     |

---

## Session State Machine

```
┌────────────────┐ chrome.tabs.onUpdated   ┌─────────────────┐
│ Tab fresh load │ ─────fresh→──────────→  │ session = null  │
│ session=absent │                          │ → handleAutoApply
└────────────────┘                          │ → setSession    │
                                            │   = Date.now()  │
                                            └────┬────────────┘
                                                 │
                              ┌──────────────────┴──────────────────┐
                              │ adapter applies brands → navigates  │
                              │ chrome.tabs.onUpdated fires again   │
                              │ session is number → SKIP            │
                              └──────────────────┬──────────────────┘
                                                 │
                              ┌──────────────────┴──────────────────┐
                              │           User clicks ▶ Apply        │
                              │  handleReapply: setSession=now()    │
                              │  (NOT clearSession first — the new   │
                              │   stamp covers both stale + fresh)   │
                              └──────────────────┬──────────────────┘
                                                 │
                              ┌──────────────────┴──────────────────┐
                              │           User clicks ✕ Off           │
                              │  handleTurnOff: setSession='user-off' │
                              │  Auto-apply blocked for the rest of   │
                              │  the tab's life. Even after clearing  │
                              │  it manually, 'user-off' persists.    │
                              └──────────────────┬──────────────────┘
                                                 │
                              ┌──────────────────┴──────────────────┐
                              │  Tab closed / browser closed         │
                              │  chrome.storage.session auto-clears  │
                              │  Next visit: fresh state             │
                              └──────────────────────────────────────┘
```

---

## Adapter Pattern

Each supported site implements `SiteAdapter` (`lib/adapters/base.ts`):

```typescript
interface SiteAdapter {
  hostname: string
  isFilterPage(): boolean
  expandBrandFilter(): Promise<void>
  waitForFilterContainer(timeoutMs?: number): Promise<void>
  applyBrands(brands: Brand[]): Promise<ApplyResult>
  clearAppliedBrands(): Promise<void>
}

interface ApplyResult {
  applied: string[] // brand ids successfully landed
  skipped: string[] // brand ids already checked
  notFound: string[] // brand ids with no match on the page
}
```

The contract is the same. The **strategy** differs:

| Adapter          | Strategy                                             | When to use                                                   |
| ---------------- | ---------------------------------------------------- | ------------------------------------------------------------- |
| `MyntraAdapter`  | URL-driven (build target URL, one `location.assign`) | Site navigates per click; URL grammar is reverse-engineerable |
| `AjioAdapter`    | Modal-batched (tick in modal, click Apply once)      | Site has a modal with a commit button that batches selections |
| (future) generic | Click-and-poll                                       | Site clicks are local DOM mutations only; modal-less          |

Custom (taught) sites use a generic adapter built from
`Site.customSelector` — same interface, different DOM queries.

### Adding a new built-in adapter

See `docs/KT.md` § 10 for the full checklist. Summary:

1. `lib/adapters/newsite.ts` implementing `SiteAdapter`
2. `contents/newsite.ts` Plasmo content script (ACK-first listener)
3. Site entry in `DEFAULT_CONFIG.sites` in `lib/config.ts`
4. Host entry in `package.json` `manifest.host_permissions`
5. Adapter tests in `tests/newsite-adapter.test.ts`

---

## File Dependency Graph

```
                              lib/config.ts
                                    ▲
       ┌──────────────────────┬─────┴──────┬───────────────────┐
       │                      │            │                   │
 lib/storage.ts        lib/matching.ts  lib/seed.ts      lib/adapters/base.ts
       ▲                                                       ▲
       │                                       ┌───────────────┴──────────────┐
       │                                       │                              │
       │                              lib/adapters/myntra.ts          lib/adapters/ajio.ts
       │                                       ▲                              ▲
       ├────────────────────────┐              │                              │
       │                        │              │                              │
 lib/popup-init.ts        lib/auto-apply.ts    │                              │
       ▲                        ▲              │                              │
       │                        │              │                              │
       │                  background.ts ─────  │ (sendMessage)  ─────────────┘
       │                                       │                              │
   popup.tsx                          contents/myntra.ts          contents/ajio.ts
                                      contents/teachable.ts (taught sites)
```

Plus `options.tsx` depends on `lib/storage.ts`, `lib/config.ts`, and
several React components in `components/`.

---

## Build & Deploy Pipeline

```
pnpm build
   │
   ▼
plasmo build
   │   - transpiles TypeScript
   │   - bundles popup, options, content scripts, background
   │   - emits MV3 manifest from package.json "manifest" key
   │   - tree-shakes
   ▼
build/chrome-mv3-prod/    ← unpacked extension
   │
   ▼
pnpm package
   │
   ▼
build/chrome-mv3-prod.zip  ← Chrome Web Store upload artifact
```

There is no Husky / CI pipeline configured in this repo as of v1.1.
The recommended pre-commit gate is the trio:

```bash
pnpm test && pnpm typecheck && pnpm lint
```

Run this before every commit.
