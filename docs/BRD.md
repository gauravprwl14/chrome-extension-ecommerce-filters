# BrandFilter — Business Requirements Document (BRD)

**Version:** 1.1
**Date:** 2026-05-17
**Status:** Active (V0)
**Supersedes:** v1.0 (2026-05-16)

> v1.1 changes: BR-002 retired (cross-device sync proved infeasible
> within the 8 KB sync-per-item quota); BR-004 amended (host_permissions
> tightened from `<all_urls>` to a curated allowlist); FR list refreshed
> against shipped behaviour; new NFRs for apply-loop prevention,
> storage-error visibility, and quota tripwire tests.

---

## 1. Business Context

BrandFilter is a personal productivity Chrome extension targeting Indian
fashion e-commerce shoppers. The project is in R&D / V0 phase. There is
no commercial model in V0 — the goal is a working extension that solves
a real personal pain point, with potential to publish on the Chrome Web
Store.

---

## 2. Stakeholders

| Role                      | Person                               | Interest                         |
| ------------------------- | ------------------------------------ | -------------------------------- |
| Product Owner / Developer | Gaurav Porwal                        | Build and maintain the extension |
| Primary User              | Power shoppers (Myntra/Ajio)         | Zero-effort brand filtering      |
| Secondary Users           | Any Chrome user on allowlisted hosts | Same, via Teach Mode             |

---

## 3. Business Requirements

### BR-001: No Backend Dependency

The extension must operate entirely within the browser. No server, no
API calls, no account registration. Rationale: privacy, simplicity, no
operational cost.

### BR-002: ~~Cross-Device Config Sync~~ **RETIRED in v1.1**

The original requirement was for `chrome.storage.sync` to propagate
config across the user's Chrome installs. **Abandoned** because:

- `chrome.storage.sync.QUOTA_BYTES_PER_ITEM = 8192`.
- The 183-brand seed + "My Brands" profile + sites encode to ~10.5 KB.
- Chunking the data into multiple sync items would have required a
  substantial complexity tax (consistent reads, merge logic, partial-
  failure handling) for a benefit (cross-device sync) that is not
  critical for V0.

**Replacement:** Use `chrome.storage.local` (5 MB quota) per-browser,
plus the **Export / Import** feature (BR-003) for manual cross-device
migration. A one-time `sync → local` migration in `getConfig()`
preserves data from pre-v1.1 installs.

### BR-003: Exportable Data

Users must be able to export their full configuration as a JSON file and
import it on another browser. Prevents vendor lock-in **and** serves as
the manual replacement for retired BR-002.

### BR-004: Chrome Web Store Compliant

The extension must be publishable on the Chrome Web Store:

- Manifest V3 (required by Google from 2024)
- No remote code execution
- **Tightened host_permissions** (v1.1) — narrowed from `<all_urls>` to
  a curated allowlist: Myntra, Ajio, TataCliq, Flipkart, Amazon.in,
  Nykaa Fashion, Snapdeal. Minimises permission surface for users and
  speeds up Chrome Web Store review.
- Declared permissions only: `storage`, `tabs`.
- Privacy policy required if published.

### BR-005: Extensible to New Sites

Users must be able to teach the extension to work on any allowlisted
e-commerce site with checkbox-style brand filters, without requiring a
code update. Implementation: Teach Mode with custom CSS selector
storage.

### BR-006 (new in v1.1): Apply-Loop Immunity

The extension must NEVER fall into an apply-loop where the URL
oscillates between brand combinations and the page never settles. This
is the single most user-visible failure mode and was the cause of two
P0 bug reports during V0 development.

**Implementation:**

- Session flag is stamped BEFORE `chrome.tabs.sendMessage` in
  `lib/auto-apply.ts`.
- Myntra adapter is URL-driven: one navigation per apply, not N.
- Content scripts ACK messages synchronously so the message channel
  survives the adapter's own navigation.

**Validation:** `tests/auto-apply.test.ts` includes a regression that
times out (5 s) when the session-flag ordering is reversed.

