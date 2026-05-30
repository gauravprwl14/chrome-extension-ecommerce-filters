# Capture Profile From Page — Design

> Status: approved (2026-05-30). Reverse profile creation: build a profile from
> the brands a user has already selected on a listing page.

## Problem

Today profile creation is one-directional: open Options → create a profile →
add brands. But a user often has _already_ selected brands on Myntra/Ajio. They
should be able to open the popup and turn that live selection into a saved
profile in one step — including brands not yet in the master library.

## Decisions (locked with user, 2026-05-30)

1. **Entry point:** inline panel in the **popup** (never leaves the shopping tab).
2. **Site scope v1:** **Myntra only** (URL-based capture is fully reliable). Ajio
   is a fast-follow — the interface is built now, impl deferred.
3. **New brands:** **highlight + opt-in per brand.** New brands default OFF;
   only toggled-on ones are promoted to master and included. Un-toggled are dropped.
4. **After create:** **just create it** — no set-default, no auto-apply.

## Architecture

The popup/background cannot read page DOM — only a content script can. Capture
adds a **read primitive** symmetric to the existing write path:

```
popup  ──{action:'captureSelection'}──▶  contents/myntra.ts
                                              │ await adapter.readSelectedBrands()
                                              │ sendResponse({ok, isFilterPage, brands})
                                              ▼ return true  (ASYNC channel — see below)
popup  ◀── { brands: string[] } ──────────────┘
   │ reconcileCapturedBrands(strings, masterBrands) → { matched, unknown }
   ▼ user names profile + toggles which unknowns to add
buildCaptureProfile(config, …) → Config   (promotes brands FIRST, then references)
   ▼ setConfig
```

### Critical inversion of Core Rule #4

`applyProfile` acks synchronously then fires async because it **navigates** and
destroys the content script. `captureSelection` is the **opposite**: read-only,
never navigates, and must **return data**. Its handler keeps the channel open
(`return true`) and calls `sendResponse` only _after_ awaiting the read. This
contrast is pinned by a test.

## Components

### `lib/capture.ts` (new, pure)

- `siteSupportsCapture(siteId): boolean` — v1 true only for `myntra`. Gates the
  popup affordance with no round-trip.
- `reconcileCapturedBrands(capturedStrings, masterBrands): { matched: Brand[]; unknown: string[] }`
  — each captured string runs through existing `matchesBrand` (so a variant like
  "Levis"→"Levi's" counts as matched); matched deduped by id; leftovers → unknown.
- `buildCaptureProfile(config, { name, icon, matchedIds, promoteStrings }): Config`
  — enforces the master-first invariant: promote each `promoteStrings` entry into
  `masterBrands` with a unique id, then append the `isSystem:false` profile
  referencing matched ids + newly-promoted ids.

### `lib/profile-utils.ts` (extend)

- `generateUniqueBrandId(name, takenIds): string` — mirrors
  `generateUniqueProfileId`; prevents a new brand's slug silently merging into a
  different existing brand.

### `lib/adapters/base.ts` + `myntra.ts` + `ajio.ts`

- Interface gains `readSelectedBrands(): Promise<string[]>`.
- Myntra: `return this.parseBrandsFromUrl(window.location.href)`.
- Ajio: v1 stub returning `[]` (feature-gated off); real DOM scan is v2.

### `lib/config.ts`

- `CaptureSelectionMessage = { action: 'captureSelection' }`.
- `CaptureSelectionResponse = { ok: true; isFilterPage: boolean; brands: string[] } | { ok: false; reason: string }`.
- Add `CaptureSelectionMessage` to `ExtensionMessage`.

### `contents/myntra.ts`

- Handle `captureSelection`: await `readSelectedBrands()`, `sendResponse`,
  `return true` (async). Distinct from the apply handler's ack-sync path.

### `popup.tsx` + `components/CaptureProfilePanel.tsx` (new)

- `＋ Create profile from this page` button, shown only when
  `siteSupportsCapture(currentSite.id)`.
- Panel: editable suggested name (unique via `generateUniqueProfileId`),
  read-only matched chips, new-brands list with per-brand **Add to library**
  toggle (OFF default), Save/Cancel. Save disabled until name valid/unique AND
  final set (matched + toggled) ≥ 1.
- On Save → `buildCaptureProfile` → `setConfig` → close + refresh.

## Edge cases

| Case                                       | Behavior                                        |
| ------------------------------------------ | ----------------------------------------------- |
| Not a filter page (PDP/home)               | "Open a listing page with brands selected"      |
| Filter page, 0 selected                    | "No brands selected yet"                        |
| All captured already known                 | empty new-brands group                          |
| All captured unknown                       | Save gated until ≥1 toggled                     |
| Variant match (Levis→Levi's)               | counted as matched, not unknown                 |
| Duplicate captured strings                 | deduped by brand id                             |
| New slug collides w/ existing brand        | suffixed `-2`                                   |
| New slug collides w/ another in same batch | suffixed within batch                           |
| Empty/garbage captured string              | skipped (can't slug)                            |
| Profile name collision                     | inline error                                    |
| Content script absent / mid-load           | `sendMessage` rejects → friendly error, no hang |

## Out of scope (v1)

Ajio capture (interface ready, impl v2) · teach-mode/custom-site capture ·
set-as-default / auto-apply after create · duplicate-profile detection.

## Already covered

Delete/edit of captured profiles: they are plain `isSystem:false` user profiles,
handled by the existing `UserProfileCard`. No new work.

## Tests

- `tests/capture.test.ts` — reconcile (match/variant/dedup/unknown);
  `buildCaptureProfile` invariant (promote-before-reference, un-toggled dropped,
  unique ids); `siteSupportsCapture`.
- `tests/profile-utils.test.ts` — `generateUniqueBrandId`.
- `tests/myntra-adapter.test.ts` — `readSelectedBrands` from URL / empty.
- `tests/integration/popup-flow` (or content test) — tripwire: `captureSelection`
  uses async `return true`; full capture→review→save creates a user profile and
  promotes only toggled unknowns.
