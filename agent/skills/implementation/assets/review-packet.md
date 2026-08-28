# Task review packet

This fillable packet is self-contained. Replace every placeholder before handoff to
a fresh read-only reviewer; the reviewer must not depend on parent-conversation
inheritance. Do not save the filled packet in the repository.

## Identity and ref evidence

- Repository root: `<absolute repository root>`
- Active feature branch: `<branch>`
- Base SHA: `<task Base SHA>`
- Plan path: `<plan path>`
- Source-spec path and complete relevant excerpt: `<path>` / `<complete excerpt>`
- Exact task section: `<complete current task section>`
- Allowed paths: `<complete frozen list>`
- Protected paths and baseline: `<complete list and status/index/content identity>`
- Dependency invariants: `<relevant invariants and prior outputs>`
- Worker attempt: `<attempt identifier>`
- Transport ref: `<exact newly created pi-agent-* ref>`
- Transport SHA: `<recorded ref SHA>`
- Changed paths: `<exact output of git diff --name-only Base SHA...Transport ref>`
- Worker report: `<complete concise worker report>`
- Worker verification evidence: `<commands and results>`

The coordinator has validated that the worker reported success, the ref is new, it
has Base SHA ancestry and no merges, its delta is in scope, and the main branch,
index, and baseline have not drifted. Treat those as evidence to recheck, not as a
substitute for inspection.

## Read-only inspection

Run these from `<repository root>`, substituting the supplied identifiers:

```sh
git diff --name-status <Base SHA>...<Transport ref>
git diff --check <Base SHA>...<Transport ref>
git diff <Base SHA>...<Transport ref>
# Repeat for every changed path:
git show <Transport ref>:<changed-path>
git merge-base --is-ancestor <Base SHA> <Transport ref>
test -z "$(git rev-list --merges <Base SHA>..<Transport ref>)"
```

Inspect the complete content of every changed path, not only a patch excerpt. Compare
the tree with the exact task, source spec, packet prohibitions, dependency invariants,
and protected baseline. Do not use `write`, `edit`, staging, commits, ref mutation,
cleanup, or any other Git mutation. A missing, unavailable, contradictory, out-of-
scope, or unverified input is a finding; do not silently repair it.

## Review coverage and criteria

Check and record concise evidence for each criterion:

1. **Task coverage:** the goal, every required step, source-spec requirement, and
   completion criterion are implemented; no later task is included.
2. **Protocol correctness:** packet semantics, lifecycle gates, correction/recovery,
   blocker/resume behavior, and required exact labels or schemas are unambiguous and
   internally consistent.
3. **Scope:** changed paths equal the allowed list (or an explicitly permitted
   subset); no protected, generated, unrelated, plan, or checklist path changed.
4. **Correctness and regressions:** content is precise, simple, repository-native, and
   does not weaken an existing safety gate.
5. **Security/privacy:** no credentials, secrets, transcripts, sessions, persistent
   runtime memory, or unsafe instructions were added.
6. **Verification:** requested checks have credible passing evidence, and the delta
   has no whitespace, ancestry, or merge-history defect.

Material findings must include path and line (or command), severity, and a concrete
required correction. Distinguish a missing check from an optional improvement. A
reviewer is not authorized to edit or make an implementation decision.

## Reviewer result (exact schema)

Return exactly this Markdown structure:

```markdown
REVIEW_RESULT: approve|request changes
Findings:
- none or <path:line; severity; required correction>
Task/plan coverage:
- <concise evidence>
Verification evidence:
- <exact command> — PASS|FAIL (<concise evidence>)
Recommendation: approve|request changes
```

Use `REVIEW_RESULT: request changes` and `Recommendation: request changes` for any
material task-scoped defect, scope violation, missing required evidence, or failed
inspection. Use `approve` only when all criteria pass. Do not edit files or claim to
have run a command that was not run.
