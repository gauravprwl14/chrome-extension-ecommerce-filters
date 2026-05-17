# User Profiles & Master-Brand Model — PRD

**Slug:** `2026-05-17-user-profiles-and-master-brands`
**Size:** Large
**Status:** Draft
**Owner:** Product

## Problem

Today users cannot create their own profiles. The two seeded profiles
("My Brands", "Watches") are the only ones that exist, and there is no
UI to add a third. The Options → Profiles tab lets users edit brand
membership inline, but a user editing a default profile silently
overwrites the seeded contents — and on the next extension update, the
seed-merge re-mutates that same profile, leading to surprise.

Three further pain points compound this:

1. **No create-profile flow.** Users cannot give a profile a name + emoji
   - brand set in one place.
2. **Dropdowns don't dismiss on outside-click.** The profile picker,
   per-site default picker, and brand multi-select all stay open after
   the user clicks away, forcing a click on a menu item to close them.
   Users report this as feeling "mandatory" — they have to pick
   something to escape.
3. **No system/user distinction.** Defaults look identical to anything
   the user creates, so a user editing a default is unaware they're
   mutating shared seed data. On upgrade, the seed-merge top-up can
   appear to "undo" their changes.

## Users

**Primary:** Existing BrandFilter users who already use the seeded
profiles and now want a curated personal profile (e.g. "Office wear",
"Weekend casuals") distinct from the defaults.

**Secondary:** New installs — for them, the create-profile button must
be discoverable on first visit to the Options page.

**Anti-target:** Users who never open the Options page; the popup's
quick-pick remains their primary surface and is not redesigned here.

## Goals

- Users can create, rename, and delete their own profiles with a name,
  emoji, and brand selection (with search).
- Default ("system") profiles are visually distinct (lock icon) and
  immutable; attempting to edit one prompts to create a clone.
- The master brand library remains the single source of truth — brands
  cannot exist only inside a profile; adding a brand from a profile
  editor promotes it to master first.
- Brand pickers everywhere support type-and-search (case-insensitive
  substring across name + variants).
- Extension updates never silently mutate user-created profiles or
  user-cloned profiles, and never lose user-added brands.
- All popover-style menus close on outside-click; users are never
  forced to pick an option to dismiss a menu.

## Success metric

A new install can reach "saved a custom profile with ≥3 brands and at
least one self-typed brand search" in ≤90 seconds without touching the
popup's quick-add path — observable by manual scripted run-through.
Plus: **zero** user profiles are mutated by seed-merge on a simulated
extension update in `tests/seed.test.ts`.

## Non-goals

- Multi-emoji / custom emoji picker UI (free-text emoji input or a
  small preset list is fine).
- Sharing or exporting individual profiles (the existing whole-config
  Export/Import in §5.7 already covers backup).
- Profile folders, tags, colour-coding.
- Per-site multiple-profile fallback chains.
- A `parentId` lineage link from a clone back to the system profile it
  was cloned from (clones are standalone; the system profile is left
  intact).
- Any backend or cross-device sync.
- Migrating already-edited defaults into clones retroactively (existing
  installs see their current "My Brands" become the system profile
  as-is; future edits are what trigger the clone prompt).

## Acceptance criteria

### AC1 — Profile data-model distinguishes system vs user profiles

- **Given** the Config schema, **when** a profile is created from the
  seed in `lib/seed.ts`, **then** it carries an `isSystem: true` flag.
- **Given** the Config schema, **when** a user creates or clones a
  profile via the UI, **then** the new profile carries `isSystem: false`.
- **Given** an upgrade from a pre-feature install, **when**
  `bootstrapConfig` runs, **then** the existing `my-brands` and
  `watches` profiles (if present and unmodified-by-user — see AC9
  detection) are tagged `isSystem: true`; any other existing profile
  is tagged `isSystem: false`.

### AC2 — Create-profile flow in Options → Profiles tab

