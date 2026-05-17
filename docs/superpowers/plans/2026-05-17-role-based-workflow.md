# Role-Based Feature Workflow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold five project-scoped roles (Product Owner, VP Engineering, Tech Lead, QA, Delivery Lead orchestrator) as Claude Code skills + two companion subagents + five slash-command wrappers, so any feature can be taken from idea → shipped via a structured workflow.

**Architecture:** Prose playbooks under `.claude/skills/<role>/SKILL.md`, two fresh-context audit subagents under `.claude/agents/`, slash-command pointers under `.claude/commands/`. State is tracked by file existence in `docs/superpowers/{specs,plans}/`. Spec lives at `docs/superpowers/specs/2026-05-17-role-based-workflow-design.md` — refer to it for any content this plan abbreviates.

**Tech Stack:** Markdown + YAML frontmatter. No code, no tests. Validation is done by invoking the skills on a real feature after scaffolding.

---

## File map

Create:

```
.claude/
  skills/
    product-owner/SKILL.md
    vp-engineering/SKILL.md
    tech-lead/SKILL.md
    qa/SKILL.md
    delivery-lead/SKILL.md
  agents/
    vp-eng-auditor.md
    qa-validator.md
  commands/
    po.md
    vp-eng.md
    tl.md
    qa.md
    feature.md
```

Modify:

- `docs/PRD.md` — add "Feature index" trailing section so `/po` has a stable anchor to append to.
- `docs/BRD.md` — add "Feature index" trailing section (same reason).
- `CLAUDE.md` — add a short pointer to the new workflow under a new "## Feature Workflow" section.

No source code changes. No new dependencies.

---

## Conventions used in every SKILL.md

Every skill file uses Claude Code's project-skill format:

```markdown
---
name: <kebab-name>
description: <one sentence describing when to invoke, used by Skill tool matching>
---

# <Title>

## Purpose

<1-2 sentences>

## Inputs

<what the skill expects, e.g., a feature slug or idea>

## Size classifier

<inline copy of the size table from the spec — see Task 2 for exact text>

## Checklist

<numbered steps copied verbatim from spec section "Role checklists">

## Output artifact template

<the markdown skeleton the role writes>

## Stop conditions

<when the skill exits and hands back to the user>
```

The size classifier block is **identical across all five skills**. Task 2 defines it once; later tasks reference "the size classifier block from Task 2" — copy that exact text in.

---

### Task 1: Scaffold directories

**Files:**

- Create: `.claude/skills/product-owner/`, `.claude/skills/vp-engineering/`, `.claude/skills/tech-lead/`, `.claude/skills/qa/`, `.claude/skills/delivery-lead/`, `.claude/agents/`, `.claude/commands/`

- [ ] **Step 1: Create the directory tree**

Run:

```bash
mkdir -p .claude/skills/product-owner .claude/skills/vp-engineering .claude/skills/tech-lead .claude/skills/qa .claude/skills/delivery-lead .claude/agents .claude/commands
```

- [ ] **Step 2: Verify**

Run: `find .claude -type d | sort`
Expected output (exactly):

```
.claude
.claude/agents
.claude/commands
.claude/skills
.claude/skills/delivery-lead
.claude/skills/product-owner
.claude/skills/qa
.claude/skills/tech-lead
.claude/skills/vp-engineering
```

- [ ] **Step 3: Confirm .claude is not gitignored**

Run: `grep -E '^\.claude' .gitignore || echo "not ignored — good"`
Expected: `not ignored — good`

No commit yet — directories are empty and git won't track them. The commit happens after files are added in later tasks.

---

### Task 2: Define the shared "Size classifier" block

This block appears **verbatim** in every SKILL.md. Reference this task by name when later tasks say "paste the size classifier block."

**The exact text to paste** (under a `## Size classifier` heading inside each SKILL.md):

```markdown
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
```

No file created in this task — it's a definition step. The string above is what every later task references.

