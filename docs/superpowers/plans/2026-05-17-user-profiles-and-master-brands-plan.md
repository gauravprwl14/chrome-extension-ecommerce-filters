# User Profiles & Master-Brand Model — Implementation Plan

**Slug:** `2026-05-17-user-profiles-and-master-brands`
**Size:** Large
**References:** [PRD](../specs/2026-05-17-user-profiles-and-master-brands-prd.md), [Tech Spec](../specs/2026-05-17-user-profiles-and-master-brands-techspec.md), [Test Plan](../specs/2026-05-17-user-profiles-and-master-brands-testplan.md)

## Execution strategy

Strict TDD per phase: write failing tests first, run `pnpm test` to
confirm red, implement to green, then `pnpm typecheck && pnpm lint`.
After each phase, commit with a Conventional Commits message
(`feat(profiles): …`, `feat(seed): …`, etc.). Do **not** batch
phases into one commit — each phase is independently revertible.

Run `pnpm test` after every phase. Run the full triad
(`pnpm typecheck && pnpm lint && pnpm test`) before declaring the
feature done.

---

## Phase 1 — Pure helpers (`lib/brand-search.ts`, `lib/profile-utils.ts`)

**Why first:** dependency-free, fastest TDD loop, unblocks the
ProfilesTab rewrite.

### Tests to write first

`tests/brand-search.test.ts`:

- empty query returns all brands in input order
- whitespace-only query returns all brands in input order
- case-insensitive substring match on `Brand.name`
- substring match on every `Brand.variants[].value` (both `string`
  and `regex` variant types matched as literal text — we do NOT
  compile regex variants here)
- exact-name match (case-insensitive) sorts before substring match
- two brands with substring matches preserve input order (stable)

`tests/profile-utils.test.ts`:

- `slugifyName("Tommy Hilfiger")` → `"tommy-hilfiger"`
- `slugifyName("???")` → `""`
- `slugifyName("My Brands!!!  ")` → `"my-brands"`
- `generateUniqueProfileId("My Brands", new Set())` → `"my-brands"`
- `generateUniqueProfileId("My Brands", new Set(["my-brands"]))` → `"my-brands-2"`
- `generateUniqueProfileId("My Brands", new Set(["my-brands","my-brands-2"]))` → `"my-brands-3"`
- `generateUniqueProfileId("???", new Set())` → `""` (empty after slug)
- `generateCloneName("My Brands", new Set())` → `"My Brands (copy)"`
- `generateCloneName("My Brands", new Set(["My Brands (copy)"]))` → `"My Brands (copy 2)"`
- `generateCloneName("My Brands", new Set(["My Brands (copy)","My Brands (copy 2)"]))` → `"My Brands (copy 3)"`

### Implementation

- `lib/brand-search.ts` exports `searchBrands(brands: Brand[], query: string): Brand[]`.
- `lib/profile-utils.ts` exports `slugifyName`, `generateUniqueProfileId`, `generateCloneName`.

### Commit

`feat(lib): add brand-search and profile-utils helpers`

---

## Phase 2 — Config schema bump

**Why now:** every downstream phase touches `Profile`. Fix the type
once, fix existing fixtures, move on.

### Changes

- `lib/config.ts`: add `isSystem?: boolean` to `Profile`. Bump
  `DEFAULT_CONFIG.version` from `'1'` to `'2'`.

### Test fallout

- `tests/seed.test.ts` and any other test that constructs `Profile`
  literals: TS compiles fine (field is optional). Verify with
  `pnpm typecheck`.
- `tests/storage-quota.test.ts` if it pins `version: '1'` — adjust to
  `'2'` to reflect the new default.

### Commit

`feat(config): add Profile.isSystem and bump config version to '2'`

---

## Phase 3 — Seed: classification, migration, propagation gating

**Why:** the data-model heart of the feature. All downstream UI
depends on `isSystem` being set correctly.

### Tests to write first (extend `tests/seed.test.ts`)

Add a new `describe` block: `mergeSeedsIntoConfig — isSystem propagation gating`.

- propagation pushes new brand to default profile when `isSystem: true`
- propagation pushes new brand to default profile when `isSystem: undefined` (legacy fixture parity)
- propagation does NOT push new brand to default profile when `isSystem: false`
- curated profile created via step 3 carries `isSystem: true`

Add another block: `bootstrapConfig — v1 → v2 migration`.

- fresh install: every profile created carries `isSystem: true`;
  written config has `version: '2'`
- v1 vanilla install (my-brands + watches both pristine): both
  profiles tagged `isSystem: true`; `version` becomes `'2'`
