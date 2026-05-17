# User Profiles & Master-Brand Model — QA Report

**Slug:** `2026-05-17-user-profiles-and-master-brands`
**Validated against commit:** working tree on top of `c0b2d11` (uncommitted feature diff)
**Date:** 2026-05-17

## Automated gate

- `pnpm typecheck`: **PASS**
- `pnpm lint`: **PASS** (ESLint + Prettier)
- `pnpm test`: **PASS** — 225/225 across 16 files (+16 new vs. pre-feature baseline of 209)

## Acceptance criteria

| AC                                                             | Status              | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1 — `isSystem` schema + seed tagging                         | Met                 | `lib/config.ts` (`isSystem?: boolean`); `lib/seed.ts:114` fresh-install branch tags `my-brands` as system; `:307` curated profile creation sets `isSystem: true`; `migrateToV2` tags legacy profiles. Pinned by `tests/seed.test.ts` "fresh install isSystem tagging" + `migrateToV2` suite (7 cases).                                                                                                                                  |
| AC2 — Create-profile UX (name + emoji + brand select)          | Met                 | `CreateProfileForm` in `options/tabs/ProfilesTab.tsx`; slug + collision via `generateUniqueProfileId`. Tests: `tests/integration/profiles-tab.test.tsx::Create flow` (4 cases).                                                                                                                                                                                                                                                         |
| AC3 — System immutable; confirm-then-clone                     | Met                 | `SystemProfileCard` exposes only Duplicate; `DuplicateConfirmModal` shows Cancel + Create copy; `handleDuplicate` writes clone with `isSystem: false` and `(copy)`-numbered name. Tests: "system profile cards" (5 cases).                                                                                                                                                                                                              |
| AC4 — User profiles editable + delete-with-confirm + auto-save | Met                 | `UserProfileCard` auto-saves on every change; Delete uses `window.confirm`; `options.tsx:64-73` clears `site.defaultProfileId` references when the deleted profile was a default. Tests: "user profile cards" (4 cases including cancel-confirm path).                                                                                                                                                                                  |
| AC5 — Universal brand search + add-to-master                   | Met                 | `BrandPicker` uses `searchBrands` (case-insensitive name + variants); `+ Add "{q}" to master brands` affordance when no exact match. Enter-key picks first result. Tests: `tests/brand-search.test.ts` (9 cases) + integration "brand search + add-to-master" (2 cases).                                                                                                                                                                |
| AC6 — Outside-click dismisses all custom popovers              | Met                 | `useOutsideClick` hook (`lib/use-outside-click.ts`) wired into `ProfileDropdown`, `BrandMultiSelect`, `BrandPicker`, `DuplicateConfirmModal`. SitesTab uses native `<select>` (carved out by AC6). Tests: `tests/use-outside-click.test.tsx` (6 cases).                                                                                                                                                                                 |
| AC7 — Master library is source of truth                        | Met                 | `handleAddBrandFromProfile` (`options.tsx:75-86`) always inserts into `masterBrands` first, then references it from the profile. Deletes from a profile do not remove from master.                                                                                                                                                                                                                                                      |
| AC8 — Upgrade safety; user data sacrosanct                     | Met                 | `mergeSeedsIntoConfig` gates propagation on `defaultProfile.isSystem !== false` (`lib/seed.ts:284`). Clones (created with `isSystem: false`) and user profiles are not mutated by seed-merge. Tests: "isSystem propagation gating" (4 cases).                                                                                                                                                                                           |
| AC9 — v1 → v2 migration                                        | Met                 | `migrateToV2` (`lib/seed.ts`) runs inside `bootstrapConfig` after `mergeSeedsIntoConfig`. Classification rule: name+icon+brand-superset match → `isSystem: true`. Idempotent fast-path. Pinned by `tests/seed.test.ts::migrateToV2` (7 fixtures incl. pristine, trimmed, renamed, icon-only edited, user-created, malformed-v2, already-classified) and `::bootstrapConfig — migration ordering` (post-seed-merge ordering proof).      |
| AC10 — Visual lock differentiation                             | **Met with caveat** | `SystemProfileCard` renders 🔒 with `aria-label="Locked"` (`options/tabs/ProfilesTab.tsx:159`); popup `ProfileDropdown` prefixes 🔒 to system rows. **Caveat:** dropdown uses truthy checks (`selected.isSystem ?`, `profile.isSystem &&`) where ProfilesTab uses strict `=== true`. Functionally equivalent given `boolean \| undefined` type (undefined is falsy → no lock → conservative), but stylistically inconsistent. NIT only. |

## Regressions

None observed. All 209 pre-feature tests still pass; 16 new tests added.