- [ ] **Step 1: Confirm you have the block memorized / copy-pasteable**

Just re-read the block above. The exact heading is `## Size classifier`, the table has 7 columns spaces / 4 logical columns, and the trailing sentence is "When in doubt, ask the user."

---

### Task 3: Write the Product Owner skill

**Files:**

- Create: `.claude/skills/product-owner/SKILL.md`

- [ ] **Step 1: Write the file with the exact content below**

Create `.claude/skills/product-owner/SKILL.md` with this content:

````markdown
---
name: product-owner
description: Invoke when a user describes a new feature or behavior change before any code is written, when an existing feature needs a PRD created or updated, or when the user types /po. Owns problem definition, user value, acceptance criteria.
---

# Product Owner

## Purpose

Turn a feature idea into a written PRD that defines the problem, the user, success criteria, and explicit non-goals. Refuse to wave hands; ask clarifying questions until the AC are testable.

## Inputs

- A feature idea (free text) OR a slug `YYYY-MM-DD-<kebab-name>`.
- If only an idea is given, compute the slug as `<today's date>-<kebab>` and use it for the output filename.

## Size classifier

[PASTE THE EXACT BLOCK FROM TASK 2 HERE]

## Checklist

1. Classify size using the table above. If **Trivial** → suggest a one-line commit message in the form `fix(scope): summary` or `chore(scope): summary` and exit without writing a PRD.
2. Read `CLAUDE.md` (especially "V0 Scope" and "Out of scope"), `docs/PRD.md`, `docs/BRD.md`, and any recent feature PRDs in `docs/superpowers/specs/` (files matching `*-prd.md`).
3. Ask 3–5 clarifying questions, one at a time, using `AskUserQuestion`. Cover: user problem, target user, success metric, in-scope, explicit non-goals. Stop asking when you can write testable AC.
4. Write `docs/superpowers/specs/<slug>-prd.md` using the template below.
5. Self-check: every AC is a sentence starting with "Given/When/Then" or "The system must …"; success metric is numeric or boolean-observable; non-goals list at least one thing; no AC conflicts with the "Out of scope" list in `CLAUDE.md`.
6. Append a one-line entry to the "Feature index" section of `docs/PRD.md` in the form `- YYYY-MM-DD — [feature name](superpowers/specs/<slug>-prd.md)`.
7. If business scope shifted (new user value prop, new monetization, new compliance surface), append a similar line to the "Feature index" section of `docs/BRD.md` and tell the user which business sections of `docs/BRD.md` they may want to revise.

## Output artifact template

```markdown
# <Feature name> — PRD

**Slug:** `<slug>`
**Size:** Small | Large
**Status:** Draft | Approved
**Owner:** Product

## Problem

<2-4 sentences. Who hurts, when, why.>

## Users

<Primary user. Optional secondary users. Real personas, not "all users".>

## Goals

<Bulleted user-facing outcomes. Not implementation.>

## Success metric

<One numeric or boolean-observable signal. "Brand filters auto-apply within 2s on 95% of Myntra listing loads" — not "users will be happy".>

## Non-goals

<Bulleted. At least one. What we are explicitly NOT doing.>

## Acceptance criteria

1. **AC1:** Given … when … then …
2. **AC2:** …

## Impact on existing features

<Which adapters, storage shapes, popup/options surfaces are affected. Cross-reference CLAUDE.md "Core Rules" if relevant.>

## Open questions

<Anything unresolved.>
```

## Stop conditions

- After writing the PRD and updating the indices, summarize what was created and which AC the user should sanity-check. Exit. Do not invoke another role automatically — that is the orchestrator's job.
````

- [ ] **Step 2: Verify the file parses as valid markdown with frontmatter**

Run: `head -5 .claude/skills/product-owner/SKILL.md`
Expected: starts with `---`, contains `name: product-owner` and `description: …`, ends frontmatter with `---`.

