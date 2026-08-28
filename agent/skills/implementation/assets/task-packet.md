# Implementation worker task packet

This fillable packet is self-contained. Replace every placeholder before handoff; the
worker must not depend on parent-conversation inheritance or an unavailable plan.
Inline complete excerpts where requested. Do not save the filled packet in the
repository.

## Identity and execution

- Repository root: `<absolute repository root>`
- Working directory: `<absolute worker worktree>`
- Active feature branch: `<branch>`
- Base SHA: `<committed HEAD immediately before this task>`
- Isolation: `worktree`; starting point: committed `HEAD` at Base SHA
- Plan path: `<plan path>`
- Source-spec path: `<source-spec path>`
- Attempt: `<initial | correction N | recovery restart N>`
- Existing baseline: `<complete status, index state, path list, and content identity; preserve byte-for-byte>`

## Task contract

### Goal

`<one-sentence goal>`

### Context and source-spec excerpt

`<relevant context>`

`<complete relevant source-spec text, not a link alone>`

### Exact task section

`<complete current ### Task N: or ### Iteration N: section, including goal, context,
files, steps, verification, evidence, and completion criteria>`

### Applicable guidance

- Paths: `<guidance paths>`
- Relevant text: `<complete relevant guidance text>`

### Dependencies and prior outputs

`<dependency invariants and observable outputs from earlier tasks; write "none" when
there are none>`

## Scope

### Allowed paths

Create or change only these exact paths:

- `<exact allowed path 1>`
- `<exact allowed path 2>`

Permitted generated artifacts: `<none, or exact paths and generation rule>`

### Protected paths

Do not change these paths or any pre-existing dirty path:

- `<exact protected path 1>`
- `<exact protected path 2>`
- `<all plan/checklist, coordinator, configuration, and unrelated paths as applicable>`

Protected baseline status/content: `<identity to recheck before reporting>`

## Required implementation behavior

`<precise task-specific instructions and decisions already made>`

Inspect before editing. Keep implementation minimal and generic. Do not infer missing
requirements from other conversations or silently expand the allowed paths. Do not
modify a protected path to make a check pass.

## Verification

Run every command below from `<working directory>` with environment `<required
environment>`:

```text
<exact command 1>
<exact command 2>
```

Completion criteria to demonstrate: `<observable criteria>`
Report a command as passing only when it was actually run and passed. Report skipped,
failed, or unverifiable commands as such and use a failure result.

## Prohibitions

- Implement only this task; do not re-plan it or edit plan/checklist files.
- Do not stage, commit, amend, merge, rebase, reset, push, switch branches, or
  mutate Git history or refs.
- Do not edit, create, delete, rename, or generate a protected or unexpected path.
- Do not delegate or invoke nested agents or other implementers/reviewers.
- Do not write transcripts, sessions, credentials, secrets, or persistent memory.
- Do not overwrite, discard, or normalize pre-existing baseline work.
- Do not claim a check passed without running it or claim success with a missing
  required result.
- If blocked, stop and report the exact blocker and one safe next action.

For a recovery restart only, the packet may name one validated `pi-agent-*` recovery
ref and permit restoring its path-limited binary delta with `git diff --binary
<Base SHA>...<recovery-ref> | git apply`. Never cherry-pick or merge that ref.

## Worker result (exact schema)

Return exactly this Markdown structure, replacing placeholders:

```markdown
WORKER_RESULT: success|failure
Changed paths:
- <every exact changed path, or none>
Implementation summary:
- <concise item>
Verification:
- <exact command> — PASS|FAIL (<concise evidence>)
Blockers/risks:
- none or <item>
```

After a verification failure, attempt a task-scoped fix and rerun it. Use
`WORKER_RESULT: failure` only if it still fails, cannot be rerun, or needs broader
scope/new decision. List every changed path; do not claim success when a required
check was skipped.
