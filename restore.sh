#!/usr/bin/env bash
# ============================================================
# restore.sh — rebuild pi npm extensions from the committed manifest.
# ------------------------------------------------------------
# Run this AFTER the repo is checked out at ~/.pi. For the initial
# checkout itself (clone or reconcile into an existing dir), use
# bootstrap.sh — see README.md "Restoring on a new machine".
#
# Safe to re-run.
# ============================================================
set -euo pipefail

# Guard: must run from inside the checked-out repo.
if [ ! -f README.md ] || [ ! -d .git ]; then
  echo "!! restore.sh must run from the repo root (the checked-out ~/.pi)." >&2
  echo "   For the initial checkout, run bootstrap.sh instead:" >&2
  echo "     PI_REMOTE=git@github.com:aneviaro/pipack.git bash bootstrap.sh" >&2
  exit 1
fi

AGENT_DIR="${AGENT_DIR:-$PWD/agent}"

# 1. Rebuild npm extensions (context-mode, pi-mcp-adapter) from the manifest.
if [ -f "$AGENT_DIR/npm/package.json" ]; then
  echo "==> Installing pi npm packages from manifest..."
  ( cd "$AGENT_DIR/npm" && npm install )
else
  echo "!! agent/npm/package.json missing — cannot rebuild extensions." >&2
  echo "   Did the checkout complete? See bootstrap.sh / README.md." >&2
  exit 1
fi

# 2. Pi re-fetches the rest on first run, so no manual steps needed for:
#      • agent/bin/   (helper binaries like `fd`)
#      • agent/git/   (git-cloned skills from settings.json packages[])
# 3. agent/auth.json is created/refreshed by `pi` itself via interactive OAuth.

if command -v pi >/dev/null 2>&1; then
  echo "==> Done. Run 'pi' to fetch packages and log in."
else
  echo "==> 'pi' not found on PATH. Install pi first, then run 'pi'." >&2
fi

# Path-portability reminder:
#   agent/trust.json holds ABSOLUTE paths from the source machine
#   (e.g. /Users/alex/Documents/moon-rhythm). If your home dir differs,
#   edit trust.json for this machine after checkout.