- [ ] **Step 3: Replace the `[PASTE …]` marker**

Open the file and replace the line `[PASTE THE EXACT BLOCK FROM TASK 2 HERE]` with the exact size-classifier block defined in Task 2 (including the `## Size classifier` heading is already in the file — paste only the body starting from "Before doing anything else…" through the trailing sentence).

Run: `grep -c "Touches CLAUDE.md" .claude/skills/product-owner/SKILL.md`
Expected: `1`

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/product-owner/SKILL.md
git commit -m "feat(workflow): add Product Owner skill"
```

---

### Task 4: Write the VP Engineering skill

**Files:**

- Create: `.claude/skills/vp-engineering/SKILL.md`

- [ ] **Step 1: Write the file with the exact content below**

Create `.claude/skills/vp-engineering/SKILL.md` with this content:

````markdown
---
name: vp-engineering
description: Invoke when a PRD is approved and a tech spec is needed, when an existing tech spec needs revision, when reviewing an engineering approach against project principles, or when the user types /vp-eng. Owns approach, principles audit, risk identification.
---

# VP Engineering

## Purpose

Translate a PRD into a tech spec that names files touched, calls out risks, and explicitly checks the proposed approach against the project's non-negotiable engineering principles in `CLAUDE.md`. Has 25+ years of experience; refuses to let shortcuts past the gate.

## Inputs

- A feature slug `YYYY-MM-DD-<kebab-name>`.
- Expects `docs/superpowers/specs/<slug>-prd.md` to exist. If missing and size is Large, warn loudly and offer to invoke `/po` first. If user insists, proceed and note the missing PRD in the spec's "Risks" section.

## Size classifier

[PASTE THE EXACT BLOCK FROM TASK 2 HERE]

## Checklist

1. Classify size. If Trivial → exit with "no tech spec needed; proceed to implementation."
2. Read the PRD, `CLAUDE.md` (especially "Core Rules & Constraints", "Adapter CSS Selectors", and "Common Pitfalls"), `lib/adapters/base.ts`, and the most similar existing adapter or module to what the PRD proposes.
3. Write `docs/superpowers/specs/<slug>-techspec.md` using the template below.
4. The **Principles check** section is mandatory and must answer every question with Yes / No / N/A + one-line justification. Do not delete questions that don't apply — answer N/A.
5. **For Large size**: after writing the spec, dispatch the `vp-eng-auditor` subagent with the PRD path and tech-spec path. Append its output verbatim under a final `## Independent audit` section.

## Output artifact template

```markdown
# <Feature name> — Tech Spec

**Slug:** `<slug>`
**Size:** Small | Large
**Status:** Draft | Approved
**References:** [PRD](./<slug>-prd.md)

## Approach

<2-4 paragraphs. The chosen approach in plain language. Not code.>

## Components / files touched

| File                          | Change                            |
| ----------------------------- | --------------------------------- |
| `lib/adapters/<new>.ts`       | Create — new adapter              |
| `background.ts`               | Modify — register adapter         |
| `lib/config.ts`               | Modify — add `<NewSite>` to Sites |
| `tests/<new>-adapter.test.ts` | Create — unit tests               |

## Data shape changes

<Any change to Config, Profile, Brand, Site, session-flag values, or message payloads. None? Say "None".>

## Risks

<Bulleted. Be specific. "Adapter may fire before brand UL is rendered" not "timing issues".>

## Principles check

Answer each with **Yes / No / N/A** + one sentence.

- **JSON-schema-first config preserved?** (No new ad-hoc storage keys; new state goes in `Config`.)
- **No backend introduced?** (No `fetch` to external services.)
- **MV3 constraints respected?** (No `eval`, no remote code, host permissions justified.)
- **`chrome.storage.local` (not `sync`) used?** (We do not return to `sync` — see `tests/storage-quota.test.ts`.)
- **Loop-prevention invariant preserved?** (Session flag stamped BEFORE `chrome.tabs.sendMessage` in `lib/auto-apply.ts`.)
- **Content-script sync-ack rule preserved?** (Content scripts call `sendResponse({ok:true})` synchronously before doing apply work.)
- **Ajio brands-host scoping rule preserved?** (Any new Ajio query scoped via `findBrandsFacetHost()` or `.more-popup-container`, never bare `.cat-facets X`.)
- **Myntra URL-driven strategy preserved?** (One `window.location.assign()` per apply, not click-per-brand.)
- **Teach-mode XSS rule preserved?** (Any new toast/inline-display uses `textContent`, never `innerHTML`.)

## Alternatives considered

<At least one alternative + why we rejected it.>

## Test strategy outline

<Which unit tests are needed, which integration tests, what manual DOM verification is required.>
```