CLAUDE.md "Never break these" cross-check:

- Rule 1 (flat ESLint) — untouched.
- Rule 2 (`resolveJsonModule`) — preserved (`tsconfig.json`).
- Rule 3 (session-flag before sendMessage) — `lib/auto-apply.ts` untouched. `tests/auto-apply.test.ts` still passes.
- Rule 4 (content script sync-ack) — content scripts untouched.
- Rule 5 (Myntra URL-driven) — adapter untouched.
- Rule 6 (Ajio modal-batched / brands-host scoping) — adapter untouched.
- Rule 7 (Ajio accordion 300ms) — untouched.
- Rule 8 (session timestamps not booleans) — untouched.
- Rule 9 (teach-mode textContent only) — untouched.
- Rule 10 (`chrome.storage.local`) — `tests/storage.test.ts` + `tests/storage-quota.test.ts` still green.
- Rule 11 (default profile on first install) — `bootstrapConfig` still creates `my-brands` and assigns it to both built-in sites; now additionally tagged `isSystem: true`. Pinned by SW-init test suite.

## Manual verification — user must run

The following cannot be driven from the test harness. Please run in `pnpm dev` before merging.

1. **Fresh install** — clear extension storage; reload unpacked. Verify Options → Profiles shows "My Brands" + "Watches" with 🔒 icons and a Duplicate button (no Edit/Delete). Open popup on Myntra: dropdown shows both with 🔒 prefix. _(AC1, AC10)_
2. **Create flow** — Options → Profiles → "+ New profile". Submit-disabled with empty name. Type a name, search "tom", tick Tommy Hilfiger, search a brand that doesn't exist, click "+ Add to master", submit. New card appears without lock. _(AC2, AC4, AC5, AC7)_
3. **Duplicate flow** — On "My Brands" card click Duplicate; press Escape → modal closes (no clone). Click Duplicate → Create copy. "My Brands (copy)" appears unlocked. Edit it; original "My Brands" remains intact with original brands. _(AC3, AC4)_
4. **Outside-click dismissal** — Open popup profile dropdown → click on the BrandFilter header → menu closes. Same for popup brand multi-select. In Options → Profiles editor open the brand picker → click elsewhere → menu closes. _(AC6)_
5. **Upgrade simulation** — Install a pre-feature build, trim one brand out of "My Brands", create an "Office wear" profile. Rebuild on this branch, reload. Verify "Office wear" is preserved and editable. Verify trimmed "My Brands" is now **unlocked** (became user profile per AC9). "Watches" (still pristine) remains locked. _(AC8, AC9)_
6. **Delete user profile that was a site default** — Set "Office wear" as Myntra default, then delete it. Confirm prompt fires. Site default falls back to first remaining system profile. _(AC4)_
7. **Import legacy v1 config** — Export from a pre-feature build, then Import on this branch. After import, all profiles show appropriate lock state (pristine system → 🔒; modified → unlocked). _(AC8, AC9, handleImport)_

## Issues found (from independent validator)

- **[NIT]** `components/ProfileDropdown.tsx:49,92` uses truthy `isSystem` checks; ProfilesTab uses strict `=== true`. Functionally identical given the `boolean | undefined` type. Worth normalising for style.
- **[NIT]** Tech-spec "Components / files touched" mentions `lib/storage.ts → getConfig() runs migration` — actual implementation runs migration in `bootstrapConfig` (per the audit revision). PRD/test plan are consistent with implementation; only the techspec wording at one bullet is stale. Behaviour is correct.
- **[NIT]** PRD "Impact" line "Default-profile dropdown gains outside-click dismissal" — implementation kept native `<select>` for SitesTab (AC6 explicitly carves natives out). Not a defect; the PRD line is slightly imprecise.
- **[SHOULD FIX — follow-up, not blocker]** No end-to-end test exercises the `handleImport` path through `setConfig → bootstrapConfig → setConfigState`. The constituent units are tested. Suggested follow-up: a small RTL test that mounts `<Options>` and feeds a v1-shaped JSON via the existing import handler.

## Verdict

**PASS with caveats.** All 10 ACs are functionally met; automated gate is green (225/225). Caveats are stylistic and documentation-drift only — no behavioural defects. Merge-ready pending the 7 manual Chrome verification steps above.

---

## Independent validation

**Validator:** qa-validator (fresh context)
**Validated commit:** `c0b2d11` (uncommitted feature changes on branch `dev`)
**Date:** 2026-05-17

### Automated gate

- `pnpm typecheck`: PASS
- `pnpm lint`: PASS (ESLint + Prettier)
- `pnpm test`: PASS — 225/225 across 16 files

### Acceptance criteria

