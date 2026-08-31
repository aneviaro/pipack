---
name: backlog
description: Maintain a project's backlog by adding, updating, or creating docs/backlog.md. Use when the user asks to record a future improvement, backlog item, TODO, or planned enhancement in project documentation.
---

# Backlog

Maintain a concise, actionable Markdown backlog of future improvements for the
current project. This skill records planning work only; do not implement the
improvement unless the user separately asks for implementation.

## Target document

Resolve the target in this order:

1. Use an explicit path supplied by the user.
2. Otherwise use `docs/backlog.md` relative to the repository root. Do not
   search for or fall back to another filename.

Before editing, inspect the repository's `AGENTS.md` files and any relevant
project guidance. Follow their architecture, security, documentation, and
placement requirements. If multiple plausible target documents exist and the
user did not specify one, ask which document to update.

## Cleanup mode

When invoked with the `cleanup` option by a planning workflow, require both:

- the exact backlog item heading to remove; and
- the path to the successfully saved plan.

Verify that the plan exists before editing `docs/backlog.md`. Remove only the
matching `##` item section, from its heading through the line before the next
same-level `##` heading or the end of the file. If the heading is missing or
not unique, do not edit the backlog and report the problem. Preserve all other
items and document structure.

## Workflow

1. Identify the repository root and resolve the target document.
2. Read the existing target document completely when it exists.
3. Turn the user's request into a focused backlog item:
   - a descriptive `##` heading;
   - a short explanation of the desired improvement;
   - a `### Desired behavior` section when behavior or constraints need to be
     made explicit.
4. Check for an existing item covering the same or a closely related concern.
   Update or extend that item instead of creating a duplicate. Preserve the
   document's existing headings, tone, ordering, and Markdown style.
5. Keep the entry implementation-neutral but specific enough to guide future
   planning. Include important compatibility, failure-mode, security, and
   operational constraints from the request or project guidance. Do not invent
   unsupported requirements.
6. Use a precise edit for an existing document. Use `write` only to create the
   document, creating its parent directory as needed. Do not rewrite unrelated
   content.
7. Report the target path and the item added or updated. Mention if no change
   was needed because the request was already covered. In cleanup mode, report
   the removed heading and the verified plan path.

## Content rules

- Keep backlog entries concise and actionable.
- Prefer desired outcomes and acceptance criteria over speculative task lists.
- Preserve fail-closed, privacy, compatibility, and operational guarantees
  when they are relevant to the project.
- Do not include credentials, tokens, secrets, or sensitive request data.
- Do not silently change an existing item's intent; ask a concise clarification
  when the requested change conflicts with it or is materially underspecified.
- Do not modify source code, tests, configuration, or project memory as part of
  this skill.