## Stop conditions

- After writing the spec (and audit for Large), summarize key risks and exit. Do not invoke `/tl` automatically.
````

- [ ] **Step 2: Replace the `[PASTE …]` marker** with the size-classifier block from Task 2.

Run: `grep -c "Touches CLAUDE.md" .claude/skills/vp-engineering/SKILL.md`
Expected: `1`

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/vp-engineering/SKILL.md
git commit -m "feat(workflow): add VP Engineering skill"
```

---

### Task 5: Write the Tech Lead skill

**Files:**

- Create: `.claude/skills/tech-lead/SKILL.md`

- [ ] **Step 1: Write the file with the exact content below**

````markdown
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

[PASTE THE EXACT BLOCK FROM TASK 2 HERE]

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
````

- [ ] **Step 2: Replace the `[PASTE …]` marker** with the size-classifier block from Task 2.

Run: `grep -c "Touches CLAUDE.md" .claude/skills/tech-lead/SKILL.md`
Expected: `1`

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/tech-lead/SKILL.md
git commit -m "feat(workflow): add Tech Lead skill"
```

---

### Task 6: Write the QA skill

**Files:**

- Create: `.claude/skills/qa/SKILL.md`

- [ ] **Step 1: Write the file with the exact content below**

````markdown
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

[PASTE THE EXACT BLOCK FROM TASK 2 HERE]

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
````