- **Given** the user is on Options → Profiles, **when** they click
  "+ New profile", **then** a form opens with fields: name (required,
  ≤40 chars), emoji (single emoji, defaults to `📁`), brand search +
  multi-select.
- **When** the user submits with a non-empty name and ≥1 selected
  brand, **then** a new profile is created with `isSystem: false` and
  a slug-id derived from the name (`{name-slug}-{n}` if the base slug
  collides).
- **Given** the name is empty after slug generation (e.g. "???"),
  **then** the submit button is disabled and an inline error explains
  why.
- The new profile appears immediately in the profile list without a
  page reload.

### AC3 — System profiles are immutable; edit attempts prompt-then-clone

- **Given** a profile is `isSystem: true`, **then** its card shows a
  lock icon (🔒) and an "Immutable — clone to edit" subtitle.
- The system-profile card exposes: a "Duplicate" button, an emoji + name
  display (read-only), and a brand list (read-only).
- The system-profile card does **not** expose: rename, delete, or
  inline brand-edit controls.
- **When** the user clicks "Duplicate", **then** a confirmation modal
  appears: "Create a copy of '{name}' you can edit?" with [Cancel]
  [Create copy] buttons. (The auto-clone-silently UX was rejected in
  PO Q&A in favour of an explicit confirmation.)
- **When** the user confirms, **then** a new profile is created with
  `isSystem: false`, name `"{original} (copy)"` (auto-numbered if it
  collides), the same emoji, the same brandIds, and the UI scrolls /
  switches focus to the clone for further editing.
- System profiles cannot be deleted or renamed under any UI path.

### AC4 — User profiles are fully editable and deletable

- **Given** a profile is `isSystem: false`, **then** its card exposes:
  rename, emoji-edit, brand search + multi-select, and a Delete button.
- Edits to a user profile auto-save (matches the existing
  PRD §5.2 "no save button" rule).
- Delete shows a confirm: "Delete profile '{name}'?" and on confirm
  removes the profile from `config.profiles` and clears any
  `site.defaultProfileId === <deletedId>` to the first remaining
  system profile (or `''` if none remain).

### AC5 — Brand search is universal and consistent

- The profile editor (create + edit) exposes a search input that
  filters the master brand list by case-insensitive substring match
  on `Brand.name` and on every `Brand.variants[].value`.
- When search returns no exact match, an inline "+ Add '{query}' to
  master brands" affordance appears. Clicking it adds the brand to
  `masterBrands` (slug generated as elsewhere; empty-after-slug
  rejected with inline error) and immediately to the profile being
  edited.
- The search input is keyboard-navigable (↑/↓/Enter to pick the first
  result).

### AC6 — Outside-click dismisses every custom popover

- The popup profile dropdown closes when the user clicks anywhere
  outside its trigger or menu.
- The Options → Sites tab per-site default-profile dropdown closes on
  outside-click.
- The popup and options brand multi-select close on outside-click.
- Any new custom menu introduced by this feature (create-profile form
  panels, duplicate-confirm modal's secondary menus) closes on
  outside-click or Escape.
- Native `<select>` elements are unaffected (browser handles them).

### AC7 — Master brand library remains the single source of truth

- A brand added via any profile-editor "+ Add to master" path appears
  in `masterBrands` first, then is referenced from the profile's
  `brandIds`.
- A brand removed from a user profile is **not** removed from
  `masterBrands` (matches existing rule in PRD §5.3 — only the Master
  Brands tab can delete brands wholesale).
- Two profile-editor "+ Add" calls with the same name produce the
  same brand id and do not duplicate the master entry.

### AC8 — Upgrade safety: user data is sacrosanct

- **Given** an existing install with N user-created profiles (and any
  user-added master brands), **when** the extension is updated and
  `bootstrapConfig` runs, **then**:
  - All N user profiles remain present with identical `id`, `name`,
    `icon`, `brandIds`, and `isSystem: false`.
  - All user-added master brands remain present.
  - No user profile receives newly-shipped seed brands automatically
    (PO Q&A: seed propagation targets system profiles only).
- **Given** the user has deleted a system profile (only possible
  pre-feature — see AC9), **when** `bootstrapConfig` runs after the
  update, **then** the system profile is **not** re-created (sticky
  deletion). _Note: post-feature, system profiles cannot be deleted,
  so this only applies to legacy installs._
- Seed-merge top-up of new master brands still occurs (matches
  existing PRD §5.5 behaviour) but only the **named system default
  profile** (`my-brands`, when `isSystem: true`) receives the new
  brand ids. User profiles and clones do not.

### AC9 — Migration on first run of the new code

- **When** `bootstrapConfig` runs and reads a Config that lacks the
  `isSystem` field on profiles, **then** each existing profile is
  tagged:
  - `isSystem: true` if its `id` matches a seed profile id
    (`my-brands`, `watches`) **and** its current `brandIds` is a
    superset of the seed's `brandIds` (i.e. unmodified except for
    seed-merge additions).
  - `isSystem: false` otherwise (user has edited it — preserves their
    state without surprise re-locking).
