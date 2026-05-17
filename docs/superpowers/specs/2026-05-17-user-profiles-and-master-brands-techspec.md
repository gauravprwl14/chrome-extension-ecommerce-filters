# User Profiles & Master-Brand Model — Tech Spec

**Slug:** `2026-05-17-user-profiles-and-master-brands`
**Size:** Large
**Status:** Draft
**References:** [PRD](./2026-05-17-user-profiles-and-master-brands-prd.md)

## Approach

The feature breaks into four orthogonal concerns:

1. **Data model**: add `Profile.isSystem: boolean` and bump
   `Config.version` from `'1'` to `'2'`. A v1 → v2 migration runs once
   inside `getConfig()` and tags each existing profile (see "Migration
   algorithm" below). System profiles created by seed/bootstrap carry
   `isSystem: true`; profiles created by the UI carry `isSystem: false`.
   `mergeSeedsIntoConfig` gates new-brand propagation on
   `profile.isSystem !== false`, which keeps existing seed tests green
   (they predate the field, so `undefined !== false` resolves true)
   while still preventing propagation into user profiles
   (`isSystem: false` is explicit).

2. **Pure helpers**: three new dependency-free modules so React stays
   thin and unit tests don't need jsdom for logic.
   - `lib/brand-search.ts` — `searchBrands(brands, query)`:
     case-insensitive substring across `Brand.name` and every
     `Brand.variants[].value`. Stable insertion-order sort, exact
     matches first.
   - `lib/profile-utils.ts` — `generateCloneName(original, taken)`,
     `generateUniqueProfileId(name, taken)`. Both use auto-numbering:
     `"My Brands (copy)"`, `"My Brands (copy 2)"`, etc.
   - `lib/use-outside-click.ts` — a shared React hook
     `useOutsideClick(ref, onClose)` that wires `mousedown` and
     `keydown` (Escape) listeners on `document` when active.

3. **UI**: `options/tabs/ProfilesTab.tsx` is the heart of the change —
   adds a Create flow, splits the card renderer into `SystemProfileCard`
   (lock icon, Duplicate button, read-only) and `UserProfileCard`
   (rename, emoji edit, brand picker with search, delete). The
   create/edit picker reuses one `<BrandPicker>` component built on
   `searchBrands` + `useOutsideClick`. `options/tabs/SitesTab.tsx`,
   `popup.tsx` gain `useOutsideClick` on their existing dropdowns and a
   🔒 prefix on system-profile rows in the popup dropdown.

4. **Backwards-compatible UX of existing profiles**: the migration
   distinguishes "untouched seed" from "user-modified seed" so existing
   installs aren't surprised by lock icons appearing on profiles the
   user has been editing. Modified seeded profiles are tagged
   `isSystem: false` and become normal user profiles. The user's
   already-removed brands are not re-added (the existing
   "newly-added" propagation rule already handles this — see
   `tests/seed.test.ts:162-173`).

## Migration algorithm (AC9)

The v1 → v2 migration runs **inside `bootstrapConfig`**, after the
seed-merge step (so `my-brands` has had any newly-shipped seed brands
propagated into it before classification). It runs when:

- the stored config has no `version`, **or** `version === '1'`, **or**
- any profile lacks an `isSystem` field.

`getConfig()` itself does NOT migrate — it only reads. Both the
service worker (`background.ts`) and the popup (`lib/popup-init.ts:56`)
invoke `bootstrapConfig` on wake; bootstrap already serialises its
read-mutate-write in a single function and writes only once at the
end, so concurrent popup/SW bootstraps converge on the same v2 shape
without a clobber window. (The original draft placed migration in
`getConfig()`; the audit flagged this as racy — see Independent audit
below — because popup AND SW each call `getConfig` independently, and
neither holds a lock. Bootstrap is the single chokepoint that already
exists for SW-init.)

For each profile in the stored config:

```
function classifyProfile(profile, seedBrandIds, seedProfilesById, currentMasterBrandIds):
  # Try to find the matching seed by id.
  seed = seedProfilesById[profile.id]   # 'my-brands' or 'watches'
  if seed is None:
    return { ...profile, isSystem: false }   # user-created in v1

  # Identity check: name/icon untouched.
  if profile.name != seed.name or profile.icon != seed.icon:
    return { ...profile, isSystem: false }   # user renamed it

  # Membership check: seed brandIds (filtered to ones currently in
  # masterBrands AND not deprecated) must all still be in profile.brandIds.
  expectedIds = seed.brandIds.filter(id => currentMasterBrandIds.has(id) && id not in DEPRECATED)
  if not all(id in profile.brandIds for id in expectedIds):
    return { ...profile, isSystem: false }   # user trimmed brands

  # Special case for my-brands: also require all live seed brands present
  if profile.id == DEFAULT_PROFILE_ID:
    liveSeedIds = SEED_BRANDS.filter(b => not deprecated).map(b => b.id)
    if not all(id in profile.brandIds for id in liveSeedIds):
      return { ...profile, isSystem: false }

  return { ...profile, isSystem: true }
```

For `watches`, the seed is `WATCHES_PROFILE` in `lib/seed.ts`. For
`my-brands`, there is no static seed brandIds — the live seed is
`assets/default-brands.json` minus `DEPRECATED_BRAND_IDS`. The
`my-brands` branch above uses that live set, NOT a frozen snapshot:
this matches PO Q&A ("brandIds is a superset of the seed's brandIds")
and is the only definition that survives the existing seed-propagation
behaviour, which has been adding new brands to my-brands on every
update.

After classification, the migration (still inside `bootstrapConfig`,
on the same in-memory config object that will be written once at the
end of bootstrap):

1. Replaces each profile with its classified copy (`isSystem` set).
2. Sets `config.version = '2'`.
3. Sets the `changed` flag to true so the existing bootstrap-end
   `writeConfig(config)` call persists the migration.
4. Returns control to bootstrap; the caller eventually receives the
   migrated config via the next `getConfig()`.

The migration is idempotent: a second pass sees `version === '2'` and
every profile already has `isSystem`, so it is a no-op.

**Ordering inside `bootstrapConfig`:** seed-merge runs first (existing
behaviour), then migration. This ensures the `my-brands` superset
check sees the post-propagation `brandIds` and doesn't falsely demote
a pristine my-brands install that lagged behind a recent seed addition.

**Import path:** `options.tsx` import handler calls `setConfig(imported)`
directly, bypassing bootstrap. After import, the handler **must** then
invoke `bootstrapConfig` (already imported in `background.ts` / popup;
the import handler will call a small wrapper) so the imported config is
classified before any UI consumes it. This also handles defensive
re-migration when an "v2 export" arrives without `isSystem` fields
(malformed export).

## Components / files touched

| File                                      | Change                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/config.ts`                           | Modify — add `Profile.isSystem: boolean`. Bump `DEFAULT_CONFIG.version` to `'2'`.                                                                                                                                                                                                                                                                                                                                         |
| `lib/seed.ts`                             | Modify — `bootstrapConfig` sets `isSystem: true` on every seeded profile (fresh install path); `mergeSeedsIntoConfig` step 3 (curated profile creation) sets `isSystem: true` on the new profile; `mergeSeedsIntoConfig` propagation pushes only when `defaultProfile.isSystem !== false`. `bootstrapConfig` runs the v1→v2 migration AFTER seed-merge, persisting via the existing single end-of-function `writeConfig`. |
| `lib/storage.ts`                          | Unchanged for migration (`getConfig` stays read-only).                                                                                                                                                                                                                                                                                                                                                                    |
| `options.tsx`                             | Modify — import handler invokes `bootstrapConfig` after `setConfig(imported)` so imports get classified.                                                                                                                                                                                                                                                                                                                  |
| `lib/brand-search.ts`                     | Create — pure `searchBrands(brands, query)` helper.                                                                                                                                                                                                                                                                                                                                                                       |
| `lib/profile-utils.ts`                    | Create — `generateCloneName`, `generateUniqueProfileId`, `slugifyName` (extracted from existing inline logic).                                                                                                                                                                                                                                                                                                            |
| `lib/use-outside-click.ts`                | Create — React hook for outside-click + Escape dismissal.                                                                                                                                                                                                                                                                                                                                                                 |
| `options/tabs/ProfilesTab.tsx`            | Major rewrite — create flow, SystemProfileCard + UserProfileCard split, BrandPicker subcomponent, Duplicate-confirm modal.                                                                                                                                                                                                                                                                                                |
| `options/tabs/SitesTab.tsx`               | Modify — wrap default-profile dropdown with `useOutsideClick`.                                                                                                                                                                                                                                                                                                                                                            |
| `options/tabs/MasterBrandsTab.tsx`        | Modify — minor: surface "Used in X profiles" stays; no schema-driven change.                                                                                                                                                                                                                                                                                                                                              |
| `popup.tsx`                               | Modify — `useOutsideClick` on profile dropdown + brand multi-select; 🔒 prefix on system-profile rows in dropdown.                                                                                                                                                                                                                                                                                                        |
| `options.tsx` (other handlers)            | Modify — pass through `isSystem` in profile handlers (no logic change needed — props already spread full Profile).                                                                                                                                                                                                                                                                                                        |
| `tests/seed.test.ts`                      | Extend — add v1→v2 migration cases, `isSystem` gating cases.                                                                                                                                                                                                                                                                                                                                                              |
| `tests/storage.test.ts`                   | Extend — v1→v2 migration runs once, idempotent, doesn't re-run on v2 reads.                                                                                                                                                                                                                                                                                                                                               |
| `tests/brand-search.test.ts`              | Create — name + variant matching, case-insensitivity, exact-match-first ordering.                                                                                                                                                                                                                                                                                                                                         |
| `tests/profile-utils.test.ts`             | Create — `generateCloneName` numbering, `generateUniqueProfileId` slug collision handling.                                                                                                                                                                                                                                                                                                                                |
| `tests/use-outside-click.test.tsx`        | Create — RTL test: click outside closes, click inside does not, Escape closes.                                                                                                                                                                                                                                                                                                                                            |
| `tests/integration/profiles-tab.test.tsx` | Create — RTL integration: create profile, search brand, "+ Add to master" promotes, lock card shows Duplicate, duplicate flow creates editable clone.                                                                                                                                                                                                                                                                     |

## Data shape changes

```ts
// lib/config.ts
export interface Profile {
  id: string
  name: string
  icon: string
  brandIds: string[]
  isSystem?: boolean // NEW — optional for back-compat with legacy fixtures.
  // Undefined is treated as "not yet classified".
  // After bootstrap+migration, every persisted profile
  // has this set to true | false.
}

export const DEFAULT_CONFIG: Config = {
  version: '2', // bumped from '1'
  // …
}
```

Session-flag shape (per-tab) and message payloads are unchanged.
Export/Import JSON now includes `isSystem` per profile. The import
handler calls `bootstrapConfig` immediately after `setConfig(imported)`,
which:

- Migrates `version: '1'` exports to v2 (classifies every profile).
- Defensively re-migrates `version: '2'` exports if any profile is
  missing `isSystem` (malformed export).
- Re-runs seed-merge on top, ensuring the import doesn't permanently
  block new-seed propagation into a system my-brands.

## Risks

- **Migration mis-classifies a user's edited "My Brands" as system.**
  Mitigation: AC9 detection requires _every_ current live seed brand
  id to be present in the profile. If the user has removed even one
  seed brand from their copy, classification falls through to
  `isSystem: false`. Two test fixtures pin this:
  `tests/seed.test.ts` — "user-trimmed seed becomes user profile".

- **Migration mis-classifies an unmodified seed as user.** Lower
  consequence (lock icon doesn't appear), but worth a test fixture
  too — pristine "Watches" seed must be tagged `isSystem: true`.

- **Outside-click hook interferes with intentional clicks inside the
  trigger.** Mitigation: hook takes a `ref` covering the _whole_
  popover region including its trigger; the hook checks
  `ref.current?.contains(event.target)` before invoking `onClose`.
  RTL test pins this.

- **Brand search performance with 200+ brands and every keystroke
  re-filtering.** Trivial at this size (linear over name + variants
  is microseconds), but the helper is memoised via React `useMemo`
  in the picker. Not a real concern; flagged for completeness.

- **`Profile.isSystem` makes `Profile` non-optional in `Config` —
  legacy stored configs lack it.** Mitigation: migration normalises
  every Profile before returning from `getConfig()`. Other call sites
  (which there are many of) can assume the field is always present
  post-`getConfig()`.

- **`mergeSeedsIntoConfig` gating on `isSystem !== false` is fragile
  if a future caller forgets to set isSystem on a new system profile.**
  Mitigation: `bootstrapConfig` is the only producer of system
  profiles, and it always sets `isSystem: true`. A test fixture
  asserts `bootstrapConfig`-created profiles carry `isSystem: true`.

- **Duplicate-confirm modal blocks the page** — must support Escape
  and outside-click to dismiss, plus an explicit Cancel button. AC3.
  Pinned in integration test.

- **Existing tests that pass profile literals without `isSystem` will
  type-error after the change.** Mitigation: add `isSystem: false`
  (the safe default for ad-hoc test fixtures) in every existing test
  fixture. Done as part of the test-file changes above. The
  `mergeSeedsIntoConfig` propagation rule `isSystem !== false`
  treats `undefined` (legacy fixtures we miss) AS system, which
  preserves the seed tests' observed behaviour.

## Principles check

- **JSON-schema-first config preserved?** **Yes.** Only `Profile.isSystem`
  and `Config.version` change; no new top-level storage keys.

- **No backend introduced?** **Yes.** All state stays in
  `chrome.storage.local`.

- **MV3 constraints respected?** **Yes.** No `eval`, no remote code,
  no new host permissions.

- **`chrome.storage.local` (not `sync`) used?** **Yes.** No code path
  writes to `chrome.storage.sync`. The legacy sync→local migration in
  `getConfig()` is untouched.

- **Loop-prevention invariant preserved?** **Yes.** This feature
  doesn't touch `lib/auto-apply.ts`, content scripts, or the
  session-flag ordering. `tests/auto-apply.test.ts` continues to pin
  the rule.

- **Content-script sync-ack rule preserved?** **Yes.** No content
  scripts are modified.

- **Ajio brands-host scoping rule preserved?** **N/A.** No Ajio code
  is touched.

- **Myntra URL-driven strategy preserved?** **N/A.** No Myntra code
  is touched.

- **Teach-mode XSS rule preserved?** **Yes.** No new toasts or
  HTML-injection surfaces are introduced. All new UI uses React JSX
  (which escapes by default); the Duplicate-confirm modal renders
  the profile name via `{profile.name}`, not `dangerouslySetInnerHTML`.

**Additional CLAUDE.md "Never break these" rules consulted:**

- Rule 1 (flat ESLint config) — no eslint config changes.
- Rule 2 (`resolveJsonModule`) — `assets/default-brands.json` import
  still works.
- Rule 10 (`chrome.storage.local`) — preserved (see above).
- Rule 11 ("Default profile on first install") — preserved.
  `bootstrapConfig` fresh-install branch still creates `my-brands` as
  the default for both sites, now with `isSystem: true`.

## Alternatives considered

1. **Track `parentId` lineage from clone → system profile.** Rejected
   by PO ("non-goal"). Adds complexity and surprises users who don't
   want their clone re-mutated when the parent gets a new seed brand.

2. **Use a separate `systemProfileIds: string[]` field on Config
   instead of `isSystem` on Profile.** Rejected: callers everywhere
   already iterate profiles, and per-profile boolean is more
   ergonomic than a cross-reference. The set-membership variant also
   makes JSON exports less self-describing.

3. **Run the v1→v2 migration in `getConfig()` instead of
   `bootstrapConfig`.** Rejected after audit: `getConfig` has no
   write-lock, so concurrent popup + SW reads can both classify and
   both write, clobbering each other. Bootstrap is the single
   serialised read-mutate-write entry point and both popup and SW
   call it (`lib/popup-init.ts:56` and `background.ts`).

4. **Make outside-click a per-component effect instead of a shared
   hook.** Rejected: four UI surfaces need it, four ad-hoc effects
   means four chances to forget Escape handling. One hook, one test
   file.

5. **Keep "+ Add to master" as a separate Master Brands tab action
   only.** Rejected: user explicitly requested in-line add from
   profile editor ("we should be able to add new brands"). The
   per-profile path still calls into the same `ensureBrandInLibrary`
   semantics, so the master-tab path is untouched.

## Test strategy outline

**New unit tests:**

- `tests/brand-search.test.ts`
  - matches by name (case-insensitive, substring)
  - matches by variant value (both string and regex variant types
    are matched against query as plain text — regex variants are
    NOT compiled; we search the variant's literal `value`)
  - exact-name match sorts before substring match
  - empty query returns all brands in input order
  - whitespace-only query treated as empty
- `tests/profile-utils.test.ts`
  - `generateCloneName("My Brands", [])` → `"My Brands (copy)"`
  - `generateCloneName("My Brands", ["My Brands (copy)"])` → `"My Brands (copy 2)"`
  - `generateUniqueProfileId("My Brands", new Set(["my-brands"]))` → `"my-brands-2"`
  - `slugifyName("My Brands!!!")` → `"my-brands"`, empty result returns `""`
- `tests/use-outside-click.test.tsx` (RTL)
  - clicking inside the ref does NOT invoke onClose
  - clicking outside DOES invoke onClose
  - pressing Escape invokes onClose
  - listeners are removed when the component unmounts

**Extended unit tests:**

- `tests/seed.test.ts`
  - `bootstrapConfig` fresh install: every seeded profile has
    `isSystem: true`
  - `mergeSeedsIntoConfig` with `defaultProfile.isSystem === false`
    does NOT push new brand into that profile
  - `mergeSeedsIntoConfig` with `defaultProfile.isSystem === undefined`
    (legacy) DOES push (preserves existing behaviour)
  - migration: v1 config with pristine my-brands tagged
    `isSystem: true`
  - migration: v1 config with trimmed my-brands tagged
    `isSystem: false`
  - migration: v1 config with renamed Watches tagged
    `isSystem: false`
  - migration idempotency: second pass on v2 config is a no-op

- `tests/seed.test.ts` (additional)
  - icon-only edit to Watches → migration tags `isSystem: false`
  - fresh install: `bootstrapConfig` writes `version: '2'` directly,
    migration branch is a no-op (no classification needed)
  - import path: `setConfig(v1Export)` followed by `bootstrapConfig`
    classifies the imported profiles
  - import path: malformed v2 export missing `isSystem` on some
    profiles is re-classified on next bootstrap

**New integration tests:**

- `tests/integration/profiles-tab.test.tsx` (RTL with jsdom)
  - "+ New profile" opens the form
  - submitting with empty name shows inline error
  - submitting with name + ≥1 brand creates the profile
  - system profile card shows 🔒 and a Duplicate button
  - clicking Duplicate opens confirm modal; confirming creates a
    clone tagged `isSystem: false`
  - brand search filters list as user types
  - "+ Add 'X' to master" appears when search has no exact match;
    clicking it adds to master + to profile

**Manual verification (in `pnpm dev`):**

- Fresh install: both system profiles show lock icon.
- Create a profile via Options → Profiles → + New profile.
- Edit user profile inline — auto-saves, no save button.
- Click into system profile → Duplicate flow → edit the clone.
- Click outside the popup profile dropdown → it closes.
- Click outside the Sites tab default-profile dropdown → it closes.
- Update extension over a v1 install (load v1 build, populate, reload
  with v2 build): user-edited profiles tagged user; pristine seeded
  profiles tagged system. User-added master brands preserved.

## Independent audit

**Auditor:** vp-eng-auditor (fresh context)
**Date:** 2026-05-17
**Verdict:** APPROVED WITH MINOR FIXES (all addressed in revised spec above)

### Findings

- [BLOCKING] **Race condition in `getConfig()` migration is real, not benign** — Spec §"Migration algorithm" claims concurrent callers see "the already-persisted v2 config or the pre-migration v1 config — both are internally consistent". But `popup-init.ts:56` calls `bootstrapConfig` (which calls `getConfig` + `setConfig`) and `background.ts` does the same on SW wake. If popup and SW race, two concurrent `getConfig()` calls can both read v1, both classify, both `setConfig` — last write wins. If a profile was mutated between reads, the second write clobbers it. **Fix:** add to spec "Migration writes use a read-modify-write guarded by re-reading version inside `setConfig`; if version is already `'2'`, skip the write." Or simpler: run migration ONLY in `bootstrapConfig` (which already has a `changed` guard and is the single SW-init chokepoint) and have `getConfig()` only normalise `isSystem` in-memory for legacy reads. The spec's "Alternatives considered #3" rejected this for the popup case — but `popup-init.ts` already calls `bootstrapConfig` (line 56), so that rejection is incorrect.
  - **RESOLUTION:** Migration moved into `bootstrapConfig`, ordered after seed-merge, persisted via the existing single end-of-function `writeConfig`. Spec §"Migration algorithm" rewritten; Alternatives #3 inverted.

- [SHOULD FIX] **Imported v1 export path is under-specified** — Spec §"Data shape changes" says "importing a v1 export into a v2 install Just Works" because migration re-runs in `getConfig()`. But Export/Import in `options.tsx` typically calls `setConfig(importedJson)` directly, bypassing `getConfig`. The next `getConfig` will see `version: '1'` and migrate — but the gating on `currentMasterBrandIds` will be the **imported** config's masterBrands, which is fine. However, if the import contains `version: '2'` profiles **without** `isSystem` (a malformed export), no migration runs. **Fix:** add to spec "Import path validates `version` and forces migration if any profile lacks `isSystem`, even on v2 configs (defensive)."
  - **RESOLUTION:** Import handler now invokes `bootstrapConfig` after `setConfig(imported)`; migration trigger includes "any profile lacks `isSystem`" regardless of version. Files-touched table updated.

- [SHOULD FIX] **AC9 "user-renamed watches" case not pinned by a test fixture** — Spec test list under `tests/seed.test.ts` includes "renamed Watches → isSystem:false" but the algorithm checks `profile.icon !== seed.icon` too. **Fix:** add to test list "v1 config with icon-only change to Watches tagged `isSystem: false`".
  - **RESOLUTION:** Test list now includes the icon-only edit case.

- [SHOULD FIX] **`my-brands` classification depends on `assets/default-brands.json` at migration time** — ordering matters: migration must run AFTER seed-merge so newly-shipped seed brands have been propagated into a pristine my-brands before the superset check fires.
  - **RESOLUTION:** Spec §"Migration algorithm" now explicitly orders migration after seed-merge inside `bootstrapConfig`.

- [SHOULD FIX] **`mergeSeedsIntoConfig` step 3 (curated profile creation) doesn't set `isSystem`** — newly-created curated Watches on upgrade would get `undefined`. **Fix:** step 3 sets `isSystem: true`.
  - **RESOLUTION:** Files-touched row for `lib/seed.ts` now explicitly covers step 3.

- [SHOULD FIX] **`popup-init.ts` calls `bootstrapConfig` — spec mistakenly said it doesn't.**
  - **RESOLUTION:** Alternatives #3 corrected.

- [NIT] **Fresh-install write of `version: '2'` not tested.**
  - **RESOLUTION:** Added test case.

- [NIT] **`Profile.isSystem` should be optional to ease fixtures.**
  - **RESOLUTION:** Changed to `isSystem?: boolean`. Bootstrap+migration guarantee it's set on every persisted profile.

- [NIT] **Risks section misses "user-renamed my-brands".** Algorithm already handles correctly; cosmetic.
  - **RESOLUTION:** Acknowledged; left as cosmetic.

### CLAUDE.md "Never break these" check

No violations. Rules 1–11 are all either untouched or explicitly preserved.