### BR-007 (new in v1.1): No Silent UI Failures

The extension UI must surface storage / runtime errors instead of
hanging on a placeholder. The original "Loading…" trap (popup IIFE
swallowed a quota-exceeded rejection) is now prevented at the function
contract level: `initPopupState` returns `{ok: false, error}` and never
throws.

---

## 4. Functional Requirements

| ID           | Requirement                                                      | Priority    | Status                                             |
| ------------ | ---------------------------------------------------------------- | ----------- | -------------------------------------------------- |
| FR-001       | Auto-apply brand filters on Myntra listing pages                 | Must Have   | ✅ shipped (URL-driven)                            |
| FR-002       | Auto-apply brand filters on Ajio listing pages                   | Must Have   | ✅ shipped (modal-batched, brands-facet scoped)    |
| FR-003       | Support named brand profiles (multiple)                          | Must Have   | ✅ shipped                                         |
| FR-004       | One-click profile switching in popup                             | Must Have   | ✅ shipped                                         |
| FR-005       | Brand search and multi-select in popup                           | Must Have   | ✅ shipped                                         |
| FR-006       | "Apply" button for manual re-apply                               | Must Have   | ✅ shipped                                         |
| FR-007       | "Off" button to disable for current tab                          | Must Have   | ✅ shipped                                         |
| FR-008       | First-run seeding with **183** default brands (was 60 in v1.0)   | Must Have   | ✅ shipped                                         |
| FR-009       | Options page: Master Brands management                           | Must Have   | ✅ shipped                                         |
| FR-010       | Options page: Profile management                                 | Must Have   | ✅ shipped                                         |
| FR-011       | Options page: Site management + toggle                           | Must Have   | ✅ shipped                                         |
| FR-012       | Options page: Export/Import config JSON                          | Must Have   | ✅ shipped                                         |
| FR-013       | Teach Mode for allowlisted sites                                 | Should Have | ✅ shipped (allowlist tightened from `<all_urls>`) |
| FR-014       | Brand name variants (string + regex)                             | Should Have | ✅ shipped                                         |
| FR-015       | Status bar showing "Applied X min ago"                           | Should Have | ✅ shipped                                         |
| FR-016       | Popup shows "Open Settings" when no profiles                     | Must Have   | ✅ shipped                                         |
| FR-017 (new) | Curated "Watches" profile with 21 watch brands                   | Should Have | ✅ shipped                                         |
| FR-018 (new) | Seed-brand deprecation mechanism (`DEPRECATED_BRAND_IDS`)        | Must Have   | ✅ shipped                                         |
| FR-019 (new) | New seed brands auto-propagate into existing "My Brands" profile | Should Have | ✅ shipped                                         |
| FR-020 (new) | Popup surfaces init errors instead of hanging on "Loading…"      | Must Have   | ✅ shipped                                         |
| FR-021 (new) | `sync → local` storage migration on first read post-upgrade      | Must Have   | ✅ shipped                                         |

---

## 5. Non-Functional Requirements

| ID            | Requirement                 | Target                                                                                                                           |
| ------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| NFR-001       | Filter apply latency        | <2 s after filter panel visible; single navigation total                                                                         |
| NFR-002       | Storage footprint           | <5 MB (chrome.storage.local quota). Current seed is ~10.5 KB.                                                                    |
| NFR-003       | Extension bundle size       | <500 KB zipped                                                                                                                   |
| NFR-004       | Browser support             | Chrome 114+ (MV3)                                                                                                                |
| NFR-005       | TypeScript strict mode      | `"strict": true`, `"noUncheckedIndexedAccess": true`                                                                             |
| NFR-006       | Test coverage               | All adapter methods + storage helpers + matching algorithm + orchestration + seed migration. Current: 169 tests across 12 files. |
| NFR-007       | XSS prevention              | No `innerHTML` with user/page-provided strings. Toast uses `textContent` only.                                                   |
| NFR-008 (new) | Auto-apply re-entry         | Exactly ONE auto-apply per tab per page-load. Stamped session flag before sendMessage.                                           |
| NFR-009 (new) | Test-time quota enforcement | `tests/setup.ts` mocks enforce real `chrome.storage` quotas; tests fail when payload exceeds limits.                             |
| NFR-010 (new) | Test-suite runtime          | <10 s for full `pnpm test`. Current: ~5 s.                                                                                       |
| NFR-011 (new) | Content-script ACK latency  | `sendResponse` called synchronously; `sendMessage` resolves in <1 ms regardless of adapter work duration.                        |

