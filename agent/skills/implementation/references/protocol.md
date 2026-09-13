# Implementation orchestration protocol

Canonical lifecycle/recovery contract. Packets carry current values; templates
hold reusable fields.

## Canonical vocabulary

| Term | Meaning |
| --- | --- |
| **plan Base SHA** | Committed `HEAD` before the first task. |
| **candidate Base SHA** | Committed candidate `HEAD` before a worker attempt. |
| **baseline** | Complete pre-plan worktree/index state and content identity. |
| **transport ref** | New `pi-agent-*` worker branch; candidate input only. |
| **candidate ref** | Coordinator-owned clean committed ref containing task deltas. |
| **accepted candidate** | Candidate approved by final whole-plan revmux. |
| **authoritative commit** | One coordinator commit from the accepted plan delta. |
| **revmux task/round** | Temporary archive and one final-review execution. |
| **review cycle** | One of four final-review executions: initial 1 or corrections 2-4. |
| **worker reasoning** | Coordinator-selected `medium`, `high`, or `xhigh`; default `high`. |
| **review profile** | Recorded revmux topology; default `implementation-codex` or explicit override. |

## Invariants and ownership

- Tasks are implemented sequentially from the current committed candidate Base SHA.
  Resume an interrupted worker's persisted session/worktree or validated candidate-relative
  delta when base, baseline, and scope match. Never run revmux between tasks or before
  every selected task has passed worker and task verification.
- The coordinator owns checklist, index, branch, candidate refs, integration, commits, and
  cleanup. Plan Base SHA, branch, baseline, and index stay unchanged while building.
- Candidate staging refs/commits are temporary coordinator state: clean and committed for
  the next worker's Base SHA, but not checklist changes, task commits, or approval.
- Keep the fixed worker model/tools/isolation. Choose and record one allowed reasoning
  level per attempt and pass it explicitly to `Agent`.
- A transport ref must be new, descend from its candidate Base SHA, have no merges, agree
  with its report, pass checks, and change only allowed paths or bounded additions. A
  candidate contains only validated cumulative task deltas.
- Revmux is external/read-only and used only for final whole-plan review. It may inspect
  the exact candidate ref but may not edit source/Git/checklists or commit. Its archive
  and report remain outside the repository.
- A completed non-degraded report with no blocking finding/question approves the candidate.
  Exit `0` and `1` are completed reports; exit `2` is a tool failure.
- Failed/rejected/interrupted refs are retained. Compare-delete only refs created by this
  run, after the authoritative plan commit succeeds.
- Default `implementation-codex` is one all-lens `codex/gpt-5.6-sol:low` finder followed
  by `codex/gpt-5.6-luna:xhigh` synthesis and the same verifier. Materialize outside the
  repository, resolve with `revmux config`, require Codex, and never silently substitute.

## Lifecycle and durable-mutation gates

A successful plan follows:
`Ready → Tasks delegated → Candidate built → Tasks verified → Final review requested → Final review approved → Integrated → Verified → Recorded → Committed → Cleaned → Learned`.

| State | Required gates | Durable mutation permitted |
| --- | --- | --- |
| **Ready** | Select plan; enumerate unchecked tasks; read guidance; capture branch, plan Base SHA, baseline, index, scopes, checks, reasoning, and profile. | None |
| **Tasks delegated** | Worker/tools available; launch tasks sequentially from committed candidate Base SHA and resume persisted worker/ref after interruption when valid. | None |
| **Candidate built** | Each worker succeeds; transport ref passes ref/report/path/check/baseline/scope gates; integrate its delta into clean candidate. | Temporary candidate ref/staging commit only. |
| **Tasks verified** | Every selected task passes in the cumulative candidate. | None; do not create a revmux task or round earlier. |
| **Final review requested** | Create external archive; write whole-plan scope/goal from plan Base SHA to exact candidate ref; record cycle/profile; invoke revmux. | None |
| **Final review approved** | Cycle 1-4 exits 0/1; valid JSON; sources complete/non-degraded; no unverified source/finding, open question, or blocking finding. | None |
| **Integrated** | Recheck branch/Base/baseline/candidate/scope/report; apply accepted candidate delta to active branch; inspect staged scope/content/check. | Accepted plan paths may be staged; no checklist mutation. |
| **Verified** | All requested main-tree/native checks pass; protected paths unchanged. | None |
| **Recorded** | Whole-plan criteria observable. | Change all completed task checkboxes; stage plan and accepted task files. |
| **Committed** | Recorded/staged scope/content checks pass. | One authoritative whole-plan commit. |
| **Cleaned** | Commit succeeds and recorded refs match. | Compare-delete this run's refs; remove review archive. |
| **Learned** | Concise evidence ledger and cleanup outcome. | Only user-confirmed learning changes. |

