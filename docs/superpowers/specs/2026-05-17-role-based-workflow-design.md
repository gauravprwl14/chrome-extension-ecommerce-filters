# Role-Based Feature Workflow — Design Spec

**Slug:** `2026-05-17-role-based-workflow`
**Status:** Approved (brainstorming complete)
**Owner:** repo-local (`.claude/` directory, checked into git)

---

## Problem

Features in this repo currently land via ad-hoc back-and-forth: long iterative builds, half-baked requirements, missing test coverage, and no consistent moment where someone asks "is this feature actually well-formed?" or "does this respect our engineering principles?". The result is rework, scope drift, and bugs that should have been caught at the spec stage.

We want a repeatable workflow that forces every non-trivial change through four perspectives — Product Owner, VP Engineering, Tech Lead, QA — without becoming bureaucratic for small changes.

## Goals

1. Every Large feature has a written PRD, tech spec, plan, test plan, and QA report before merge.
2. Each role can be invoked independently (`/po`, `/vp-eng`, `/tl`, `/qa`) **or** end-to-end via a single orchestrator (`/feature`).
3. Strictness scales with change size — trivial changes are not blocked by ceremony.
4. Workflow definitions are versioned in the repo so changes are reviewable.
5. Engineering principles from `CLAUDE.md` are explicitly checked at the VP Eng gate, not left to chance.

## Non-goals

- Replacing existing `superpowers:*` skills. We compose with them (`writing-plans`, `executing-plans`, `test-driven-development`, `brainstorming`).
- Enforcing the workflow via git hooks or CI. Enforcement is at the skill level; the user can always override.
- Tracking feature state in a database or manifest file. State is derived from file existence in `docs/superpowers/{specs,plans}/`.
- Driving the Chrome extension UI automatically during QA. Manual verification steps are produced for the user.

---

## Roles

Five roles. All four worker roles are project-scoped skills under `.claude/skills/`. Two have companion subagents under `.claude/agents/` for fresh-context independent review.

| Role                         | Invocation | Form  | Companion subagent                 |
| ---------------------------- | ---------- | ----- | ---------------------------------- |
| Product Owner                | `/po`      | Skill | —                                  |
| VP Engineering               | `/vp-eng`  | Skill | `vp-eng-auditor` (Large size only) |
| Tech Lead                    | `/tl`      | Skill | —                                  |
| QA                           | `/qa`      | Skill | `qa-validator` (Large size only)   |
| Delivery Lead (orchestrator) | `/feature` | Skill | (dispatches the others)            |

### Role responsibilities

**Product Owner** — Writes/updates per-feature PRD and, when business scope shifts, appends to product-wide BRD. Validates the feature against a "good feature" checklist: clear user problem, measurable success metric, explicit scope and non-goals, testable acceptance criteria, impact on existing features.

**VP Engineering** — Reads the PRD, writes the tech spec, validates the proposed approach against project principles documented in `CLAUDE.md` (JSON-schema-first config, no backend, MV3 constraints, `storage.local` 5 MB quota, loop-prevention invariants, content-script sync-ack rule, Ajio brands-host scoping rule, Myntra URL-driven strategy, etc.). For Large features, dispatches an independent `vp-eng-auditor` subagent to review the finished spec in fresh context.

**Tech Lead** — Reads PRD + tech spec, invokes `superpowers:writing-plans` to produce the implementation plan, writes the test plan, then executes via `superpowers:test-driven-development` + `superpowers:executing-plans`. Cross-checks each commit against PRD acceptance criteria.

**QA** — Diffs the work, validates against PRD acceptance criteria, runs `pnpm typecheck && pnpm lint && pnpm test`, generates manual-verification steps for DOM-touching changes, writes a QA report. For Large features, dispatches a `qa-validator` subagent in fresh context for unbiased AC validation.

**Delivery Lead** — End-to-end orchestrator. Takes a feature idea, classifies size, computes the slug, walks the four roles in order with an approval gate (`approve / edit / abort`) after each artifact. Detects existing artifacts for the slug and resumes from the first missing one if re-invoked mid-pipeline.

---

## Artifact layout

