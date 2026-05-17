# User Profiles & Master-Brand Model — Test Plan

**Slug:** `2026-05-17-user-profiles-and-master-brands`
**References:** [PRD](./2026-05-17-user-profiles-and-master-brands-prd.md), [Tech Spec](./2026-05-17-user-profiles-and-master-brands-techspec.md), [Plan](../plans/2026-05-17-user-profiles-and-master-brands-plan.md)

## Unit tests

| File                                         | What it verifies                                                                                                                                                                                                                                                                                                                                                             | Maps to AC                                    |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `tests/brand-search.test.ts`                 | empty/whitespace query returns all; case-insensitive substring on name; substring on variants; exact match sorts first; stable order                                                                                                                                                                                                                                         | AC5                                           |
| `tests/profile-utils.test.ts`                | `slugifyName` normalises and rejects empty-after-slug; `generateUniqueProfileId` collision auto-numbering; `generateCloneName` `(copy)` / `(copy 2)` numbering                                                                                                                                                                                                               | AC2, AC3                                      |
| `tests/use-outside-click.test.tsx`           | click-inside no-op; click-outside fires onClose; Escape fires onClose; listeners removed on unmount                                                                                                                                                                                                                                                                          | AC6                                           |
| `tests/seed.test.ts` (extended)              | `mergeSeedsIntoConfig` propagation gated on `isSystem !== false`; legacy `undefined` still propagates; new curated profiles get `isSystem: true`; `bootstrapConfig` fresh install sets `isSystem: true` and `version: '2'`                                                                                                                                                   | AC1, AC8                                      |
| `tests/seed.test.ts` (migration block)       | pristine my-brands → `isSystem: true`; trimmed my-brands → `isSystem: false`; renamed Watches → `isSystem: false`; icon-only edited Watches → `isSystem: false`; user-created profile alongside seeds → `isSystem: false`; migration runs after seed-merge (newly-shipped brand propagated then classified); idempotent on v2; malformed v2 (missing `isSystem`) re-migrates | AC1, AC8, AC9                                 |
| `tests/storage.test.ts` (existing)           | `getConfig` reads stay read-only and produce v2-shaped config after bootstrap has run                                                                                                                                                                                                                                                                                        | AC9 (negative — `getConfig` does NOT migrate) |
| `components/ProfileDropdown.test.tsx` (new)  | menu closes on outside-click and Escape; 🔒 prefix appears for `isSystem: true` rows                                                                                                                                                                                                                                                                                         | AC6, AC10                                     |
| `components/BrandMultiSelect.test.tsx` (new) | dropdown closes on outside-click and Escape; clicks on menu items don't dismiss the menu prematurely                                                                                                                                                                                                                                                                         | AC6                                           |

## Integration tests

| File                                      | What it verifies                                                                                                                                                                                                                                                     | Maps to AC          |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `tests/integration/profiles-tab.test.tsx` | full Profiles-tab flow: render system profile with lock + Duplicate; Duplicate confirm modal Cancel/Confirm paths; Create form validation + happy path; brand search filtering + "+ Add to master" affordance; clones are `isSystem: false` with auto-numbered names | AC2, AC3, AC5, AC10 |
| `tests/integration/import.test.ts` (new)  | importing a v1-shaped config followed by `bootstrapConfig` results in a v2 config with `isSystem` set on every profile                                                                                                                                               | AC8, AC9            |

## Manual DOM verification

These steps cannot be driven from the unit-test harness — they must
be executed by the developer in `pnpm dev`.

1. **Fresh install**
   - `pnpm dev`, load unpacked, clear extension storage first.
   - Open Options → Profiles. Verify "My Brands" and "Watches" both
     show a 🔒 lock icon and a "Duplicate" button (no Edit/Delete).
   - Open popup on `www.myntra.com`. Verify the profile dropdown
     shows both system profiles with a 🔒 prefix.
   - **Covers:** AC1, AC10.

2. **Create a user profile**
   - Options → Profiles → "+ New Profile".
   - Try Submit with empty name → button disabled.
   - Enter "Office wear", pick emoji, search "tom" → "Tommy
     Hilfiger" filters in, tick it.
   - Search a brand name that doesn't exist → click "+ Add 'X' to
     master" → it appears selected.
   - Submit. New card appears without lock; brand count matches
     selection.
   - **Covers:** AC2, AC4, AC5, AC7.

3. **Duplicate a system profile**
   - On the "My Brands" system card, click Duplicate.
   - Modal appears. Press Escape → modal closes (no clone).
   - Click Duplicate again → Confirm. New card "My Brands (copy)"
     appears with no lock.
   - Edit it (rename to "Casuals", remove a brand). Original "My
     Brands" remains unchanged with original brands.
   - **Covers:** AC3, AC4.

