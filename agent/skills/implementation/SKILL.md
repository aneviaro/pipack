---
name: implementation
description: Run a grounded implementation plan through guarded worker, review, integration, and verification gates.
---

# Implementation

The Pi coordinator owns checklists, index, commits, and cleanup.
See [protocol](references/protocol.md), [worker packet](assets/task-packet.md),
[review](assets/review-packet.md), [checkpoint](assets/checkpoint.md), and [agent
contract](../implementation-agent-contract/SKILL.md).

## State machine

For one pending task, run:
`select → preflight → render packet → worker → validate ref → review/correct → integrate → verify → record → cleanup → learn`.

- **Select:** use the user's plan path; otherwise search the plan directory, then
  `docs/plans/`, `docs/implementation/`, and `docs/implementation-plan.md` for active
  Markdown plans. Select the sole plan; if several, ask one concise
  `ask_user_question` with options/recommendation (plain chat only if unavailable);
  if none, ask for a path. Require `### Task N:`/`### Iteration N:` and use the first
  unchecked section.
- **Preflight:** read plan/spec/guidance; capture branch, Base SHA, status/index/baseline,
  existing `pi-agent-*` refs, exact agents, frozen allowed/protected paths, and checks.
  Require clean index and committed HEAD; refuse `main`/`master`, detached/protected
  branches, drift, ambiguity, unavailable agents, or baseline conflicts. Stop without
  mutating baseline.
- **Render packet/worker:** fill the worker packet in memory with context, scope,
  prohibitions, and checks. Use exact custom types, fresh
  foreground workers, no polling. Recovery restarts restore only a validated binary
  delta from the unchanged Base SHA; never resume or merge transport history.
  Validate success, new ref, ancestry/no merges, scope, report/path agreement, checks,
  branch, and baseline.
- **Review/correct:** fill the review packet and launch a fresh foreground read-only
  `task-reviewer`; only `approve` passes. Material,
  task-scoped, decision-free rejection gets a fresh Base-SHA worker and reviewer.
  Reviewer-requested corrections, including final whole-plan review fixes, allow at
  most three fresh correction workers after the initial attempt/review, plus one
  explicitly user-authorized extra after a blocked resume. Provider/turn-limit failure
  uses recovery, never resume. Stop/report when the correction budget is exhausted.
- **Integrate/verify:** stop on malformed review, scope/baseline/branch drift, or any
  blocker; retain refs and leave checklists unchecked. Recheck gates, apply only the
  accepted path-limited tree delta (never transport history), inspect staged scope,
  content/check, then run every requested main-tree/native check.
- **Record/cleanup/learn:** after verification change only current-task checkboxes and
  make one task-only authoritative commit. Atomically compare-delete only this run's
  refs, invoke
  `learn` with concise evidence, and report cleanup mismatches.

When no tasks remain, run cross-task gates and verify history, index, and files before
the final whole-plan review. A requested final fix uses a fresh isolated worker for the affected task,
from its task base, full worker-result/ref validation, fresh review, accepted-tree
integration, main-tree verification, and a separate authoritative fix commit—never a
direct edit. Apply same three-plus-one budget; stop/report when exhausted. Complete
learning before success. Report plan/branch, commits, decisions, cleanup, verification,
and unchecked tasks or one resume action.

Every checklist mutation and commit requires a successful worker, validated in-scope
Base-SHA ref without merges, fresh approval, accepted-tree integration, and passing
main-tree verification, including every final fix. Never stage early or persist
packets, transcripts, sessions, credentials, or runtime state.
