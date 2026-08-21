# BrandFilter — Product Requirements Document (PRD)

**Version:** 1.1
**Date:** 2026-05-17
**Author:** Gaurav Porwal
**Status:** Active (V0)
**Supersedes:** v1.0 (2026-05-16)

> v1.1 changes: storage backend documented as `chrome.storage.local`
> (sync was abandoned due to per-item quota); brand count updated to 183;
> Watches curated profile added; Myntra adapter switched to URL-driven;
> popup error-surfacing requirement added; brand-deprecation mechanism
> documented.

---

## 1. Problem Statement

Users shopping on Myntra and Ajio must manually re-select their preferred
brand filters (e.g. Tommy Hilfiger, H&M, Levi's) on every page visit,
every session. This is repetitive, friction-heavy, and subtly trains
users to avoid deep filter exploration.

**Root cause:** E-commerce filter state is ephemeral — stored in URL
query params or React state, cleared on navigation.

---

## 2. Target Users

**Primary:** Fashion-conscious online shoppers who have a fixed set of
preferred brands and visit Myntra/Ajio regularly (2–5×/week).

**Secondary:** Power users who want the same capability on other
e-commerce sites (TataCliq, Flipkart, Amazon.in, Nykaa Fashion,
Snapdeal) — served by Teach Mode on a curated allowlist of hosts.

**Anti-target:** Casual browsers who like discovering new brands — the
extension's auto-apply would interfere with their exploration.

---

## 3. Goals

| Goal                                  | Metric                                                                                                               |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Zero-effort brand filtering           | Filters auto-apply within 2 s of landing on a listing page; popular profiles (≤25 brands) land in **ONE** navigation |
| User always in control                | One click to override profile or turn off                                                                            |
| Works on Myntra + Ajio out of the box | 100 % of standard listing pages with the brands sidebar present                                                      |
| Extensible to any site                | Teach mode covers any allowlisted host with checkbox filters                                                         |
| No backend required                   | All data in `chrome.storage.local` — works offline, no auth                                                          |
| Failures must be visible              | Storage/runtime errors surface in the popup as an error state (never an infinite "Loading…")                         |
| No infinite apply loops               | URL-driven adapter + session-flag-before-sendMessage guarantee at most ONE auto-apply per page-load per tab          |

---

## 4. Non-Goals (V0)

- Cross-device sync (was a v1.0 goal; abandoned — `chrome.storage.sync`'s
  8 KB per-item quota cannot hold our 10.5 KB seed)
- Amazon Fashion / Nykaa Fashion / Flipkart **native** support (V1+) —
  available via Teach Mode in V0
- Price, discount, rating filter automation
- Firefox / Edge / Safari support
- Usage analytics or filter history
- Keyboard shortcuts
- CSV brand import
- Login or authentication

---

## 5. Core Features

### 5.1 Auto-Apply on Page Load

The extension detects supported e-commerce listing pages and applies the
user's preferred brand filters by **navigating** the tab to the
filter-bearing URL (Myntra) or **submitting the modal's Apply button**
(Ajio). Per-checkbox clicking is explicitly NOT a strategy — it triggers
mid-flight navigations and only lands 1–2 brands.

**Acceptance criteria:**

- For a profile of N brands, exactly ONE navigation occurs.
- Filters are visible within 2 s of the filter container being present.
- Already-checked brands are skipped (idempotent).
- Brands not found on the page are silently dropped to `notFound`.
- Auto-apply does NOT re-fire after the user has interacted with filters
  (`applied_{tabId}` session flag = number, blocks re-entry).
- Auto-apply does NOT re-fire from the adapter's own navigation
  (session flag is stamped BEFORE `sendMessage`, not after — see
  `tests/auto-apply.test.ts`).
- Works on dynamically-rendered filter panels (`waitForElement` /
  `pollForElement` with 8 s timeout).

### 5.2 Profiles

Users can define named brand collections (e.g. "My Brands", "Watches",
"Office wear") and switch between them.

**Acceptance criteria:**

- Multiple profiles supported (no upper limit beyond storage budget).
- Each site has one "default" profile that auto-applies on load.
- Profiles can be switched via popup dropdown in one click.
- Edits to a profile's brand list auto-save (no save button).
- A brand can belong to multiple profiles.

**Seeded profiles on fresh install:**

| Id          | Name      | Icon | Brand count             |
| ----------- | --------- | ---- | ----------------------- |
| `my-brands` | My Brands | 🛍    | 183 (every seed brand)  |
| `watches`   | Watches   | ⌚   | 21 curated watch brands |

### 5.3 Master Brand Library

All brands are defined once in a master library and referenced by profiles.

**Acceptance criteria:**

- **183 pre-seeded brands** on first install (men's casual, men's
  formal, sportswear, premium, watches, popular women's brands).
- Add new brands from the popup search ("+ Add" appears when search
  returns no results).
- Add new brands from Options → Master Brands tab.
- New brands are auto-promoted to `masterBrands` AND auto-added to the
  current profile.
- Brand ids are URL-safe slugs generated from name; duplicates rejected.
- Empty-after-slug names rejected (prevents `''` ids from `'???'`).
- Brands can be deleted from Master Brands tab — removed from
  `masterBrands` AND from every profile's `brandIds`.

### 5.4 Brand Deprecation (developer-facing)

Brands shipped in earlier versions can be retired without leaving stale
entries in users' storage.

**Acceptance criteria:**

- `DEPRECATED_BRAND_IDS` in `lib/seed.ts` is the source of truth.
- On every SW wake, the migration removes those ids from `masterBrands`
  and from every profile's `brandIds`.
- A stale `assets/default-brands.json` containing a deprecated id does
  NOT re-introduce the brand — the deprecation check runs after the
  add-missing step.
- Idempotent: a second migration pass with no new deprecations is a
  no-op.

### 5.5 New Seed Brand Propagation

When the extension ships with a new default brand, existing installs
should pick it up without requiring the user to manually re-add it.

**Acceptance criteria:**

- A new brand added to `assets/default-brands.json` appears in
  `masterBrands` AND in the existing "My Brands" profile on the next
  SW wake.
- Other (curated) profiles are NOT modified — only the named default
  profile receives propagation.
- If the user has previously trimmed a brand out of "My Brands", a
  subsequent migration will NOT re-add it (the propagation check uses
  `masterBrands` membership as the "newly-added" signal).

### 5.6 Popup Controls

A compact popup (280×var px) gives immediate control without leaving
the page.

**Acceptance criteria:**

- Profile dropdown to switch profiles.
- Searchable brand multi-select to tweak the current profile in place.
- ▶ Apply / Re-apply button to push the current profile to the page.
- ✕ Off button to clear our applied brands and block auto-apply for
  the remainder of the tab session.
- Status indicator showing applied / not applied / off / unsupported.
- "Open Settings" call-to-action when no profiles or no matching site.
- **Visible error state** when popup init fails (storage error, no
  active tab, etc.) — must NOT hang on "Loading…".

### 5.7 Options Page

Full configuration UI accessible from the popup or `chrome://extensions`.

**Acceptance criteria:**

- 4 tabs: Master Brands · Profiles · Sites · Export/Import.
- Master Brands: searchable table with "Used in profiles" column.
- Profiles: card grid with icon + name + brand pills.
- Sites: list with enabled toggle and default-profile dropdown.
- Export/Import: JSON download/upload of the full Config.

### 5.8 Teach Mode

Users can extend the extension to work on allowlisted hosts beyond
Myntra/Ajio.

**Acceptance criteria:**

- Allowlist (in `package.json` manifest.host_permissions):
  `*.tatacliq.com`, `*.flipkart.com`, `*.amazon.in`,
  `*.nykaafashion.com`, `*.snapdeal.com`. Tightened from
  `<all_urls>` to minimise injection surface.
- Popup shows "Teach this site" on unrecognised hostnames that ARE on
  the allowlist.
- Teach mode UI: crosshair cursor, blue overlay.
- Click a brand element → walk up to 5 ancestors → infer a CSS
  selector.
- Confirmation toast shows inferred selector — user confirms or retries.
- Confirmed selector saved to `Site.customSelector`.
- Toast uses `element.textContent` only (NEVER `innerHTML`) — the
  selector is ultimately page-provided and must not be parsed as HTML.

### 5.9 First-Run Onboarding

**Acceptance criteria:**

- On install (`chrome.runtime.onInstalled` with `reason === 'install'`):
  seed 183 brands, create "My Brands" profile with every seed brand
  id, create "Watches" curated profile, set "My Brands" as default
  for Myntra + Ajio.
- Options page auto-opens in a new tab.
- Bootstrap is **also** called at SW module load and on `onStartup`,
  so a manual reload of the extension during dev does not leave the
  user without seed data.
- Banner visible when no profiles exist (defence in depth for failure
  cases).
- Under 2 minutes from install to first filter auto-apply on Myntra.

### 5.10 Storage Resilience

**Acceptance criteria:**

- Storage backend is `chrome.storage.local` (5 MB total quota).
- One-time migration from `chrome.storage.sync` to local on first read
  after upgrade (preserves data from pre-v1.1 installs).
- Test tripwire (`tests/storage-quota.test.ts`) asserts the realistic
  config (a) fits in local with massive headroom and (b) would exceed
  sync's 8 KB per-item quota.
- `getConfig()` returns `DEFAULT_CONFIG` clone when both local and
  sync are empty; never throws.

---

## 6. UX Principles

1. **Zero friction by default** — auto-apply requires no configuration
   after first setup.
2. **User always wins** — explicit user actions (Apply, Off) always
   override auto-apply.
3. **Silent failures for brand matching** — brands not found on a page
   are skipped silently; no errors shown to user.
4. **Visible failures for storage / runtime** — popup must surface
   storage errors so the user knows to e.g. clear storage if local is
   somehow corrupted. The "Loading…" state must not be a terminal
   state.
5. **No data leaves the browser** — all storage in
   `chrome.storage.local`. No network calls except the user's own
   browsing.

---

## 7. Success Criteria (V0 Launch)

- Auto-apply works on Myntra listing pages (`/mens-tshirts`,
  `/mens-watches`, etc.) — confirmed CSS selectors, URL grammar
  reverse-engineered.
- Auto-apply works on Ajio `/s/` listing pages — confirmed selectors,
  brands-facet scoping handles multi-facet layouts.
- Popup renders correctly with a default profile pre-selected; surfaces
  errors instead of hanging.
- Profile switching and brand editing work end-to-end.
- Teach mode can successfully teach an allowlisted host.
- **169 / 169** tests pass; full suite runs in <5 s.
- Extension builds to <500 KB (without node_modules).

---

## 8. Out-of-scope behaviours that are intentionally NOT implemented

- **Cross-device sync.** Storage is per-browser. Use Export/Import to
  move between machines.
- **Brand auto-discovery from the page.** We only apply brands the
  user has explicitly chosen.
- **Filter automation beyond brands.** No price slider, discount
  range, colour, size, rating.
- **Auto-apply on category navigation within Myntra (SPA route
  change).** Only top-level navigations (`status: 'loading'`) trigger
  auto-apply. SPA route changes don't, by design — the user is
  exploring sub-categories and would resent re-applies.

---

## 9. Versioning policy

`Config.version` is currently `'1'`. Schema changes that aren't
backwards-compatible must:

1. Bump `Config.version`.
2. Add a migration in `getConfig()` from the old version to the new.
3. Reject Export/Import files with mismatched versions.
4. Document the change in this PRD and in `docs/KT.md` § 6.

---

## Feature index

Each entry below links to a per-feature PRD under `docs/superpowers/specs/`. The PO skill appends new entries here automatically.

<!-- features:start -->

- 2026-05-17 — [User Profiles & Master-Brand Model](superpowers/specs/2026-05-17-user-profiles-and-master-brands-prd.md)

<!-- features:end -->