4. **Outside-click dismissal**
   - Open popup profile dropdown → click outside (on the
     "BrandFilter" header) → menu closes.
   - Same for the popup brand multi-select.
   - Options → Sites tab → open the default-profile dropdown →
     click elsewhere on the page → menu closes.
   - **Covers:** AC6.

5. **Upgrade simulation (manual)**
   - Build the current `dev` branch (pre-feature). Install. Use the
     extension; trim one brand out of "My Brands"; create an
     "Office wear" profile.
   - Rebuild on this feature branch. Reload the unpacked extension.
   - Verify: "Office wear" still present and editable;
     user-trimmed "My Brands" is **unlocked** (no 🔒) — became a
     user profile per AC9; "Watches" is still locked (pristine);
     no user-added master brands lost.
   - **Covers:** AC8, AC9.

6. **System-profile immutability via Sites tab**
   - Options → Sites → change Myntra default to a user profile,
     then back to a system profile. Both succeed; the system
     profile is not mutated.
   - **Covers:** AC3.

7. **Brand search keyboard nav (light check)**
   - In the profile editor, type a query → press ↓ then Enter →
     first result is selected.
   - **Covers:** AC5 (keyboard nav).

## Known risks

- **Migration's `my-brands` superset check depends on order.** If
  someone later moves the migration call to run BEFORE
  `mergeSeedsIntoConfig` in `bootstrapConfig`, a pristine my-brands
  that lags by one newly-shipped seed brand will be falsely demoted
  to `isSystem: false` on first run of the new version. Tech-spec
  pins the order; the test "migration runs AFTER seed-merge" is the
  tripwire. If that test is ever weakened, the regression returns
  silently.
- **Test harness for `BrandPicker` may need to stub portal-style
  layering.** If the dropdown is rendered as a positioned child of
  the card and an Enter-key handler bubbles, RTL needs to fire on
  the input element specifically. Worth a sanity check during
  implementation.
- **`Profile.isSystem` is optional (`?: boolean`)** — every UI
  consumer must treat `undefined` as `false` (treat-as-user) for
  display purposes. The bootstrap+migration guarantee that
  persisted configs always have it set, but in-memory test fixtures
  may not. Two spots especially: `SystemProfileCard` selection in
  ProfilesTab (use `profile.isSystem === true`, not truthy check);
  popup dropdown 🔒 prefix (same).
- **Export/Import users on slow disks** — `setConfig + bootstrapConfig`
  in the import handler is two writes. If the user closes the page
  between them, the imported config is stored without migration
  flags. Recovered on next popup open (bootstrap re-fires). Not a
  data-loss risk but worth noting.
- **No `parentId` lineage** — a user who clones, then later
  expects the clone to receive seed-propagated new brands, will be
  surprised. PRD explicitly non-goals this. Document in popup or
  options if user-feedback bites.

## AC traceability

| AC                                                          | Covered by                                                                                                                                   |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1 — `isSystem` on Profile, set by seed/migration          | `tests/seed.test.ts::bootstrapConfig — v1 → v2 migration` (all fixtures); manual step 1                                                      |
| AC2 — Create-profile UX (name + emoji + brand multi-select) | `tests/integration/profiles-tab.test.tsx::create flow`; `tests/profile-utils.test.ts`; manual step 2                                         |
| AC3 — System profiles immutable; confirm-then-clone         | `tests/integration/profiles-tab.test.tsx::system card + duplicate flow`; `tests/profile-utils.test.ts::generateCloneName`; manual steps 3, 6 |
| AC4 — User profiles editable + deletable; auto-save         | `tests/integration/profiles-tab.test.tsx::user card edit/delete`; manual step 2                                                              |
| AC5 — Universal brand search + "+ Add to master"            | `tests/brand-search.test.ts`; `tests/integration/profiles-tab.test.tsx::search + add to master`; manual steps 2, 7                           |
| AC6 — Outside-click dismissal                               | `tests/use-outside-click.test.tsx`; `components/ProfileDropdown.test.tsx`; `components/BrandMultiSelect.test.tsx`; manual step 4             |
| AC7 — Master library single source of truth                 | `tests/integration/profiles-tab.test.tsx::add-to-master path`; manual step 2                                                                 |
| AC8 — Upgrade safety; user data sacrosanct                  | `tests/seed.test.ts::migration` user-trimmed + user-renamed fixtures; `tests/integration/import.test.ts`; manual step 5                      |
| AC9 — v1 → v2 migration algorithm                           | `tests/seed.test.ts::migration block` (every classification case + idempotency + malformed-v2); manual step 5                                |
| AC10 — Visual lock differentiation (cards + popup dropdown) | `tests/integration/profiles-tab.test.tsx::system card lock`; `components/ProfileDropdown.test.tsx::lock prefix`; manual step 1               |

## Pre-flight gate

Before declaring the implementation done, the TL re-runs:

```
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

…and walks through manual steps 1–7. Any AC not "Met" at that point
becomes a `[BLOCKER]` follow-up before QA.