All artifacts reuse the existing `docs/superpowers/` tree, distinguished by filename suffix.

```
docs/superpowers/specs/
  YYYY-MM-DD-<slug>-prd.md          ← PO writes
  YYYY-MM-DD-<slug>-techspec.md     ← VP Eng writes (references prd)
  YYYY-MM-DD-<slug>-testplan.md     ← Tech Lead writes
  YYYY-MM-DD-<slug>-qareport.md     ← QA writes

docs/superpowers/plans/
  YYYY-MM-DD-<slug>-plan.md         ← Tech Lead writes (existing writing-plans format)
```

**Slug convention:** `YYYY-MM-DD-<kebab-feature-name>` (e.g., `2026-05-17-amazon-adapter`). Each role accepts the slug as an argument, e.g., `/vp-eng 2026-05-17-amazon-adapter`. The orchestrator generates the slug from the feature idea + today's date.

**State detection:** by file existence — no separate manifest. Each role's precheck looks for the upstream artifact for the slug and warns (per size) if missing.

**Top-level `docs/PRD.md` and `docs/BRD.md`** remain product-wide documents. The PO skill appends a one-line index entry + link whenever it creates a per-feature PRD, so the top-level files double as a feature index. The PO skill updates `docs/BRD.md` only when business scope shifts (new user value prop, new monetization, new compliance surface).

---

## Smart strictness — size classifier

Each role classifies the change before deciding how much ceremony to apply.

| Signal                                               | Trivial | Small | Large        |
| ---------------------------------------------------- | ------- | ----- | ------------ |
| Touches CLAUDE.md "Never break these" rules          | —       | —     | always Large |
| New adapter / new content script / new permission    | —       | —     | Large        |
| New user-facing UI surface (popup tab, options tab)  | —       | Small | —            |
| Bug fix in single file, no behavior change for users | Trivial | —     | —            |
| Selector tweak, copy change, dependency bump         | Trivial | —     | —            |
| Refactor crossing >2 files OR changing public types  | —       | Small | —            |

### Strictness per size

| Size        | PO                                            | VP Eng                                       | Tech Lead                   | QA                                    |
| ----------- | --------------------------------------------- | -------------------------------------------- | --------------------------- | ------------------------------------- |
| **Trivial** | Skip PRD; one-liner in commit msg             | Skip tech spec                               | Skip plan; just TDD         | Skip QA report; just `pnpm test`      |
| **Small**   | Lightweight PRD (problem + AC, ~½ page)       | Lightweight spec (approach + risks, ~1 page) | Plan + test plan            | Verify AC, no formal report           |
| **Large**   | Full PRD; update BRD if business scope shifts | Full tech spec + principles audit (subagent) | Full plan + test plan + TDD | Full validation + qareport (subagent) |

Roles **warn but proceed** when upstream is missing. They do not hard-block — the user can always say "skip the spec, just do it." But for Large changes, the warning is loud and the role offers to invoke the upstream role first.

---

## Role checklists

### `/po` — Product Owner

1. Classify size. If Trivial → suggest a one-line commit message and exit.
2. Read `CLAUDE.md`, `docs/PRD.md`, `docs/BRD.md`, recent feature PRDs in `docs/superpowers/specs/`.
3. Ask 3–5 clarifying questions (problem, user, success metric, scope, non-goals) — one at a time, using `AskUserQuestion`.
4. Write `<slug>-prd.md` with sections: **Problem · Users · Goals · Non-goals · Acceptance Criteria · Impact on existing features · Open questions**.
5. Self-check: AC testable? Success metric measurable? Non-goals explicit? Any conflict with the V0-scope list in `CLAUDE.md`?
6. Append one-line index entry to `docs/PRD.md` (and `docs/BRD.md` if business scope shifted).

### `/vp-eng` — VP Engineering

