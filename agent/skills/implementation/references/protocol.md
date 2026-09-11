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

- Tasks are implemented sequentially. Each worker starts from the current committed
  candidate Base SHA. Never run revmux between tasks or before every selected task has
  passed worker and task verification.
- The coordinator owns checklist state, main index, active branch, candidate refs,
  integration, authoritative commits, and cleanup. Plan Base SHA, active branch, baseline,
  and main index stay unchanged while the candidate is built.
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
| **Tasks delegated** | Worker/tools available; launch fresh workers sequentially from committed candidate Base SHA. | None |
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
transport refs, and leave all checklists unchecked. Recovery uses unchanged candidate Base
SHA and a validated binary delta; it consumes no review cycle.

## Bounded scope reconciliation

Before candidate integration or final review, add a path only if the worker reports it
under both `Changed paths` and `Scope additions requested` with an explicit requirement;
it is tracked, baseline-clean, and not protected/generated/plan/checklist/credential/
runtime/Git/dependency/lockfile/unrelated configuration; the diff is minimal and
mechanically required with no new decision; and all ref, report, diff-check, verification,
branch, index, and baseline gates pass. Record initial list, rationale, inspection evidence,
and final list in the checkpoint and final-review packet. Broad expansion or a missing
worker report path is a scope violation.

## Final whole-plan revmux review contract

For the only revmux phase, use exact absolute paths from `revmux new` in a temporary tasks
directory outside the repository; never create `.revmux/` in the repository. From the skill
directory run `scripts/materialize-revmux-profile.mjs <review-root>`, resolve `revmux
config --profile implementation-codex`, and verify executors. Write non-empty `scope.md`
and `goal.md` with plan-Base-to-candidate commands, whole-plan scale, every path/reason,
allowed/protected paths, and read-only rules. Invoke with `--workdir`, external
`--tasks-dir`, `--task`, `--run`, `--profile <review-profile>`, and `--no-tui`, separating
stdout/stderr.

Validate `scope.task`/`run`, profile/executor manifest, `sources.expected ===
sources.reported`, empty `sources.degraded`, arrays for `findings`, `open_questions`,
`pre_existing`, and `immaterial`, required finding fields, and `stats`. Cycles 1-3 request
material defects. Cycle 4 is always the last cycle and its goal requests only blocking
changes: correctness, security, data loss, build/test, or release blockers. Record
non-blocking cycle-4 observations as immaterial. Any unverified finding, degraded source,
invalid field, or open question blocks approval. Recheck the main baseline after every run.

## Correction and recovery rules

There are at most **four total review cycles**: cycle 1 initial, cycles 2-4 fresh
correction-worker/review rounds, and no cycle 5. A final-review correction starts from
the latest validated cumulative candidate SHA, not an earlier task Base SHA. Its fresh
worker fixes each blocking finding or supplies a concrete `Review response`; pass responses
into the next goal but never dismiss findings on the worker's say-so. Keep archive/profile,
and replace the candidate only after worker/ref/scope gates pass. Stop/report at cycle 4
if a blocker remains.

Track `no_change_cycles` for byte-identical correction candidates; reset on a validated
change. Stop/report after three consecutive no-change cycles even before cycle 4. Provider,
turn-limit, or incomplete workers use fresh recovery, never native resume. A safe recovery
may restore only:

```sh
git diff --binary <candidate-base>...<recovery-ref> | git apply
git commit  # temporary candidate staging commit, never authoritative
```

Do not cherry-pick, merge, rebase, or use transport history.

## Blocked / resume decision matrix

| Blocker | Required action | One safe resume action |
| --- | --- | --- |
| Missing/malformed worker or CLI | Do not fall back; retain state. | Restore dependency; revalidate preflight. |
| Provider/turn-limit/incomplete worker | Do not review/integrate. | Fresh recovery from unchanged candidate Base SHA. |
| Revmux exit 2, invalid/degraded report, or baseline drift | Do not integrate. | Fix input/environment or fresh final round from validated candidate. |
| Confirmed/refined finding or open question | Do not integrate. | Fresh correction from latest cumulative candidate in next cycle. |
| Unreconcilable scope | Reject before integration. | Resolve scope; restart from relevant candidate Base SHA. |
| Four-cycle limit with blocker | Leave checklists unchecked; retain refs/findings. | User decision or new implementation run; never cycle 5. |
| Three consecutive no-change cycles | Stop automatic correction; retain refs/reports/responses. | User decision or bounded next action. |
| Invalid reasoning/profile/executor | Do not delegate/review or substitute silently. | Select/materialize and record valid input. |
| Branch/index/Base/baseline drift | Stop before integration/checklist/commit. | Restore/record intended state; revalidate. |
| Candidate integration/verification failure | Preserve candidate; do not record/commit. | Repair, rerun, and reapply/revalidate. |
| Cleanup mismatch | Do not force-delete another run's ref. | Compare-delete at recorded SHA after ownership check. |
| Interrupted learning | Do not undo work or persist raw evidence. | Resume learning placement. |

On resume, reread plan/checkpoint, inspect status, and revalidate identifiers before the
named `NEXT_SAFE_ACTION`.
