---
name: local-changes-review
description: Review current uncommitted and untracked local changes for correctness, quality, best practices, and verification. Use when asked to review local changes, diffs, or implementation progress without a required implementation plan.
---

# Local Changes Review

Use this skill to review uncommitted and untracked local changes without requiring an implementation plan.

## Scope

Review all current uncommitted and untracked local changes when the user explicitly identifies files, requirements, or a task scope. Treat explicit user-provided requirements as the review baseline and do not request a plan.

If the user provides no scope or requirements, stop and call `ask_user_question`:

```json
{
  "question": "What files, change, or requirements should I use as the review scope?",
  "allowFreeform": true,
  "recommendation": "Provide the changed file paths or a short description of the intended behavior."
}
```

## Workflow

1. Identify any explicit user-provided scope or requirements.
2. Inspect all local changes:
   - `git status --short`
   - `git diff HEAD --stat` and `git diff HEAD --name-status` for all tracked changes, including staged changes
   - `git ls-files --others --exclude-standard` to enumerate untracked files
   - focused `git diff HEAD -- <path>` for tracked files
   - file reads or `git diff --no-index -- /dev/null <path> || true` for untracked files
3. Review from these perspectives:
   - correctness and functional behavior
   - contract/spec compatibility where applicable
   - quality, maintainability, boundaries, naming, and simplicity
   - security/privacy requirements where applicable
   - test coverage and relevant verification commands
   - regressions or accidental unrelated changes
4. Run the smallest relevant verification commands when practical.
5. Assess and estimate the finding relevance from 0 to 10. Report only findings with relevance > 8.

## Output format

Be concise and decisive.

Use this structure:

```markdown
Findings:
- [severity] file:line — issue and why it matters

Scope coverage:
- Reviewed: ...
- Missing/partial: ...

Verification:
- `command` — PASS/FAIL

Recommendation: approve / request changes

Proposed commit message: [proposed commit message]
```

If there are no issues, say `Findings: no blocking issues.` and still report scope coverage and verification.

## Review rules

- This is a review skill: do not edit files unless the user explicitly asks to fix issues.
- Prefer exact file paths and line numbers for findings.
- Treat executable contracts and tests as stronger evidence than prose docs when they conflict.
- Do not over-report nits; include only issues that affect correctness, maintainability, security/privacy, or stated scope completion.
- If verification cannot be run, say exactly why.
