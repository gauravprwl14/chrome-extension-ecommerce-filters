---
name: qa
description: Invoke after implementation is complete and the user wants validation against PRD acceptance criteria, when a QA report is needed before merge, or when the user types /qa. Owns AC validation, test execution, regression checks.
---

# QA

## Purpose

Independently validate that the implementation satisfies the PRD's acceptance criteria. Run the automated suite, list manual verification steps the user must run themselves (we cannot drive Chrome), and write a QA report.

## Inputs

- A feature slug `YYYY-MM-DD-<kebab-name>`.
- Expects `<slug>-prd.md` and (for Large) `<slug>-testplan.md`. Warn if missing.

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

1. Classify size. If Trivial → run `pnpm test` and report pass/fail; no QA report file.
2. Determine the diff scope:
   - If `<slug>-qareport.md` exists, diff against the commit it references.
   - Else, diff against the merge-base with `main`: `git diff $(git merge-base HEAD main)..HEAD`.
3. Read PRD acceptance criteria + test plan.
4. Run the automated gate:
   ```bash
   pnpm typecheck && pnpm lint && pnpm test
   ```
   Capture full output. Do not summarize failures — quote the actual error lines.
5. For DOM-touching changes (adapter, content script, popup, options): produce a manual verification checklist in the report. Format each item so the user can copy-paste it into their browser session.
6. **For Large size**: dispatch the `qa-validator` subagent with the PRD path, test-plan path, the diff output, and the test output. Append its findings under a `## Independent validation` section.
7. Write `docs/superpowers/specs/<slug>-qareport.md` using the template below.

## Output artifact template

```markdown
# <Feature name> — QA Report

**Slug:** `<slug>`
**Validated against commit:** `<sha>`
**Date:** <YYYY-MM-DD>

## Automated gate

- `pnpm typecheck`: PASS | FAIL
- `pnpm lint`: PASS | FAIL
- `pnpm test`: PASS | FAIL (N/M tests)

<If any fail, paste the relevant error block here.>

## Acceptance criteria

| AC  | Status          | Evidence                                                       |
| --- | --------------- | -------------------------------------------------------------- |
| AC1 | Met             | `tests/<file>.test.ts::<name>` passes; manual step 2 confirmed |
| AC2 | Not met         | No code path implements `<behavior>`; see `lib/<file>.ts:42`   |
| AC3 | Met with caveat | Works on Myntra; Ajio variant untested because <reason>        |

## Regressions

<Anything in the diff that might break an existing feature. Cross-reference CLAUDE.md "Core Rules" and "Common Pitfalls".>

## Manual verification — user must run

1. Run `pnpm dev`, reload extension at `chrome://extensions`.
2. Open `<URL>`, expect `<observation>`.
3. …

## Verdict

PASS | PASS with caveats | FAIL
```

## Stop conditions

- After the report is written, summarize the verdict + list manual steps the user still must run. Exit.
