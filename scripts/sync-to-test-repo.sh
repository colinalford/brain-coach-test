#!/usr/bin/env bash
#
# Sync workflows, scripts, and package files to the test repo.
#
# Usage: ./scripts/sync-to-test-repo.sh
#
# Requires:
#   - GITHUB_TEST_TOKEN env var (or gh auth)
#   - git CLI
#
# What gets copied:
#   .github/workflows/  -> test repo
#   src/scripts/         -> test repo
#   package.json         -> test repo
#   package-lock.json    -> test repo

set -euo pipefail

MAIN_REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TEST_REPO="colinalford/brain-coach-test"
WORK_DIR="${TMPDIR:-/tmp}/brain-coach-test-sync"

# Get token: prefer gh CLI (has workflow scope), fall back to GITHUB_TEST_TOKEN
if command -v gh &>/dev/null && gh auth status &>/dev/null; then
  PUSH_TOKEN=$(gh auth token 2>/dev/null)
  echo "    Using gh CLI token (with workflow scope)"
else
  if [ -z "${GITHUB_TEST_TOKEN:-}" ]; then
    if [ -f "$MAIN_REPO_DIR/.env.e2e" ]; then
      GITHUB_TEST_TOKEN=$(grep '^GITHUB_TEST_TOKEN=' "$MAIN_REPO_DIR/.env.e2e" | cut -d= -f2)
    fi
  fi
  PUSH_TOKEN="${GITHUB_TEST_TOKEN:-}"
fi

if [ -z "${PUSH_TOKEN:-}" ]; then
  echo "ERROR: No auth available. Either 'gh auth login' or set GITHUB_TEST_TOKEN"
  exit 1
fi

echo "==> Syncing to $TEST_REPO"
echo "    Source: $MAIN_REPO_DIR"
echo "    Work dir: $WORK_DIR"

# Clone or update test repo
if [ -d "$WORK_DIR/.git" ]; then
  echo "==> Updating existing clone..."
  cd "$WORK_DIR"
  git fetch origin
  git reset --hard origin/main
else
  echo "==> Cloning test repo..."
  rm -rf "$WORK_DIR"
  git clone "https://x-access-token:${PUSH_TOKEN}@github.com/${TEST_REPO}.git" "$WORK_DIR"
  cd "$WORK_DIR"
fi

# Ensure we're on main
git checkout main 2>/dev/null || git checkout -b main

# Copy workflows
echo "==> Copying .github/workflows/"
mkdir -p .github/workflows
rm -rf .github/workflows/*
cp -r "$MAIN_REPO_DIR/.github/workflows/"* .github/workflows/

# Copy only the scripts that workflows need (skip utility scripts with embedded tokens)
echo "==> Copying src/scripts/ (workflow-required only)"
mkdir -p src/scripts
rm -rf src/scripts/*
for script in rebuild-context.js generate-digest.js rotate-calendar.js decompose-context.js; do
  if [ -f "$MAIN_REPO_DIR/src/scripts/$script" ]; then
    cp "$MAIN_REPO_DIR/src/scripts/$script" src/scripts/
  fi
done

# Copy package files
echo "==> Copying package.json and package-lock.json"
cp "$MAIN_REPO_DIR/package.json" .
if [ -f "$MAIN_REPO_DIR/package-lock.json" ]; then
  cp "$MAIN_REPO_DIR/package-lock.json" .
fi

# Stage and check for changes
git add -A
if git diff --staged --quiet; then
  echo "==> No changes to sync"
  exit 0
fi

# Commit and push
echo "==> Committing changes..."
git config user.name "Second Brain Bot"
git config user.email "bot@secondbrain.local"

SUMMARY=$(git diff --staged --stat | tail -1)
git commit -m "Sync from main repo: $SUMMARY"

echo "==> Pushing to $TEST_REPO..."
git push origin main

echo "==> Sync complete"
