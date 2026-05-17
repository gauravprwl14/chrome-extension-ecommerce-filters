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