- [ ] **Step 2: Replace the `[PASTE …]` marker** with the size-classifier block from Task 2.

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/qa/SKILL.md
git commit -m "feat(workflow): add QA skill"
```

---

### Task 7: Write the Delivery Lead (orchestrator) skill

**Files:**

- Create: `.claude/skills/delivery-lead/SKILL.md`

- [ ] **Step 1: Write the file with the exact content below**

````markdown
---
name: delivery-lead
description: Invoke when a user describes a feature and wants end-to-end execution (PRD → tech spec → plan/impl → QA), when resuming a partially-completed feature pipeline, or when the user types /feature. Owns orchestration and gate approvals.
---

# Delivery Lead (orchestrator)

## Purpose

Run a feature through all four role skills in sequence — Product Owner → VP Engineering → Tech Lead → QA — with a single explicit approval gate after each artifact. Detect and resume from existing artifacts if re-invoked.

## Inputs

- A feature idea (free text) OR a slug `YYYY-MM-DD-<kebab-name>` to resume.

## Size classifier

[PASTE THE EXACT BLOCK FROM TASK 2 HERE]

## Checklist

1. If a slug is given, use it. Else: ask the user for a short kebab name, prepend today's date, and use `<today>-<kebab>` as the slug.
2. Classify size for the feature (ask the user once if unclear; the answer is used by every downstream role).
3. Detect existing artifacts for the slug. State which exist:
   ```
   docs/superpowers/specs/<slug>-prd.md       [exists | missing]
   docs/superpowers/specs/<slug>-techspec.md  [exists | missing]
   docs/superpowers/plans/<slug>-plan.md      [exists | missing]
   docs/superpowers/specs/<slug>-testplan.md  [exists | missing]
   docs/superpowers/specs/<slug>-qareport.md  [exists | missing]
   ```
4. Resume from the first missing artifact. If all exist, ask the user what to do (re-run a specific stage, or exit).
5. **PO gate**: invoke the `product-owner` skill with the slug + idea. When it returns, present the PRD path and ask the user: **approve / edit / abort**. On "edit", relay user feedback to the PO skill and re-run; on "abort", exit.
6. **VP Eng gate**: invoke the `vp-engineering` skill with the slug. For Large size, the skill itself dispatches `vp-eng-auditor`. Present the tech-spec path → ask **approve / edit / abort**.
7. **Tech Lead gate**: invoke the `tech-lead` skill with the slug. When the plan + test plan are written (before implementation begins), present both → ask **approve / edit / abort**. After approval, the Tech Lead skill executes the plan via TDD. After implementation, present the diff summary.
8. **QA gate**: invoke the `qa` skill with the slug. For Large size, the skill dispatches `qa-validator`. Present the QA report → ask **approve / edit / abort**.
9. Final summary: list every artifact created/modified, every AC marked Met, and the manual verification checklist the user still must run in `pnpm dev`.

## Stop conditions

- On user "abort" at any gate, exit cleanly. Do not attempt cleanup of already-created artifacts (they remain as work-in-progress and can be picked up on a future invocation).
- On "approve" at the QA gate, exit with the final summary. Do not commit, push, or open a PR — that is the user's call.

## Notes

- **Never** invoke the next role without an explicit approval at the gate. "It looks fine" from the model is not approval — only the user's response is.
- If the same slug exists with stale dates (e.g., user re-invokes weeks later), keep the original slug. The slug is an identifier, not a calendar.
````

- [ ] **Step 2: Replace the `[PASTE …]` marker** with the size-classifier block from Task 2.

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/delivery-lead/SKILL.md
git commit -m "feat(workflow): add Delivery Lead orchestrator skill"
```

---

### Task 8: Write the vp-eng-auditor subagent

**Files:**

- Create: `.claude/agents/vp-eng-auditor.md`

- [ ] **Step 1: Write the file with the exact content below**

````markdown
---
name: vp-eng-auditor
description: Use to perform an independent fresh-context audit of a finished tech spec for a Large feature. Returns a markdown audit section to be appended to the spec.
tools: Read, Grep, Glob, Bash, WebFetch
---

# VP Engineering Auditor

You are a Principal/Staff-level engineer with 25+ years of experience in browser extensions, Chrome MV3, and DOM-heavy adapters. You have **no prior conversation context** — base your audit only on the files referenced below and the project's `CLAUDE.md`.

## Your task

1. Read `CLAUDE.md` (entire file — especially "Core Rules & Constraints", "Adapter CSS Selectors", "Common Pitfalls", and "Out of scope").
2. Read the PRD and tech-spec paths provided in the user message.
3. Read 1–2 of the most similar existing files in the codebase (e.g., `lib/adapters/myntra.ts` if the spec describes a new adapter).
4. Produce an audit with the sections below. Be specific — quote file paths and line numbers, not generalities.

## Audit output format

Return ONLY this markdown block, ready to append to the spec:

```markdown
## Independent audit

**Auditor:** vp-eng-auditor (fresh context)
**Audited spec:** `<spec path>`
**Date:** <YYYY-MM-DD>

### Principle violations

<Bullet each one. Quote the offending section of the spec. If none, write "None found.">

### Missing risk considerations

<Risks the spec did not list that you would call out. If none, write "None.">

### Alternative approaches not considered

<At least one if the spec only proposed one approach. If the spec already considered alternatives well, write "Adequately considered.">

### Suggested edits

<Concrete, line-level. "Add a sentence under Risks: '<text>'", not "improve the risks section".>

### Verdict

APPROVE | APPROVE WITH EDITS | REWORK
```

## Rules