| AC   | Status          | Evidence                                                                                                                                                                                                                                                                                                |
| ---- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1  | Met             | `lib/seed.ts:114` (fresh-install `isSystem: true`), `:307` (curated profile), ProfilesTab creates with `isSystem: false` (`options/tabs/ProfilesTab.tsx:46,335`); pinned by `tests/seed.test.ts` "fresh install isSystem tagging" + `migrateToV2` suite.                                                |
| AC2  | Met             | `CreateProfileForm` in `options/tabs/ProfilesTab.tsx:306-435`, slug + collision via `generateUniqueProfileId`; covered by `tests/integration/profiles-tab.test.tsx` "Create flow".                                                                                                                      |
| AC3  | Met             | `SystemProfileCard` (`ProfilesTab.tsx:142-209`) shows 🔒, Duplicate button only; `DuplicateConfirmModal` confirms; `handleDuplicate` clones with `isSystem: false`. Tests: "system profile cards" suite.                                                                                                |
| AC4  | Met             | `UserProfileCard` (`ProfilesTab.tsx:219-291`) auto-saves edits, confirm-delete; `options.tsx:64-73` clears `defaultProfileId`. Test: "user profile cards".                                                                                                                                              |
| AC5  | Met             | `BrandPicker` (`options/components/BrandPicker.tsx`) uses `searchBrands` (variants + name) and `+ Add to master brands`; Enter picks first result (`:100-108`). Tests: `tests/brand-search.test.ts`, integration "brand search + add-to-master".                                                        |
| AC6  | Met             | `useOutsideClick` covered by `tests/use-outside-click.test.tsx` (mousedown + Escape + active=false). Wired in `ProfileDropdown.tsx:14`, `BrandMultiSelect.tsx:16`, `BrandPicker.tsx:19`, `DuplicateConfirmModal`. Sites tab uses native `<select>` (`SitesTab.tsx:56`) — explicitly carved out by AC6.  |
| AC7  | Met             | `handleAddBrandFromProfile` in `options.tsx:75-86` always adds to `masterBrands` (dedup by slug) before the profile references it; deletion path (`handleDeleteBrand`) preserves master entries when removing from a profile.                                                                           |
| AC8  | Met             | `mergeSeedsIntoConfig` gates propagation on `defaultProfile.isSystem !== false` (`lib/seed.ts:284`); pinned by `tests/seed.test.ts` "isSystem propagation gating" (3 cases). Curated profile creation does not mutate existing profiles.                                                                |
| AC9  | Met             | `migrateToV2` (`seed.ts:161-197`) idempotent fast-path, classification by name+icon+brand-superset; runs AFTER `mergeSeedsIntoConfig` (`seed.ts:121-135`). Pinned by `tests/seed.test.ts::bootstrapConfig — migration ordering` (asserts `newly-shipped` propagates and `my-brands.isSystem === true`). |
| AC10 | Met with caveat | System card 🔒 in `ProfilesTab.tsx:159`; dropdown 🔒 prefix in `components/ProfileDropdown.tsx:49,92`. **Caveat:** dropdown uses truthy checks where ProfilesTab uses strict `=== true`. Functionally equivalent for `boolean \| undefined`.                                                            |

### Issues found

- [NIT] `components/ProfileDropdown.tsx:49,92` uses truthy checks for `isSystem` while every other consumer uses `=== true`. Safe but stylistically inconsistent.
- [NIT] PRD §"Impact" claims `lib/storage.ts → getConfig() runs migration`. Implementation runs migration only in `bootstrapConfig`. Behaviour correct; PRD wording misleading.
- [NIT] AC6 dismissal for the Sites-tab dropdown is delivered via native `<select>` rather than custom popover. AC6 explicitly carves natives out, so conformant; PRD §"Impact" overstates the change. Not a defect.
- [SHOULD FIX, doc-only] `handleImport` correctly awaits each step. No end-to-end test exercises this path. Acceptable for ship; suggested follow-up.

### Regressions / CLAUDE.md check

No "Never break these" rules violated. Storage stays `chrome.storage.local` (Rule 10). First-run default profile preserved with `isSystem: true` and assigned to both built-in sites (Rule 11). `lib/auto-apply.ts`, adapters, and content scripts untouched (Rules 3-7 unaffected).

Real-Chrome behaviours covered only by unit tests (worth manual smoke): outside-click on the actual popup, 🔒 prefix rendering in popup quick-pick on a real v1-upgraded install, and `handleImport` re-migration after Export/Import.

### Verdict (validator)

APPROVED WITH CAVEATS — all 10 ACs are functionally met and the automated gate is green. Caveats are stylistic and documentation drift. No blocking defects.