- v1 install with my-brands trimmed (one seed brand removed):
  my-brands tagged `isSystem: false`; watches tagged `isSystem: true`
- v1 install with watches renamed to "My Custom Watches": watches
  tagged `isSystem: false`
- v1 install with watches icon changed: watches tagged `isSystem: false`
- v1 install with a user-created `office-wear` profile alongside
  seeded ones: user profile tagged `isSystem: false`; seeded ones
  unaffected
- migration runs AFTER seed-merge: install with my-brands missing a
  newly-shipped seed brand (seed-merge will add it) → my-brands is
  still tagged `isSystem: true` because by classification time the
  brand is present
- idempotency: second bootstrap pass with `version: '2'` and every
  profile having `isSystem` produces `changed: false`
- import path simulation: write a v1-shaped config via `setConfig`,
  call `bootstrapConfig`, observe migration runs (covered indirectly
  by the v1 fixtures above)
- malformed v2 config (version `'2'` but some profile missing
  `isSystem`) is re-migrated

### Implementation in `lib/seed.ts`

1. **`bootstrapConfig` fresh-install branch**: when creating the
   default profile, set `isSystem: true`. Same for any other
   profile-creating code path (none today, but defensive).

2. **`mergeSeedsIntoConfig` step 2 (propagation)**: replace the
   current `if (defaultProfile && ...)` check with
   `if (defaultProfile && defaultProfile.isSystem !== false && ...)`.

3. **`mergeSeedsIntoConfig` step 3 (curated profile creation)**:
   when pushing a new profile object, include `isSystem: true`.

4. **Migration helper** — new exported function `migrateToV2(config, seedBrands, seedProfiles)`:
   - Early-exit if `config.version === '2'` AND every profile has
     `isSystem` defined.
   - Build `seedProfilesById` from `[my-brands seed-shape, ...seedProfiles]`.
     The `my-brands` seed-shape is constructed from
     `{ id: DEFAULT_PROFILE_ID, name: 'My Brands', icon: '🛍', brandIds: liveSeedBrandIds }`
     where `liveSeedBrandIds = seedBrands.filter(b => !DEPRECATED_BRAND_IDS.includes(b.id)).map(b=>b.id)`.
   - For each profile, call `classifyProfile(profile, seedProfilesById, currentMasterBrandIds, DEPRECATED_BRAND_IDS)`.
   - Set `config.version = '2'`.
   - Return `true` if any change was made.

5. **`classifyProfile`** (private helper, also exported for direct testing):
   - If the profile already has `isSystem` set, return it unchanged.
   - If `seedProfilesById[profile.id]` is undefined → `{ ...profile, isSystem: false }`.
   - If `profile.name !== seed.name || profile.icon !== seed.icon` → `{ ...profile, isSystem: false }`.
   - Compute `expectedIds = seed.brandIds.filter(id => currentMasterBrandIds.has(id) && !DEPRECATED.has(id))`.
   - If any `expectedIds` is missing from `profile.brandIds` → `{ ...profile, isSystem: false }`.
   - Otherwise → `{ ...profile, isSystem: true }`.

6. **`bootstrapConfig` invocation order**: keep the existing
   sequence (fresh-install branch → mergeSeedsIntoConfig). Add the
   migration call **after** mergeSeedsIntoConfig but **before** the
   end-of-function `writeConfig`. Set `changed = true` if migration
   returned true.

### Commit

`feat(seed): classify profiles, gate propagation, migrate v1→v2`

---

## Phase 4 — Shared `useOutsideClick` hook

### Test first

`tests/use-outside-click.test.tsx`:

- mounts a component with a `<div ref={ref}>{trigger + menu}</div>`
- clicking inside the ref does NOT invoke onClose
- clicking outside (on `document.body`) DOES invoke onClose
- pressing Escape DOES invoke onClose
- unmounting removes the listeners (assert via spy on
  `document.removeEventListener`)

### Implementation

`lib/use-outside-click.ts`:

```ts
export function useOutsideClick(
  ref: React.RefObject<HTMLElement | null>,
  onClose: () => void,
  active = true,
): void {
  useEffect(() => {
    if (!active) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [ref, onClose, active])
}
```

### Commit

`feat(lib): add useOutsideClick hook`

---

## Phase 5 — `ProfilesTab` rewrite

### Components & files

New files under `options/components/`:

- `options/components/BrandPicker.tsx` — wraps `searchBrands`,
  shows search input + filtered list with checkboxes, "+ Add 'X' to
  master" affordance when no exact match. Uses `useOutsideClick` to
  close its dropdown panel when active.
- `options/components/SystemProfileCard.tsx` — read-only card with
  🔒 icon, profile contents, and "Duplicate" button.
