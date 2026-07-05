#!/usr/bin/env bash
# ============================================================
# bootstrap.sh — one-command restore of ~/.pi on a new machine.
# ------------------------------------------------------------
# Handles ALL three starting states:
#
#   1. ~/.pi doesn't exist (or is empty)
#        -> plain `git clone`
#
#   2. ~/.pi exists and is already a git repo with this remote
#        -> fetch + reset to origin (idempotent re-run)
#
#   3. ~/.pi exists but is NOT a git repo (pi already ran once and
#      seeded default settings.json / nested .gitignores, so a plain
#      `git clone` fails with "destination already exists")
#        -> git init + remote add + fetch + `checkout -f -B main`
#
# Ignored files (agent/auth.json, sessions/, context-mode/, node_modules/,
# bin/, git/) are NEVER touched — the new machine keeps its own login and
# history. Only tracked files (settings.json, trust.json, mcp-onboarding.json,
# skills/, npm manifests, the two nested .gitignores) are overwritten by the
# force checkout.
#
# Usage (from anywhere):
#   PI_REMOTE=git@github.com:aneviaro/pipack.git bash bootstrap.sh
#
# Or curl-pipe on a brand-new machine (after `git` + an SSH key are set up):
#   bash -c "$(curl -fsSL \
#     https://raw.githubusercontent.com/aneviaro/pipack/main/bootstrap.sh)"
# ============================================================
set -euo pipefail

REMOTE="${PI_REMOTE:-git@github.com:aneviaro/pipack.git}"
BRANCH="${PI_BRANCH:-main}"
PI_DIR="${PI_DIR:-$HOME/.pi}"

echo "==> Bootstrapping pi config into $PI_DIR"
echo "    remote: $REMOTE"
echo "    branch: $BRANCH"

need_git() { command -v git >/dev/null 2>&1 || { echo "!! git not found on PATH" >&2; exit 1; }; }
need_git

if [ -d "$PI_DIR/.git" ]; then
  # --- Case 2: already a repo — reconcile remote and hard-reset to it.
  echo "==> $PI_DIR is already a git repo; reconciling."
  cd "$PI_DIR"
  git remote remove origin 2>/dev/null || true
  git remote add origin "$REMOTE"
  git fetch origin
  # -B creates/resets the local branch; -f overwrites local mods to tracked files.
  git checkout -f -B "$BRANCH" "origin/$BRANCH"

elif [ -d "$PI_DIR" ] && [ -n "$(ls -A "$PI_DIR" 2>/dev/null)" ]; then
  # --- Case 3: non-empty dir, not a repo (pi defaults present).
  echo "==> $PI_DIR exists but is not a git repo (pi defaults present)."
  echo "    Force-checking out tracked files; ignored files (auth/sessions/DBs) untouched."
  cd "$PI_DIR"
  git init -q
  git remote add origin "$REMOTE"
  git fetch origin
  git checkout -f -B "$BRANCH" "origin/$BRANCH"

else
  # --- Case 1: missing or empty — plain clone.
  mkdir -p "$(dirname "$PI_DIR")"
  if [ -d "$PI_DIR" ]; then rmdir "$PI_DIR"; fi
  git clone -b "$BRANCH" "$REMOTE" "$PI_DIR"
  cd "$PI_DIR"
fi

echo
echo "==> Repo ready. Rebuilding npm extensions..."
bash ./restore.sh