- Do not edit the spec yourself — return the audit as a string.
- Do not run tests or modify code.
- If the spec references a principle from `CLAUDE.md` incorrectly (paraphrasing or weakening it), flag that explicitly.
- If the spec proposes anything in the "Out of scope" list (Amazon, Nykaa, Flipkart, login/auth, analytics, etc.), flag it and recommend REWORK.
````

- [ ] **Step 2: Verify frontmatter**

Run: `head -7 .claude/agents/vp-eng-auditor.md`
Expected: includes `name: vp-eng-auditor`, `description:`, `tools: Read, Grep, Glob, Bash, WebFetch`.

- [ ] **Step 3: Commit**

```bash
git add .claude/agents/vp-eng-auditor.md
git commit -m "feat(workflow): add vp-eng-auditor subagent"
```

---

### Task 9: Write the qa-validator subagent

**Files:**

- Create: `.claude/agents/qa-validator.md`

- [ ] **Step 1: Write the file with the exact content below**

````markdown
---
name: qa-validator
description: Use to perform an independent fresh-context validation of an implementation against PRD acceptance criteria for a Large feature. Returns a markdown findings section to be appended to the QA report.
tools: Read, Grep, Glob, Bash
---

# QA Validator

You are a senior QA engineer with **no prior conversation context**. You audit only what the files and diff show — you do not trust the implementer's narrative.

## Your task

1. Read the PRD at the path provided (focus on the Acceptance criteria section).
2. Read the test plan at the path provided.
3. Read the diff provided (or run `git diff $(git merge-base HEAD main)..HEAD` if no diff is provided).
4. Re-run the automated gate:
   ```bash
   pnpm typecheck && pnpm lint && pnpm test
   ```
5. For each AC, determine Met / Partial / Not met based on the diff + test output. Cite evidence with `file:line` references or test names.
6. Look for regressions: scan the diff for changes to files listed in `CLAUDE.md` "Core Rules & Constraints" (e.g., `lib/auto-apply.ts`, `lib/adapters/myntra.ts`, `lib/storage.ts`, `contents/*.ts`). If any of those rules might be violated, flag it.

## Output format

Return ONLY this markdown block:

```markdown
## Independent validation

**Validator:** qa-validator (fresh context)
**Validated commit:** `<sha>`
**Date:** <YYYY-MM-DD>

### Automated gate

- `pnpm typecheck`: PASS | FAIL — <error excerpt if FAIL>
- `pnpm lint`: PASS | FAIL — <error excerpt if FAIL>
- `pnpm test`: PASS | FAIL — <N/M tests, error excerpt if FAIL>

### Acceptance criteria

| AC  | Status | Evidence                              |
| --- | ------ | ------------------------------------- |
| AC1 | Met    | `tests/<file>.test.ts::<name>` passes |
| …   | …      | …                                     |

### Regression suspicions

<Concrete suspicions tied to the diff. "Diff at lib/auto-apply.ts:42 moves the session-flag stamp AFTER sendMessage — this risks the loop documented in CLAUDE.md rule #3." If none, write "No regression risks identified.">

### Verdict

PASS | PASS WITH CAVEATS | FAIL
```

## Rules

- Do not modify code or tests.
- Do not run `pnpm dev` (we cannot drive Chrome).
- If a test fails, quote the actual failure message — never paraphrase.
- If the diff modifies any file listed in `CLAUDE.md` "Never break these" section without an obvious justification in the changeset, flag it as a regression suspicion even if tests pass.
````

- [ ] **Step 2: Commit**

```bash
git add .claude/agents/qa-validator.md
git commit -m "feat(workflow): add qa-validator subagent"
```

---

### Task 10: Write the five slash-command wrappers

**Files:**

- Create: `.claude/commands/po.md`, `vp-eng.md`, `tl.md`, `qa.md`, `feature.md`