If a task worker or verification fails, stop before final review, retain candidate and
transport refs, and leave all checklists unchecked. Resume first from persisted state or a
validated candidate-relative delta at the unchanged candidate Base SHA. Fresh recovery is
only a fallback when retained state is unavailable or invalid; it consumes no review cycle.

## Bounded scope reconciliation

Before integration or final review, add a path only when the worker reports it under both
`Changed paths` and `Scope additions requested` with an explicit requirement; it is tracked,
baseline-clean, minimal, mechanically required, and not protected/generated/plan/checklist/
credential/runtime/Git/dependency/lockfile/unrelated configuration. All ref, report,
diff-check, verification, branch, index, and baseline gates must pass. Record the lists,
rationale, and evidence in checkpoint and review packets; broad expansion or a missing
worker report path is a scope violation.

## Final whole-plan revmux review contract

For revmux, use `revmux new` paths in an external temporary directory; never create
`.revmux/`. Materialize the profile, resolve `revmux config` with `implementation-codex`,
verify executors, and write non-empty `scope.md`/`goal.md` with plan-Base-to-candidate
commands, scale, paths/reasons, and read-only rules. Invoke with `--workdir`, `--tasks-dir`,
`--task`, `--run`, `--profile`, and `--no-tui`.

Validate task/run, profile/executors, `sources.expected === sources.reported`, empty
`sources.degraded`, arrays for `findings`, `open_questions`, `pre_existing`, and
`immaterial`, required finding fields, and `stats`. Cycles 1-3 request material defects;
Cycle 4 is always the last cycle and requests blocking changes only: correctness, security,
data loss, build/test, or release blockers. Record non-blocking observations as immaterial;
unverified findings, degraded sources, invalid fields, or open questions block approval.
Recheck baseline each run.

## Correction and recovery rules

There are at most **four total review cycles**: cycle 1 initial, cycles 2-4 correction-
worker/review rounds, and no cycle 5. Corrections start from the latest validated cumulative
candidate SHA, not an earlier task Base SHA. Resume a matching worker/ref; use a new one only
when reuse is unsafe. The worker fixes each blocking finding or supplies a concrete `Review
response`; pass responses into the next goal. Keep archive/profile, replace the candidate
only after worker/ref/scope gates pass, and stop/report at cycle 4 if a blocker remains.

Track `no_change_cycles` for byte-identical correction candidates; reset on a validated
change. Stop/report after three consecutive no-change cycles even before cycle 4. Provider,
turn-limit, or incomplete workers resume persisted state or a validated candidate-relative
ref; fresh recovery is only for missing, incompatible, corrupt, or invalid retained state.
A reconstructed worktree may restore only:

```sh
git diff --binary <candidate-base> <recovery-ref> | git apply
git commit  # temporary candidate staging commit, never authoritative
```

Do not cherry-pick, merge, rebase, or use transport history.

## Blocked / resume decision matrix

| Blocker | Required action | One safe resume action |
| --- | --- | --- |
| Missing/malformed worker or CLI | Do not fall back; retain state. | Restore dependency; revalidate preflight. |
| Provider/turn-limit/incomplete worker | Do not review/integrate until complete. | Resume persisted state or validated ref; fresh recovery only if reuse is unsafe. |
| Revmux exit 2, invalid/degraded report, or baseline drift | Do not integrate. | Fix input/environment and rerun from the validated candidate; preserve archive inputs. |
| Confirmed/refined finding or open question | Do not integrate. | Resume compatible correction state, otherwise start one, then run the next cycle. |
| Unreconcilable scope | Reject before integration. | Resolve scope; reuse unaffected work and reconstruct from the relevant candidate Base SHA. |
| Four-cycle limit with blocker | Leave checklists unchecked; retain refs/findings. | User decision or new implementation run; never cycle 5. |
| Three consecutive no-change cycles | Stop automatic correction; retain refs/reports/responses. | User decision or bounded next action. |
| Invalid reasoning/profile/executor | Do not delegate/review or substitute silently. | Select/materialize and record valid input. |
| Branch/index/Base/baseline drift | Stop before integration/checklist/commit. | Restore/record intended state; revalidate. |
| Candidate integration/verification failure | Preserve candidate; do not record/commit. | Repair, rerun, and reapply/revalidate. |
| Cleanup mismatch | Do not force-delete another run's ref. | Compare-delete at recorded SHA after ownership check. |
| Interrupted learning | Do not undo work or persist raw evidence. | Resume learning placement. |

On resume, reread plan/checkpoint, inspect status, and revalidate identifiers and scope
before the named `NEXT_SAFE_ACTION`; do not repeat checks already proven against unchanged
bytes.
