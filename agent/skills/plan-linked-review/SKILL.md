---
name: plan-linked-review
description: Review current local changes for correctness, quality, and best practices against a required implementation plan link or path. Use when asked to review local changes, diffs, or implementation progress against a plan/spec step. If no plan link/path is provided, use ask_user_question before reviewing.
---

# Plan-Linked Review

Use this skill to review uncommitted local changes against a specific implementation plan.

## Required input

A plan link or path is mandatory, for example:

- `@docs/plans/20260630-calendar-api-backend-implementation.md`
- `docs/plans/some-plan.md`
- a URL to a plan/spec document

If the user asks for this review without a plan link/path, stop and call `ask_user_question`:

```json
{
  "question": "Please provide the plan link or path to review these changes against.",
  "allowFreeform": true,
  "recommendation": "Paste the docs/plans/... path or URL for the implementation plan."
}
```

Do not infer the plan from recent context unless the user explicitly named it in the current request.

## Workflow

1. Read the referenced plan.
2. Identify the requested step/task/phase.
   - If the user specifies a step (for example, `1st step`, `Task 2`, `Phase 1`), review only that scope.
   - If no step is specified, review against the whole plan.
3. Inspect local changes:
   - `git status --short`
   - `git diff --stat`
   - `git diff --name-status`
   - focused `git diff` / file reads for changed files
4. Compare implementation against the plan requirements and completion criteria.
5. Review from these perspectives:
   - correctness and functional behavior
   - contract/spec compatibility
   - quality, maintainability, boundaries, naming, and simplicity
   - security/privacy requirements from the plan
   - test coverage and verification commands
   - regressions or accidental unrelated changes
6. Run the smallest relevant verification commands from the plan when practical.
7. Assess and estimate the finding relevance from 0 to 10. Report only the findings with relevance > 8.

## Output format

Be concise and decisive.

Use this structure:

```markdown
Findings:
- [severity] file:line — issue and why it matters

Plan coverage:
- Implemented: ...
- Missing/partial: ...

Verification:
- `command` — PASS/FAIL

Recommendation: approve / request changes

Proposed commit message: [proposed commit message]
```

If there are no issues, say `Findings: no blocking issues.` and still report plan coverage and verification.

## Review rules

- This is a review skill: do not edit files unless the user explicitly asks to fix issues.
- Prefer exact file paths and line numbers for findings.
- Treat executable contracts and tests as stronger evidence than prose docs when they conflict.
- Do not over-report nits; include only issues that affect correctness, maintainability, security/privacy, or plan completion.
- If verification cannot be run, say exactly why.
