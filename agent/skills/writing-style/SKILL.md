---
name: writing-style
description: Use for technical communication such as GitHub tickets, pull request descriptions and comments, code review comments, commit messages, and internal technical discussions. Be direct, brief, and natural. Do not use for README files, public documentation, blog posts, or public release notes.
---

# Technical Communication Style Guide

## User Override Check

Before applying this default guide:

1. Follow explicit writing instructions in the user's request.
2. Check Pi context files for writing rules:
   - `~/.pi/agent/AGENTS.md`
   - `AGENTS.md` and `AGENTS.override.md` in the project and its parent directories
   - any other project guidance loaded by Pi
3. Check for a more specific user-defined `writing-style` skill in the project's
   `.pi/skills/` or `.agents/skills/` directories, or in configured Pi skill
   directories.

Look for sections about writing style, communication style, tone, or comments.
If user-defined rules exist, follow them instead of this guide. Do not apply
this guide partially or override those rules. If they leave a genuine gap, use
normal judgment without contradicting them.

## Scope

Use this style for:

- GitHub issue comments
- Pull request descriptions and comments
- Code review comments
- Commit messages
- Technical discussions in tickets
- Internal team communication

Use proper English instead for:

- `README.md` files
- Official documentation, user guides, API docs, and tutorials
- Public blog posts, articles, or announcements
- Public-facing release notes
- Any content intended for a general audience

For these exceptions, use complete sentences, proper capitalization, and a
professional tone.

## Core Principles

### Brevity and Directness

- Get to the point.
- Remove filler and unnecessary context.
- A short response is fine when it conveys the full message.
- Skip pleasantries and boilerplate.

### Honest and Direct Feedback

- State opinions directly rather than hedging.
- Express uncertainty openly: “I'm not sure” or “I can't see how.”
- Do not soften criticism artificially.
- Question design decisions when appropriate.

### Problem-Solution Structure

State the problem briefly, then explain what was changed or what should happen.
Skip dramatic build-up.

```text
[brief problem statement]

[what was changed or fixed]
```

Use numbered lists for multiple issues.

### Technical Precision

- Include exact references: file paths, line numbers, commit hashes, and links.
- Use inline code for identifiers, commands, and paths.
- Use fenced code blocks for snippets.
- Assume the reader has technical context.
- Use domain-specific terminology when it is precise.

### Code Review Comments

- Point out issues directly.
- Reference specific lines or symbols.
- Explain why the issue matters.
- Suggest an alternative, with code when useful.
- Question design decisions openly when warranted.

### Questions and Answers

Answer yes/no questions directly when possible, then add a brief explanation.
Do not restate the question.

## AI-Typical Language to Avoid

Avoid these patterns unless they are part of a quote or technically necessary.

### Filler Phrases

- “It's important to note that...”
- “It's worth mentioning...”
- “In order to...” — use “to”
- “plays a crucial role in”
- “at the end of the day”
- “that being said”
- “moving forward”
- “in terms of”

### Overused AI Words

Prefer simpler alternatives:

- “comprehensive” → “full” or “complete”
- “robust” → “solid” or “reliable”
- “leverage” → “use”
- “utilize” → “use”
- “facilitate” → “help” or “enable”
- “optimal” → “best”
- “seamless” → remove it
- “streamline” → “simplify”

### Abstract Nouns

Convert them to verbs:

- “the implementation of” → “implemented”
- “make a decision” → “decide”
- “provide assistance” → “help”
- “perform an analysis” → “analyze”

### Hedging

Replace indirect suggestions with direct statements:

- “I think maybe we could consider...” → state the opinion or suggestion
- “It would seem that...” → state the fact
- “Perhaps it might be worth...” → make the suggestion directly

### Excessive Transitions

Use “also” or continue without a transition instead of overusing:

- “Furthermore...”
- “Additionally...”
- “Moreover...”
- “In conclusion...”

### Meta-commentary

Delete phrases that describe the act of explaining rather than the content:

- “This approach works by...”
- “The benefit of this is...”
- “What this means is...”

State the behavior or benefit directly.

## What Not to Do

Do not use:

- “Thanks in advance”
- “Hope this helps”
- “Let me know if you have any questions”
- “I appreciate your patience”
- “Looking forward to hearing from you”
- “Best regards” in issue comments
- “I hope you're doing well”
- Overly polite hedging
- Corporate speak
- Marketing language

## Markdown Formatting

- Inline code: `` `like this` ``
- Code blocks: ```` ```language ````
- Links: `[text](url)`
- Bold: `**text**` for emphasis
- Italic: `_text_` for side notes
- Lists: `-` or `1.`

## Application Summary

1. Be concise.
2. Be direct.
3. Be honest about uncertainty or disagreement.
4. Be precise with references.
5. Avoid AI-speak.
6. Skip boilerplate, pleasantries, and sign-offs in technical comments.

Apply this guide only to technical communication. Use proper English for
README files, public documentation, blog posts, and other general-audience
content.
