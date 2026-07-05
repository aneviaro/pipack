#!/usr/bin/env bash
# Restore ~/.pi setup on a new machine after `git clone`-ing this repo.
# Safe to re-run.
set -euo pipefail

PI_DIR="${PI_DIR:-$HOME/.pi}"
AGENT_DIR="$PI_DIR/agent"

echo "==> Restoring pi config into $PI_DIR"

# 1. Rebuild npm extensions (context-mode, pi-mcp-adapter) from the manifest.
if [ -f "$AGENT_DIR/npm/package.json" ]; then
  echo "==> Installing pi npm packages..."
  (cd "$AGENT_DIR/npm" && npm install)
else
  echo "!! agent/npm/package.json not found — nothing to install"
fi

# 2. Pi re-fetches on first run, so no manual steps needed for:
#      • agent/bin/   (helper binaries like `fd`)
#      • agent/git/   (git-cloned skills from settings.json packages[])
# 3. agent/auth.json is recreated by `pi` via interactive OAuth login.

if command -v pi >/dev/null 2>&1; then
  echo "==> All set. Run 'pi' to fetch packages and log in."
else
  echo "==> 'pi' not found on PATH. Install pi first, then run 'pi'."
fi