- `options/components/UserProfileCard.tsx` — editable card (rename,
  emoji pick, BrandPicker, delete).
- `options/components/CreateProfileForm.tsx` — form panel for the
  "+ New profile" flow.
- `options/components/DuplicateConfirmModal.tsx` — modal with
  Cancel + Create copy buttons; uses `useOutsideClick` and Escape
  to dismiss.

Rewrite `options/tabs/ProfilesTab.tsx` to:

- Sort profiles: system first, then user; within each, insertion order.
- Render SystemProfileCard for `isSystem === true`, UserProfileCard
  otherwise.
- Wire the Duplicate flow: open DuplicateConfirmModal → on confirm,
  call `onAdd(cloneProfile)` with `isSystem: false` and the
  `generateCloneName` + `generateUniqueProfileId` outputs.
- The Create flow uses `CreateProfileForm`; submit calls
  `onAdd(newProfile)` with `isSystem: false`.

### `options.tsx` changes

- `handleAddProfile`, `handleUpdateProfile`, `handleDeleteProfile`
  unchanged (they accept the full profile shape).
- `handleAddProfile`: assert (TypeScript) the new profile has
  `isSystem: false` from the caller — no logic change needed.

### Tests

`tests/integration/profiles-tab.test.tsx` (new, RTL with jsdom):

- renders system profile with 🔒 lock icon and Duplicate button
- system card does NOT render a delete or rename control
- clicking Duplicate opens the confirm modal; clicking Cancel closes it
- clicking Create-copy in the modal calls onAdd with the cloned profile
  (name = `"My Brands (copy)"`, `isSystem: false`)
- "+ New profile" opens create form
- submitting create form with empty name shows inline error (button disabled)
- submitting with name + ≥1 brand calls onAdd with `isSystem: false`
- brand picker filters by typed query
- "+ Add 'X' to master" appears when query has no exact match
- clicking the add-to-master affordance calls onAddBrand + adds the brand to selection

### Commit

`feat(options): split system/user profile cards and add Create + Duplicate flows`

---

## Phase 6 — Outside-click wiring in existing dropdowns + popup lock prefix

### Files

- `components/ProfileDropdown.tsx` (used by popup) — wrap the menu
  in a ref + `useOutsideClick`. Show 🔒 prefix on rows where
  `profile.isSystem === true`.
- `components/BrandMultiSelect.tsx` — wrap its dropdown panel in a
  ref + `useOutsideClick`.
- `options/tabs/SitesTab.tsx` — its per-site default-profile picker
  uses a native `<select>` per the current code; if so, no change is
  needed (browser handles dismissal). If it has been replaced with a
  custom dropdown, wrap with `useOutsideClick`. **Verify by reading
  the file at implementation time.**

### Tests

RTL test files for each component, asserting:

- the menu opens on trigger click
- a click on `document.body` closes the menu
- pressing Escape closes the menu
- a click on a menu item still works (does not dismiss prematurely)
- for `ProfileDropdown`: a row with `profile.isSystem === true`
  renders the 🔒 prefix

### Commit

`feat(ui): close popovers on outside-click and show lock prefix on system profiles`

---

## Phase 7 — Import handler invokes bootstrap

### Change

In `options.tsx`, `handleImport`:

```ts
const handleImport = async (imported: Config) => {
  await setConfig(imported)
  await bootstrapConfig(defaultBrands as Brand[], [WATCHES_PROFILE], getConfig, setConfig)
  const migrated = await getConfig()
  setConfigState(migrated)
}
```

### Test

Extend `tests/seed.test.ts` (or new `tests/integration/import.test.ts`):

- write a v1-shaped config via the fake storage, simulate the
  import flow (setConfig + bootstrapConfig), observe the resulting
  stored config has `version: '2'` and every profile has `isSystem`.

### Commit

`feat(options): migrate imported configs via bootstrapConfig`

---

## Final verification

1. `pnpm typecheck` — clean
2. `pnpm lint` — clean
3. `pnpm test` — all green; the suite count grew by the new test
   files; no existing tests skipped.
4. `pnpm build` — succeeds.
5. Manual run-through in `pnpm dev` per the test plan's manual
   checklist.
6. AC traceability cross-check (see test plan).

## Rollback

Each phase is one commit. To revert, `git revert <commit>` in
reverse order (7 → 1). Phase 2's `Config.version` bump cannot be
trivially reverted on installs that have already migrated; the
existing `getConfig` legacy-sync fallback ensures users still see
_some_ config, but a downgrade is not a supported path. Document
this in the commit message for Phase 2.
