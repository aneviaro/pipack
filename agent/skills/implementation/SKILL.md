---
name: implementation
description: Run a grounded implementation plan through guarded worker, revmux review, integration, and verification gates.
---

# Implementation

The Pi coordinator owns checklists, refs, commits, cleanup, and learning. The
implementation worker is a Pi subagent; review is performed by the external
`revmux` CLI. Read [protocol](references/protocol.md), [worker packet](assets/task-packet.md),
[revmux packet](assets/review-packet.md), [checkpoint](assets/checkpoint.md), and the
[worker contract](../implementation-agent-contract/SKILL.md) before running a task.

## State machine

For one pending task, run:
`select → preflight → render packet → worker → validate ref → revmux review/correct → integrate → verify → record → cleanup → learn`.

- **Select:** use the user's plan path; otherwise search the plan directory, then
  `docs/plans/`, `docs/implementation/`, and `docs/implementation-plan.md` for active
  Markdown plans. Select the sole plan; if several, ask one concise
  `ask_user_question` with options/recommendation (plain chat only if unavailable);
  if none, ask for a path. Require `### Task N:`/`### Iteration N:` and use the first
  unchecked section.
- **Preflight:** read plan/spec/guidance; capture branch, Base SHA, status/index/baseline,
  existing `pi-agent-*` refs, exact worker, revmux, and required child-CLI availability,
  initial allowed paths, frozen hard-protected paths, checks, and the selected worker
  reasoning level. Require clean index and
  committed HEAD; refuse `main`/`master`, detached/protected branches, drift, ambiguity,
  unavailable worker/revmux/CLI, or baseline conflicts. Stop without mutating baseline.
- **Render packet/worker:** fill the worker packet in memory with context, scope,
  prohibitions, and checks. Use the exact custom worker type, choose `thinking` explicitly
  from `medium`, `high`, or `xhigh` (default `high`), and use fresh foreground worktree
  execution with no polling. Recovery restarts restore only a validated binary delta from
  the unchanged Base SHA; never resume or merge transport history. Validate success, new
  ref, ancestry/no merges, report/path agreement, checks, branch, and baseline. Reconcile
  a reported minimal adjacent tracked path under the protocol's bounded gate instead of
  restarting solely because preflight omitted it; reject every unreconcilable scope change.
- **Revmux review/correct:** create a temporary tasks directory outside the repository,
  use the paths returned by `revmux new`, write a complete scope and goal, and run a fresh
  `revmux` JSON review against the exact transport ref. Revmux must run with `--workdir`
  set to the repository and its archive must remain in the temporary directory. Keep the
  worker and review sequential: revmux reviews immutable transport trees, never a live
  worker candidate. Exit 0 or 1 is a completed report; exit 2, invalid/missing JSON, a
  degraded source, an unverified finding, or an unresolved open question blocks approval.
  Revmux-requested corrections use a fresh worker from the unchanged Base SHA and a fresh
  revmux round. The worker may push back with a concrete `Review response`, which is passed
  to the next revmux goal but never silently accepted. Track unchanged candidates and
  stop/report after three consecutive no-change cycles. Record the chosen reasoning level in
  the packet and checkpoint. Otherwise allow at most three fresh correction workers after
  the initial attempt, plus one explicitly user-authorized extra cycle after a blocked
  resume. Stop/report when the correction budget is exhausted.
- **Integrate/verify:** stop on malformed review, unreconciled scope, baseline/branch drift,
  or any blocker; retain refs and leave checklists unchecked. Recheck gates, apply only the
  accepted final-allowed-path tree delta (never transport history), inspect staged scope,
  content/check, and run every requested main-tree/native check.
- **Record/cleanup/learn:** after verification change only current-task checkboxes and make
  one task-only authoritative commit. Compare-delete only this run's refs, remove the
  temporary revmux directory outside the repository, invoke `learn` with concise evidence,
  and report cleanup mismatches.

## Safety and efficiency

Preserve sequential tasks, clean-index boundaries, unrelated dirty files, committed-HEAD
worktree bases, ancestry/no-merge/path checks, independent revmux review, main-tree
verification, bounded corrections, and one authoritative task commit. Never let revmux
edit source, integrate refs, update checklists, or commit. Never persist packets,
transcripts, credentials, or runtime state in a repository. Bound verbose output and do
not repeat expensive checks during retries. If the same unchanged setup/test/contract
failure repeats twice, stop and report it. Provider, timeout, turn-limit, or output-limit
failures use recovery, not native resume.

When no tasks remain, run cross-task gates and verify history, index, and files before the
final whole-plan revmux review. A requested final fix uses a fresh worker from its task
base, full ref validation, a fresh revmux round, accepted-tree integration, main-tree
verification, and a separate authoritative fix commit. Apply the same three-plus-one
budget; stop/report when exhausted. Complete learning before success.

Every checklist mutation and commit requires a successful worker, validated or
scope-reconciled Base-SHA ref, a completed non-degraded revmux report with no blocking
findings or questions, accepted-tree integration, and passing main-tree verification.
Report plan/branch, commits, review task/run, decisions, cleanup, verification, and
unchecked tasks or one resume action.
