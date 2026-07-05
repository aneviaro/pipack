# My pi setup

Backup of my [pi](https://github.com/earendil-works/pi-coding-agent) agent
configuration: settings, custom skills, and npm dependency manifests.

## What's tracked

| Path | What |
|------|------|
| `agent/settings.json` | Provider (`zai`), model (`glm-5.2`), theme, `packages[]` list |
| `agent/skills/` | Custom skills: `idea-honing`, `plan-linked-review` |
| `agent/npm/package.json` (+ lock) | pi npm extensions manifest (`context-mode`, `pi-mcp-adapter`) |
| `agent/trust.json` | Trusted-project paths |

### ⚠️ Caveat: npm manifests are force-added

pi generates `agent/npm/.gitignore` containing `*`, which by gitignore
precedence overrides the root allowlist and would silently exclude
`package.json` / `package-lock.json`. They are tracked via `git add -f`.
Once a file is tracked, `.gitignore` cannot untrack it, so ordinary
`git add -A && git commit` keeps them in sync thereafter. If you ever
`git rm` one, re-add with `-f`.
| `agent/mcp-onboarding.json` | Onboarding flags |

## What's deliberately NOT tracked (see `.gitignore`)

- **`agent/auth.json`** — ⚠️ live OAuth/API tokens. Never commit. Pi recreates
  this on first run via interactive login.
- **`agent/mcp-cache.json`** — regenerable MCP metadata cache.
- **`agent/sessions/`** — per-project conversation history (large, machine-local).
- **`agent/npm/node_modules/`** — rebuilt from `package.json` (~358 MB).
- **`agent/bin/`** — downloaded helper binaries (e.g. `fd`). Pi re-fetches on demand.
- **`agent/git/`** — git-cloned skills/packages, re-fetched from `settings.json`
  `packages[]` on first run (e.g. `AvdLee/SwiftUI-Agent-Skill`).
- **`context-mode/`** — SQLite knowledge-base DBs + per-pid session stats.

## MCP servers note

Project-scoped MCP servers (e.g. `stratz`, `docker-stratz` for the
`~/Documents/stratz-mcp` project) are defined in that project's `.mcp.json`,
**not** here. They belong to the project repo, not the global pi config.

## Restoring on a new machine

```bash
# 1. Clone into place (or symlink your dotfiles repo to ~/.pi)
git clone <this-repo-url> ~/.pi

# 2. Run the restore helper (rebuilds node_modules from the manifest)
cd ~/.pi && ./restore.sh

# 3. Launch pi — it will:
#      • fetch packages listed in agent/settings.json  (agent/git/, agent/bin/)
#      • prompt for OAuth to recreate agent/auth.json
pi
```

## Policy reminder

The `.gitignore` uses an **allowlist**: `*` ignores everything, then specific
files are opted back in with `!` rules. To track a new file, add a `!/path` line
to the OPT-INS section. **Never** allowlist `auth.json` or anything under
`sessions/`, `node_modules/`, `bin/`, `git/`, or `context-mode/`.