Each command is a thin pointer — Claude Code reads slash-command files as the user message and the body becomes the prompt. The body simply invokes the matching skill.

- [ ] **Step 1: Write `.claude/commands/po.md`**

```markdown
---
description: Run the Product Owner skill to draft or update a feature PRD
argument-hint: <feature idea OR slug YYYY-MM-DD-name>
---

Invoke the `product-owner` skill via the Skill tool. Pass these arguments through to it: $ARGUMENTS
```

- [ ] **Step 2: Write `.claude/commands/vp-eng.md`**

```markdown
---
description: Run the VP Engineering skill to draft or update a feature tech spec
argument-hint: <slug YYYY-MM-DD-name>
---

Invoke the `vp-engineering` skill via the Skill tool. Pass these arguments through to it: $ARGUMENTS
```

- [ ] **Step 3: Write `.claude/commands/tl.md`**

```markdown
---
description: Run the Tech Lead skill to plan + test-plan + implement a feature
argument-hint: <slug YYYY-MM-DD-name>
---

Invoke the `tech-lead` skill via the Skill tool. Pass these arguments through to it: $ARGUMENTS
```

- [ ] **Step 4: Write `.claude/commands/qa.md`**

```markdown
---
description: Run the QA skill to validate the implementation against the PRD
argument-hint: <slug YYYY-MM-DD-name>
---

Invoke the `qa` skill via the Skill tool. Pass these arguments through to it: $ARGUMENTS
```

- [ ] **Step 5: Write `.claude/commands/feature.md`**

```markdown
---
description: Run the Delivery Lead orchestrator end-to-end (PO → VP Eng → Tech Lead → QA)
argument-hint: <feature idea OR slug to resume>
---

Invoke the `delivery-lead` skill via the Skill tool. Pass these arguments through to it: $ARGUMENTS
```

- [ ] **Step 6: Verify all five command files exist**

Run: `ls .claude/commands/`
Expected (in any order): `feature.md  po.md  qa.md  tl.md  vp-eng.md`

- [ ] **Step 7: Commit**

```bash
git add .claude/commands/
git commit -m "feat(workflow): add /po /vp-eng /tl /qa /feature slash commands"
```

---

### Task 11: Add a "Feature index" section to docs/PRD.md and docs/BRD.md

The PO skill appends a one-line entry per feature into a "Feature index" section. That section must already exist so the appender has a stable anchor.

**Files:**

- Modify: `docs/PRD.md` — append "Feature index" section
- Modify: `docs/BRD.md` — append "Feature index" section

- [ ] **Step 1: Append to `docs/PRD.md`**

Append exactly this block to the very end of `docs/PRD.md` (preserving any trailing newline):

```markdown
---

## Feature index

Each entry below links to a per-feature PRD under `docs/superpowers/specs/`. The PO skill appends new entries here automatically.

<!-- features:start -->
<!-- features:end -->
```

- [ ] **Step 2: Append to `docs/BRD.md`**

Append exactly this block to the very end of `docs/BRD.md`:

```markdown
---

## Feature index

Per-feature business notes for features that shifted business scope. The PO skill appends entries here only when a feature changes user value, monetization, or compliance surface.

<!-- features:start -->
<!-- features:end -->
```

- [ ] **Step 3: Verify**

Run: `grep -c "features:start" docs/PRD.md docs/BRD.md`
Expected:

```
docs/PRD.md:1
docs/BRD.md:1
```

- [ ] **Step 4: Commit**

```bash
git add docs/PRD.md docs/BRD.md
git commit -m "docs: add Feature index anchors to PRD and BRD"
```

---

### Task 12: Add a "Feature Workflow" pointer to CLAUDE.md

Anyone (human or AI) opening this repo should find the workflow from `CLAUDE.md`. Add a short pointer near the end of the file.

**Files:**

- Modify: `CLAUDE.md`

- [ ] **Step 1: Insert the new section**

