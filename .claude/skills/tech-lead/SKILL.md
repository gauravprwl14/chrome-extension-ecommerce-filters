---
name: tech-lead
description: Invoke when a PRD (and for Large, a tech spec) exists and implementation should begin, when an implementation plan needs writing, when a test plan is needed, or when the user types /tl. Owns plan + test plan + TDD execution.
---

# Tech Lead

## Purpose

Take an approved PRD + tech spec, produce an implementation plan via `superpowers:writing-plans`, write the test plan, then execute via TDD. Cross-check every commit against PRD acceptance criteria.

## Inputs

- A feature slug `YYYY-MM-DD-<kebab-name>`.
- Expects `<slug>-prd.md`; for Large, also expects `<slug>-techspec.md`. Warn if missing and offer to invoke upstream role; if user insists on proceeding, log the gap in the test plan's "Known risks" section.

## Size classifier

Before doing anything else, classify the change as Trivial, Small, or Large using this table. The classification determines how much ceremony applies.

| Signal                                               | Trivial | Small | Large        |
| ---------------------------------------------------- | ------- | ----- | ------------ |
| Touches CLAUDE.md "Never break these" rules          | —       | —     | always Large |
| New adapter / new content script / new permission    | —       | —     | Large        |
| New user-facing UI surface (popup tab, options tab)  | —       | Small | —            |
| Bug fix in single file, no behavior change for users | Trivial | —     | —            |
| Selector tweak, copy change, dependency bump         | Trivial | —     | —            |
| Refactor crossing >2 files OR changing public types  | —       | Small | —            |

Take the highest-strictness row that fires. When in doubt, ask the user.

## Checklist

1. Classify size. If Trivial → skip plan + test plan; jump to step 4 (TDD) directly.
2. Read PRD, tech spec, `CLAUDE.md`. Note the AC list — you will check the diff against it after every commit.
3. Invoke `superpowers:writing-plans` to produce `docs/superpowers/plans/<slug>-plan.md`. Use the tech spec's Approach + Components as input.
4. Write `docs/superpowers/specs/<slug>-testplan.md` using the template below.
5. Execute the plan via `superpowers:test-driven-development` + `superpowers:executing-plans` (or `superpowers:subagent-driven-development` for plans with independent tasks).
6. After each commit, run the AC cross-check: list each AC and mark Met / Partial / Not yet. If any AC is "Not yet" after the final commit, do not claim done — either implement it or open a follow-up note.
7. Run `superpowers:verification-before-completion` before declaring the feature implemented.

## Output artifact template

```markdown
# <Feature name> — Test Plan

**Slug:** `<slug>`
**References:** [PRD](./<slug>-prd.md), [Tech Spec](./<slug>-techspec.md), [Plan](../plans/<slug>-plan.md)

## Unit tests

| File                          | What it verifies                          | Maps to AC |
| ----------------------------- | ----------------------------------------- | ---------- |
| `tests/<new>-adapter.test.ts` | applyBrands returns notFound when missing | AC2        |
| …                             | …                                         | …          |

## Integration tests

<Cross-module flows. Reference `tests/integration/` for layout examples.>

## Manual DOM verification

<We cannot drive Chrome from here. List explicit user-side steps:>

1. Run `pnpm dev`, load the unpacked extension.
2. Open `<URL>`, observe `<expected DOM change>`.
3. Verify console has no error matching `<pattern>`.

## Known risks

<Anything the tests won't catch. Be honest.>

## AC traceability

| AC  | Covered by                                     |
| --- | ---------------------------------------------- |
| AC1 | `tests/<file>.test.ts::<name>` + manual step 1 |
| AC2 | `tests/<file>.test.ts::<name>`                 |
```

## Stop conditions

- After implementation is done and all AC are Met (or explicitly deferred with user approval), summarize the diff and exit. Do not invoke `/qa` automatically.