- Migration is idempotent: a second pass on an already-migrated config
  is a no-op.
- Migration is covered by `tests/seed.test.ts` with at least three
  fixtures: fresh install, vanilla seeded install, install where the
  user has trimmed brands from "My Brands".

### AC10 — Visual differentiation of system vs user profiles

- System profiles render with a 🔒 lock icon in the top-right of the
  card and a muted background tone.
- User profiles render with no lock and a normal background.
- The popup's profile dropdown shows system profiles with the same
  🔒 prefix beside the name so users can tell at a glance what is
  immutable from the quick-pick.

## Impact on existing features

| Surface                                                    | Change                                                                                                                                                    |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/config.ts` — `Profile` interface                      | Add `isSystem: boolean`. Bump `Config.version` to `'2'` (per PRD §9).                                                                                     |
| `lib/seed.ts` — `bootstrapConfig` / `mergeSeedsIntoConfig` | (a) Seed-merge propagation gated on `isSystem: true`; (b) AC9 migration runs once when version `'1'` → `'2'`; (c) seeded profiles carry `isSystem: true`. |
| `options.tsx` — Profiles tab                               | Major rewrite: card grid stays, but adds Create flow, brand-search picker, duplicate flow, lock-icon affordance, delete on user profiles.                 |
| `options.tsx` — Sites tab                                  | Default-profile dropdown gains outside-click dismissal.                                                                                                   |
| `popup.tsx`                                                | Profile dropdown gains outside-click dismissal and lock-prefix on system profiles. Brand multi-select gains outside-click dismissal.                      |
| `lib/storage.ts`                                           | `getConfig()` runs the v1 → v2 migration.                                                                                                                 |
| `assets/default-brands.json`                               | Unchanged.                                                                                                                                                |
| `tests/seed.test.ts`, `tests/storage.test.ts`              | New cases for AC8 + AC9.                                                                                                                                  |
| New: `lib/profile-utils.ts` (or co-located)                | Pure helpers for clone-naming (auto-number on collision) and brand-search filtering.                                                                      |

**CLAUDE.md "Never break these" interactions:**

- Rule 11 ("Default profile on first install") still holds — fresh
  installs still create `my-brands` as system + default for both sites.
- Storage backend stays `chrome.storage.local` (Rule 10).
- Session-flag-before-sendMessage (Rule 3) is untouched.
- Adapter behaviour (Rules 5, 6, 7) is untouched.

## Open questions

- Default emoji for a fresh user-created profile: `📁` is fine, but if
  PM/design prefers a different glyph, change in implementation — not
  a functional requirement.
- Should the lock icon also appear on the system profile's row in
  the popup quick-pick when the popup is configured to show only one
  profile at a time? AC10 says yes; if user research later shows it
  is confusing for the quick-pick, we can move it behind a hover
  tooltip.
- The duplicate-confirm modal copy (AC3) is stubbed; final copy at
  VP-Eng / TL discretion.