1. Classify size + check `<slug>-prd.md` exists (warn loudly if Large and missing).
2. Read PRD, `CLAUDE.md` ("Core Rules & Constraints" + "Common Pitfalls"), `lib/adapters/base.ts`, existing similar adapters/code.
3. Write `<slug>-techspec.md` with sections: **Approach · Components/files touched · Data shape changes · Risks · Principles check · Alternatives considered · Test strategy outline**.
4. The **Principles check** explicitly answers: JSON-schema-first preserved? MV3 constraints respected? `storage.local` quota safe (we do not return to `chrome.storage.sync`)? Loop-prevention invariants preserved (session flag stamped before `sendMessage`)? Content-script sync-ack rule preserved? Ajio brands-host scoping rule preserved? Myntra URL-driven strategy preserved?
5. **For Large size**: dispatch `vp-eng-auditor` subagent with PRD + tech spec in fresh context. Append audit findings as a "Independent audit" section to the spec.

### `/tl` — Tech Lead

1. Classify size + check PRD exists; for Large, check tech spec exists.
2. Invoke `superpowers:writing-plans` to produce `plans/<slug>-plan.md` from the tech spec.
3. Write `<slug>-testplan.md`: unit cases, integration cases, manual DOM verification steps (which sites, what selectors to confirm), regression risks.
4. Execute via `superpowers:test-driven-development` + `superpowers:executing-plans`.
5. After each commit, cross-check the diff against PRD acceptance criteria; note any AC not yet satisfied.

### `/qa` — QA

1. Diff since last `<slug>-qareport.md` (or since branch base if none).
2. Read PRD acceptance criteria + test plan.
3. Run `pnpm typecheck && pnpm lint && pnpm test`. Capture output.
4. For DOM-touching changes: produce a manual verification checklist for the user to run in `pnpm dev` (we cannot drive Chrome from here — this is explicit, not a failure).
5. **For Large size**: dispatch `qa-validator` subagent with PRD + diff in fresh context for unbiased AC validation.
6. Write `<slug>-qareport.md`: pass/fail per AC, regressions found, manual-verification checklist still required from the user.

### `/feature` — Delivery Lead (orchestrator)

1. Take feature idea as input. Classify size.
2. Compute slug from today's date + kebab-cased feature name.
3. Detect which `<slug>-*` artifacts already exist; resume from the first missing one.
4. Run `/po` → present PRD → gate: **approve / edit / abort**.
5. Run `/vp-eng` (subagent for Large) → present tech spec → gate.
6. Run `/tl` → present plan + testplan → gate → implement.
7. Run `/qa` (subagent for Large) → present qareport → final gate.
8. Summarize: artifacts created, AC met, manual verification user still needs to do.

---

## Subagents

### `vp-eng-auditor`

- **Purpose:** Independent fresh-context review of a finished tech spec for Large features.
- **Inputs:** path to `<slug>-prd.md`, path to `<slug>-techspec.md`, `CLAUDE.md`.
- **Output:** Markdown audit section with: principle violations found, missing risk considerations, alternative approaches not considered, suggested edits. Returned as a string to be appended to the spec.
- **Tools:** Read, Grep, Glob, Bash (read-only commands), WebFetch (for referencing external standards if needed).

### `qa-validator`

- **Purpose:** Independent fresh-context validation of a finished implementation against PRD acceptance criteria for Large features.
- **Inputs:** path to `<slug>-prd.md`, path to `<slug>-testplan.md`, branch diff, test output.
- **Output:** Per-AC pass/fail with evidence (file:line references or test names), regressions noticed, manual checks the user must still perform.
- **Tools:** Read, Grep, Glob, Bash (read-only + `pnpm test`).

---

## File map (what we will create)

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
    po.md         ← thin wrapper that invokes the skill
    vp-eng.md
    tl.md
    qa.md
    feature.md
```

Slash commands are thin pointers; the actual logic lives in the skills so it is reusable from agents and from the orchestrator.

---

## Testing this workflow itself

We dogfood it. The first real feature shipped after this workflow exists will be put through `/feature` end-to-end. If any role's checklist proves wrong, we update the skill and re-run.

There are no unit tests for skills — they are prose playbooks. Validation is: does invoking `/po` on a real feature produce a PRD that includes all the required sections without prompting the user for the same thing twice? Same question for each other role.

---

## Open questions

None at design-approval time. Anything that surfaces during implementation goes here.
