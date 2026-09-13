---
name: implementation
description: Run every task in a grounded implementation plan, then perform one bounded revmux review of the complete result.
---

# Implementation

The Pi coordinator owns checklists, refs, commits, cleanup, and learning. The
implementation worker is a Pi subagent; review is performed by the external
`revmux` CLI. Read [protocol](references/protocol.md), [worker packet](assets/task-packet.md),
[revmux packet](assets/review-packet.md), [checkpoint](assets/checkpoint.md), and the
[worker contract](../implementation-agent-contract/SKILL.md) before running a plan.

## State machine

For a plan, first implement every unchecked task sequentially, then review the
complete cumulative result:

`select plan → preflight → render packet → worker → validate ref → integrate candidate → verify task → repeat tasks → final whole-plan revmux review/correct (cycles 1-4) → integrate → verify → record → commit → cleanup → learn`.

- **Select:** use the user's plan path; otherwise search the plan directory, then
  `docs/plans/`, `docs/implementation/`, and `docs/implementation-plan.md` for active
  Markdown plans. Select the sole plan; if several, ask one concise
  `ask_user_question` with options/recommendation (plain chat only if unavailable);
  if none, ask for a path. Require `### Task N:`/`### Iteration N:` and enumerate the
  unchecked sections before starting. Do not start revmux while any task remains.
- **Preflight:** read plan/spec/guidance and capture branch, plan/candidate Base SHAs,
  baseline/index, refs, scope, checks, worker reasoning, and review profile. Default to
  external `implementation-codex` from `scripts/materialize-revmux-profile.mjs`: one
  all-lens `gpt-5.6-sol:low` finder, then `gpt-5.6-luna:xhigh` synthesis/verify. Resolve
  its Codex-only roster with `revmux config`; use another profile only on explicit request.
  Require clean index and committed bases; refuse `main`/`master`, protected or detached
  branches, drift, ambiguity, unavailable tools, or baseline conflicts. Stop without
  mutating the baseline.
- **Render packet/worker:** fill the worker packet in memory with the current task,
  cumulative candidate base, context, scope, prohibitions, and checks. Use the exact
  custom worker type, choose `thinking` explicitly from `medium`, `high`, or `xhigh`
  (default `high`), and use foreground worktree execution with persisted sessions and no
  polling. Start initial tasks with a new worker. On interruption or a turn/output limit,
  first resume persisted worker/session/ref when candidate base, baseline, scope, and
  worktree still match; rerun incomplete or affected checks. Use a fresh worker only when
  reuse is unsafe. Never merge transport history. Validate success, ref identity,
  ancestry/no merges, report/path agreement, checks, branch, base, baseline, and scope.
  Reconcile bounded adjacent scope additions; reject every unreconcilable change.
- **Integrate candidate/verify task:** apply only the successful worker's path-limited
  binary delta to the clean coordinator candidate and verify there. Keep it committed for
  the next Base SHA; staging commits are not authoritative and never update checklists or
  the active branch. Continue until every task passes; on failure stop before revmux and
  leave all checklists unchecked.
- **Final whole-plan revmux review/correct:** only after all tasks are implemented and
  verified, create a temporary tasks directory outside the repository, use the paths
  returned by `revmux new`, write a complete whole-plan scope and goal, and run fresh
  JSON review rounds against the exact cumulative candidate ref. Keep the archive and
  profile across rounds. Revmux reviews immutable candidate trees, never a live worker.
  There are at most four total review cycles: cycle 1 is the initial review and cycles
  2-4 are correction-worker/review rounds; resume a matching persisted correction worker
  or validated ref, and use a new worker only when reuse is unsafe. Cycle 4's goal must
  request blocking changes only (material correctness, security, data loss, build/test,
  or release blockers); record non-blocking observations as immaterial. Exit 0 or 1 is a
  completed report; exit 2, invalid/missing JSON, degraded source, unverified finding,
  or open question blocks approval. Confirmed/refined blocking findings prevent approval.
  A final-review correction starts from the latest cumulative candidate, addresses each
  finding or supplies a concrete `Review response`, and Stop/report at cycle 4 if blocked.
  Also stop after three consecutive no-change cycles (byte-identical correction candidates).
- **Integrate/verify:** after a clean review, recheck branch, Plan Base SHA, baseline,
  candidate ref, scope, and report. Apply only the accepted delta; inspect staged scope/
  content/check and run native checks. Stop on malformed review, scope or baseline drift,
  or any blocker.
- **Record/commit/cleanup/learn:** only after final review and all main-tree checks pass,
  change all current-task checkboxes and make one authoritative whole-plan commit; do not
  create task commits before review. Compare-delete only this run's refs, remove the
  external revmux directory, invoke `learn`, and report cleanup mismatches.

## Safety and efficiency

Keep sequential workers, clean-index/committed-candidate boundaries, ref/path/baseline
checks, independent final whole-plan review, main-tree verification, bounded corrections,
and one single authoritative whole-plan commit. Never run revmux between tasks or let it
mutate source, refs, checklists, or commits. Never persist packets, transcripts,
credentials, or runtime state; bound output and retries. Resume persisted state after
provider/timeout/turn/output failure; recover only when reuse is impossible, and stop after
two unchanged failures.

Final review is mandatory after all tasks. A final-review correction uses or resumes a
worker from the latest cumulative candidate, full ref validation, a new review cycle,
accepted-candidate integration, main-tree verification, and the same single authoritative
whole-plan commit. Every checklist mutation and commit requires successful workers, validated deltas, a
non-degraded report with no blocking findings/questions, accepted-candidate integration,
and passing verification. Report plan/branch, SHAs, review cycle, decisions, cleanup,
verification, and unchecked tasks or exactly one resume action.
