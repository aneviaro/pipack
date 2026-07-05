#!/usr/bin/env bash
# ============================================================
# bootstrap.sh — one-command restore of ~/.pi on a new machine.
# ------------------------------------------------------------
# Handles ALL three starting states, then rebuilds npm extensions.
#
#   1. ~/.pi doesn't exist (or is empty)        -> plain `git clone`
#   2. ~/.pi is already this repo               -> fetch + reset (idempotent)
#   3. ~/.pi exists but is NOT a repo (pi ran   -> git init + remote + fetch
#      once, seeded defaults so `git clone`        + `checkout -f -B main`
#      fails with "destination ... exists")
#
# Ignored files (agent/auth.json, agent/trust.json, sessions/,
# context-mode/, node_modules/, bin/, git/) are NEVER touched — the new
# machine keeps its own login, trusted paths, and history. Only tracked
# files (settings.json, mcp-onboarding.json, skills/, npm manifests, the
# two nested .gitignores) are overwritten by the force checkout.
#
# Usage (from anywhere):
#   PI_REMOTE=git@github.com:aneviaro/pipack.git bash bootstrap.sh
# ============================================================
set -euo pipefail

REMOTE="${PI_REMOTE:-git@github.com:aneviaro/pipack.git}"
BRANCH="${PI_BRANCH:-main}"
PI_DIR="${PI_DIR:-$HOME/.pi}"

echo "==> Bootstrapping pi config into $PI_DIR"
echo "    remote: $REMOTE"
echo "    branch: $BRANCH"

command -v git >/dev/null 2>&1 || { echo "!! git not found on PATH" >&2; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "!! npm not found on PATH" >&2; exit 1; }

# --- Step 1: get the repo onto disk -------------------------------------
if [ -d "$PI_DIR/.git" ]; then
  # Case 2: already a repo — reconcile remote and hard-reset to it.
  echo "==> $PI_DIR is already a git repo; reconciling."
  cd "$PI_DIR"
  git remote remove origin 2>/dev/null || true
  git remote add origin "$REMOTE"
  git fetch origin
  git checkout -f -B "$BRANCH" "origin/$BRANCH"   # -B resets branch; -f overwrites local mods

elif [ -d "$PI_DIR" ] && [ -n "$(ls -A "$PI_DIR" 2>/dev/null)" ]; then
  # Case 3: non-empty dir, not a repo (pi defaults present).
  echo "==> $PI_DIR exists but is not a git repo (pi defaults present)."
  echo "    Force-checking out tracked files; ignored files untouched."
  cd "$PI_DIR"
  git init -q
  git remote add origin "$REMOTE"
  git fetch origin
  git checkout -f -B "$BRANCH" "origin/$BRANCH"

else
  # Case 1: missing or empty — plain clone.
  mkdir -p "$(dirname "$PI_DIR")"
  if [ -d "$PI_DIR" ]; then rmdir "$PI_DIR"; fi
  git clone -b "$BRANCH" "$REMOTE" "$PI_DIR"
  cd "$PI_DIR"
fi

# --- Step 2: rebuild npm extensions from the manifest -------------------
echo
if [ -f agent/npm/package.json ]; then
  echo "==> Installing pi npm packages from manifest..."
  ( cd agent/npm && npm install )
else
  echo "!! agent/npm/package.json missing after checkout — cannot rebuild extensions." >&2
  exit 1
fi

# --- Step 3: what pi does on first run (no script action needed) --------
#   • fetch agent/bin/  (helper binaries like `fd`)
#   • fetch agent/git/  (git-cloned skills from settings.json packages[])
#   • (re)create agent/auth.json via interactive OAuth

echo
if command -v pi >/dev/null 2>&1; then
  echo "==> Done. Run 'pi' to fetch packages and log in."
else
  echo "==> 'pi' not found on PATH. Install pi first, then run 'pi'." >&2
fi
