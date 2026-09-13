# Final whole-plan revmux review packet

Contract for the only read-only revmux phase. Keep inputs and reports outside the
repository. Revmux reviews the complete cumulative candidate only after every task is
implemented and verified; it never reviews an individual task.

## Identity and ref evidence

- Repository root / `--workdir`: `<absolute repository root>`
- Active feature branch: `<branch>`
- Plan Base SHA: `<committed HEAD before the first plan task>`
- Candidate Base SHA: `<committed cumulative candidate SHA before this round>`
- Plan/spec/task set: `<paths and complete relevant excerpts>`
- Review cycle: `<1 | 2 | 3 | 4>` (`1` initial; `2-4` corrections)
- Worker attempt: `<all tasks complete | final correction N>`
- Worker reasoning: `<medium | high | xhigh>` (coordinator-selected)
- Review profile: `<implementation-codex | explicit user override>`
- Resolved review executors: `<exact unique executor names from revmux config>`
- Consecutive no-change correction cycles: `<number before this round>`
- Candidate ref and recorded SHA: `<coordinator candidate ref / SHA>`
- Changed paths: `<exact git diff --name-only PlanBase...Candidate output>`
- Initially allowed paths: `<union of every task's initial list>`
- Scope additions: `<none, or rationale plus coordinator inspection evidence>`
- Final allowed paths: `<complete union of allowed paths>`
- Hard-protected paths/baseline: `<paths and status/index/content identity>`
- Task worker reports and verification: `<concise ledger for every task>`
- Revmux temporary tasks directory: `<absolute path outside repository>`
- Revmux task id / round: `<safe id> / <NN-label>`

## Preflight and round creation

Do not create a review task until every selected task has a successful worker result,
validated candidate integration, and passing task verification. Default to
`implementation-codex`: materialize it outside the repository with
`scripts/materialize-revmux-profile.mjs <review-root>`, then run `revmux config --profile
implementation-codex` from that root. Require the resolved one-agent Sol-low finder and
Luna-xhigh synthesis/verify topology plus Codex availability. Use another profile only on
explicit user request; record and never silently substitute it. Use only absolute paths
returned by `revmux new`; never create repository `.revmux/`:

```sh
review_root=$(mktemp -d)
revmux new --tasks-dir "$review_root/tasks" --task "<whole-plan-task-id>" --run "<NN-label>"
```

Write non-empty `scope.md` and `goal.md` at the returned paths. Write `profile.md` only
for an explicit review-bar override. Fill a blank task template only with the whole-plan
description, never repository runtime state.

## Required round input

`scope.md` must contain bullets and plain command blocks with the exact whole-plan subject
and scale; these commands; every changed path and why it matters; the union of task
allowed paths, additions, protected paths, and baseline identity; and this instruction:
inspect only, never edit/write/stage/commit/mutate refs, and do not treat worker or
coordinator claims as approval. It must state that no task-level revmux review occurred
or is required.

```sh
git diff <Plan Base SHA>...<Candidate ref>
git diff --check <Plan Base SHA>...<Candidate ref>
```

`goal.md` must contain the complete goal, observable criteria, current cycle, and bar.
Cycles 1-3 ask for material defects. Cycle 4 asks for **blocking changes only**:
correctness, security, data loss, build/test, or release blockers. Non-blocking cycle-4
observations are immaterial and must not trigger another correction.

## Invocation

Run from a temporary directory or otherwise ensure project `.revmux/` is not used. The
reviewed repository is supplied as `--workdir`; the archive stays outside it. Separate
stdout/stderr:

```sh
revmux --tasks-dir "<review_root>/tasks" \
  --workdir "<repository root>" \
  --task "<whole-plan-task-id>" --run "<NN-label>" \
  --profile "<review-profile>" --no-tui \
  > "<review_root>/report.json" 2> "<review_root>/progress.log"
```

Exit `0` is a completed clean report; exit `1` is completed with findings. Exit `2`,
missing/invalid JSON, or a CLI error blocks review; never retry exit `1` as tool failure.

## Required JSON validation and decision mapping

Read the report as JSON and require:

- `scope.task`/`run` match invocation and the archive manifest resolves the recorded
  profile/executors;
- `sources.expected === sources.reported` and `sources.degraded` is empty;
- `findings`, `open_questions`, `pre_existing`, and `immaterial` are arrays;
- every finding has `file`, `line`, `severity`, `confidence`, `title`, `body`, `fix`, and
  `verdict`, where `verdict` is `confirmed`, `refined`, or `unverified`;
- `stats` exists and post-review status, index, Plan Base SHA, and protected baseline
  match preflight.

On cycles 1-3, confirmed/refined material findings block approval. On cycle 4, only
confirmed/refined **blocking** findings request correction; record non-blocking findings
as immaterial. Any unverified finding, degraded source, invalid field, or unresolved
`open_questions` blocks approval, including cycle 4. `pre_existing` and `immaterial`
findings are recorded separately. A correction worker's `Review response` is evidence,
not permission to dismiss a finding; pass it to the next goal. Approval requires no
blocking item and a cycle from 1-4. Never run a fifth cycle.

Checkpoint the report path, cycle, and counts; never persist prompts, logs, transcripts,
or credentials in repository files.

## Correction rounds

Keep the same temporary tasks directory and profile. Cycle 1 is the initial review; cycles
2-4 use a fresh round such as `02-correction-01` and the latest validated cumulative
candidate SHA as Base SHA. Resume matching correction state; use a new worker only when
reuse is unsafe. Do not paste prior findings into `scope.md`; put unchanged-finding
`Review response` evidence in `goal.md`. The new candidate must retain
the complete Plan Base-to-candidate delta and pass worker/ref/scope gates.

Compare it with the preceding reviewed candidate: reset `no_change_cycles` on a real
change and increment it when byte-identical. Stop after three consecutive no-change
cycles or at cycle 4, whichever comes first. Cycle 4 requests only blocking changes. A
rejected/blocked candidate is never integrated; there is no cycle 5.

## Read-only prohibitions

Revmux and its subprocesses may inspect only the repository and cumulative candidate ref.
They must not modify source, plans, checklists, Git refs, index, worktrees, credentials,
sessions, or runtime state. After every run, recheck the main baseline; if it changed,
stop before candidate replacement/final integration and retain the candidate/archive.