---

## 6. Constraints

1. **Plasmo v0.90.5** — build system locked to this version. Do not
   upgrade without testing.
2. **Chrome MV3** — no persistent background pages; service workers
   only. No DOM access in background.
3. **`chrome.storage.local` 5 MB limit** — comfortable headroom; growth
   is monitored by `tests/storage-quota.test.ts`.
4. **`chrome.storage.sync` 8 KB per-item limit** — never use for the
   main config. Tripwire test prevents accidental switch.
5. **No dynamic code** — Chrome Web Store rejects extensions that
   `eval()` or fetch+execute remote scripts.
6. **MutationObserver timeout 8 s** — hard limit before giving up on
   filter panel detection.
7. **Ajio accordion wait 300 ms** — minimum delay after clicking the
   brands-facet header before checkboxes render.
8. **Session flag MUST be stamped BEFORE `chrome.tabs.sendMessage`** —
   reversed order breaks the apply-loop guarantee (NFR-008).
9. **Content scripts MUST ACK messages synchronously** — otherwise the
   adapter's navigation kills the channel.
10. **Every Ajio DOM query MUST be scoped to `findBrandsFacetHost()`** —
    a bare `.cat-facets X` selector returns the first match in
    document order, which is Category, not Brands.

---

## 7. Assumptions

1. Myntra and Ajio use stable-enough CSS class names that selectors
   remain valid for months (class names are confirmed via DevTools
   inspection, not scraped).
2. Myntra's URL grammar (`?f=Brand:X,Y::Price:Z`) is stable. Re-verified
   2026-05-17.
3. Users are on Chrome 114+ (released May 2023) — MV3 service workers
   are stable from this version.

---

## 8. Risks

| Risk                                           | Likelihood | Impact       | Mitigation                                                                                                              |
| ---------------------------------------------- | ---------- | ------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Myntra/Ajio update CSS class names             | Medium     | High         | Selectors are static class constants in one file each; Teach Mode provides self-service fix                             |
| Myntra changes its URL filter grammar          | Low        | High         | `parseBrandsFromUrl` + `buildUrlWithBrands` are unit-tested; failures surface in `tests/integration/apply-flow.test.ts` |
| `chrome.storage.local` quota exceeded          | Very Low   | Medium       | At 10.5 KB / 5 MB we are at 0.2 %. Monitored by `tests/storage-quota.test.ts`.                                          |
| Plasmo breaking change                         | Low        | Medium       | Pin version, upgrade intentionally                                                                                      |
| Chrome MV3 API changes                         | Low        | High         | Follow Chrome extension developer blog                                                                                  |
| Teach mode infers wrong selector               | Medium     | Low          | User confirmation step before saving                                                                                    |
| Apply-loop regression introduced               | Low        | **Critical** | NFR-008; regression test (`tests/auto-apply.test.ts`) times out if order is reversed                                    |
| Wrong Ajio facet targeted on a new page layout | Low        | High         | All queries scoped to `findBrandsFacetHost()`; safety check dismisses wrong-modal opens                                 |

---

## 9. Decommissioning / Sunset Plan

If the extension needs to be retired (e.g. Chrome MV4 deprecates an
API we rely on):

1. Publish a final update that uses `chrome.runtime.onUpdateAvailable`
   to surface a "this extension has been discontinued" banner in the
   popup.
2. Ensure `Export/Import` (BR-003) still works — users can take their
   data with them.
3. Unpublish from Chrome Web Store with a sunset date in the listing
   description.
4. No server-side action required (no backend).