Insert this block in `CLAUDE.md` immediately **before** the existing `## Common Pitfalls` section (so it appears between "## V0 Scope" and "## Common Pitfalls"):

```markdown
---

## Feature Workflow

Non-trivial changes go through a role-based workflow defined in `.claude/skills/`:

- `/po` — Product Owner: writes per-feature PRD under `docs/superpowers/specs/<slug>-prd.md`
- `/vp-eng` — VP Engineering: writes tech spec, runs principles audit
- `/tl` — Tech Lead: writes plan + test plan, executes via TDD
- `/qa` — QA: validates against acceptance criteria
- `/feature` — Delivery Lead: orchestrates all four with approval gates

Design spec: [`docs/superpowers/specs/2026-05-17-role-based-workflow-design.md`](docs/superpowers/specs/2026-05-17-role-based-workflow-design.md).

Strictness scales with change size (Trivial / Small / Large) — see the size classifier inside any role's `SKILL.md`. Trivial changes (selector tweaks, copy changes) skip the workflow.
```

- [ ] **Step 2: Verify**

Run: `grep -n "## Feature Workflow" CLAUDE.md`
Expected: exactly one match, with a line number less than the line number for `## Common Pitfalls`.

Run: `grep -n "^## " CLAUDE.md | head -20` and confirm the order is `... V0 Scope → Feature Workflow → Common Pitfalls`.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: link CLAUDE.md to new role-based feature workflow"
```

---

### Task 13: Smoke test — list discovered skills and commands

Confirm Claude Code can see the new skills and commands. This is the only verification step before handing back to the user for real-feature dogfooding.

- [ ] **Step 1: List skill files**

Run: `find .claude/skills -name SKILL.md | sort`
Expected:

```
.claude/skills/delivery-lead/SKILL.md
.claude/skills/product-owner/SKILL.md
.claude/skills/qa/SKILL.md
.claude/skills/tech-lead/SKILL.md
.claude/skills/vp-engineering/SKILL.md
```

- [ ] **Step 2: List agent files**

Run: `ls .claude/agents/`
Expected: `qa-validator.md  vp-eng-auditor.md`

- [ ] **Step 3: List command files**

Run: `ls .claude/commands/`
Expected: `feature.md  po.md  qa.md  tl.md  vp-eng.md`

- [ ] **Step 4: Validate all frontmatters parse**

Run:

```bash
for f in .claude/skills/*/SKILL.md .claude/agents/*.md .claude/commands/*.md; do
  echo "=== $f ==="
  head -1 "$f"
  awk '/^---$/{c++; if(c==2){exit}} c>=1' "$f" | head -10
done
```

Expected: every file starts with `---` and shows a frontmatter block containing at least `name:` (skills/agents) or `description:` (commands).

- [ ] **Step 5: Run the full repo gate one more time**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all green (we did not touch any code; this confirms we did not accidentally break anything).

- [ ] **Step 6: Hand back to user**

Print a summary message to the user listing:

- 5 skills created
- 2 subagents created
- 5 slash commands created
- 3 docs updated (PRD, BRD, CLAUDE.md)
- Suggest: "Try `/feature` on a real upcoming change to dogfood the workflow."

No further commit — Task 12 was the last code commit.

---

## Self-review notes

- Every spec section is covered: roles (Tasks 3–7), subagents (Tasks 8–9), artifact layout (already exists; PO/VP/TL/QA write into it), smart strictness (size classifier inlined in every skill via Task 2), slash commands (Task 10), CLAUDE.md integration (Task 12).
- No placeholders — every file's content is fully spelled out except the size-classifier block which is defined once in Task 2 and referenced by name.
- Naming consistency: `product-owner`, `vp-engineering`, `tech-lead`, `qa`, `delivery-lead` used consistently across skill folders, agent names, command bodies, and the orchestrator's invocations.
- No tests for the skills themselves — these are prose playbooks. Validation is dogfooding (Task 13 step 6).
