---
name: learn
description: Update project AGENTS.md with strategic knowledge discovered during this session. Defers to project-defined memory-placement guidance when present. Use when the user says "learn", "save knowledge", "update agents.md", "capture learnings", or at the end of significant work sessions.
---

# Learn

Review the current conversation history and capture reusable project knowledge in the project's `AGENTS.md` file.

This skill updates project memory only. Do not write to global user memory unless the user explicitly asks for a global instruction update.

## Goal

Preserve knowledge that will help future agents understand, modify, test, debug, or operate this project faster.

## Analysis Process

1. Review what happened in the session:
   - files read or modified;
   - commands run;
   - patterns discovered while completing the task;
   - architectural or operational insights gained from repository exploration.
2. Extract strategic knowledge:
   - filter out tactical details about the exact bug, feature, or one-off edit;
   - keep reusable patterns, conventions, commands, paths, integrations, and gotchas;
3. Categorize findings:
   - project architecture and structure;
   - data flow patterns;
   - external service integrations;
   - project-specific conventions;
   - key dependencies and their purposes;
   - configuration patterns;
   - testing strategies;
   - build and deployment processes;
   - operational knowledge such as debugging commands and environment quirks.

## Destination

Default destination: the project `AGENTS.md` loaded from the current working tree.

Use this decision order:

1. If project or user guidance defines where learned knowledge belongs, follow that guidance.
2. Otherwise update the project `AGENTS.md` in the current repository or working directory.
3. If no project `AGENTS.md` exists, create one at the project root or current working directory root that Pi is operating in.
4. Do not update other harness-specific memory files as part of this skill.

Default ambiguous cases to project `AGENTS.md`; project-visible knowledge should not be hidden in local-only files.

## What Qualifies

Include strategic discoveries from this session:

- architectural patterns uncovered while working;
- project structure insights gained from navigation;
- conventions noticed across multiple files;
- integration patterns discovered;
- configuration approaches identified;
- testing strategies observed;
- build and deployment processes encountered;
- performance optimizations found;
- security implementations discovered;
- operational knowledge:
  - database locations and connection details per environment;
  - useful queries discovered during debugging;
  - testing procedures and verification steps;
  - deployment workflows and commands;
  - log locations and monitoring endpoints;
  - environment-specific quirks and gotchas.

Exclude session-specific tactical work:

- the specific bug fixed;
- the particular feature implemented;
- temporary workarounds used during the session;
- one-off code changes;
- TODO items merely encountered;
- historical commentary about the current change.

## Decision Criteria

For each possible discovery, ask:

- Will this help understand the project in six months?
- Is this a pattern that appears multiple times?
- Does this represent a project-wide convention?
- Would knowing this speed up future development?
- Would this save debugging or operations time later?

## Workflow

### 1. Check Existing Memory-Placement Guidance

Before applying the destination rules, inspect the minimum necessary context for placement guidance:

- project `AGENTS.md` files loaded from the current working tree;
- `.pi/` or `.agents/` rules/guidance files if they exist;
- global Pi guidance if already available in the session.

If guidance defines a memory placement workflow, follow it instead of this skill's defaults.

### 2. Check Existing Memory Content

Read the target `AGENTS.md` and any other documented memory files needed to avoid duplication.

Do not duplicate knowledge that is already captured in equivalent form.

### 3. Early Exit if Nothing Found

If no new strategic knowledge was discovered during this session, report:

```text
no new strategic knowledge to capture
```

Then stop. Do not ask for confirmation.

### 4. Classify Discoveries

For each new discovery, determine its destination using the project guidance and destination rules above.

### 5. Present Proposed Knowledge

Show the proposed additions grouped by destination before editing:

```markdown
## [Section Name] → project AGENTS.md
- Discovery 1
- Discovery 2
```

Keep each bullet concise and durable.

### 6. Ask for Confirmation

Pi does not provide a dedicated multiple-choice question tool. Ask the user in chat and wait for their answer.

Use granular choices:

- First option: save all proposed knowledge.
- Middle options: individual knowledge items, up to the most significant two or three.
- Last option: save none.
- Allow a custom comma-separated selection by item number.

Example with multiple discoveries:

```text
Which knowledge should I save?
1. All (3 items)
2. Service discovery pattern → project AGENTS.md
3. Local build runner convention → project AGENTS.md
4. None
Reply with a number or comma-separated item numbers.
```

Example with one discovery:

```text
Save this knowledge?
1. Yes → project AGENTS.md
2. No
```

After the user selection:

- `All` saves everything to the inferred destination.
- `None` ends without saving.
- Specific item numbers save only those items to their inferred destinations.
- Custom selections choose which discoveries to save, not where to save them. Routing still follows the inferred destination unless the user gives an explicit, compatible instruction.

### 7. Edit Memory Files

Use `edit` for precise updates to existing files. Use `write` only when creating a new `AGENTS.md` or when a complete rewrite is clearly smaller and safer than targeted edits.

Preserve existing structure and tone. Prefer adding bullets under the closest existing heading. Create a short heading only when no suitable section exists.

## Behavior Rules

- Capture only genuinely new discoveries from this session.
- Keep entries short, specific, and actionable.
- Focus on patterns observed, not code just written.
- Do not add secrets, credentials, tokens, or private personal configuration.
- Do not mention this skill or the current conversation in the saved text.
- If no knowledge qualifies, exit without asking.
- If placement guidance exists, defer to it.
