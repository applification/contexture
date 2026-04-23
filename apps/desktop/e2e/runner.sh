#!/usr/bin/env bash
# Contexture Desktop E2E Test Runner
# Launches Electron with CDP, runs all e2e suites, then tears down.
#
# Usage:
#   E2E=1 bun run test:e2e            (uses built app)
#   E2E=1 E2E_DEV=1 bun run test:e2e  (uses dev server)
#
# Requirements:
#   - agent-browser installed (npm i -g agent-browser)
#   - App already built (bun run build) unless E2E_DEV=1

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
DESKTOP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CDP_PORT="${E2E_CDP_PORT:-9222}"
STARTUP_TIMEOUT="${E2E_STARTUP_TIMEOUT:-15}"
ELECTRON_PID=""

# ── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
pass() { echo -e "${GREEN}✓${NC} $*"; }
fail() { echo -e "${RED}✗${NC} $*"; }
info() { echo -e "${YELLOW}→${NC} $*"; }

# ── Cleanup ───────────────────────────────────────────────────────────────────
cleanup() {
  if [[ -n "$ELECTRON_PID" ]]; then
    info "Stopping Electron (pid $ELECTRON_PID)..."
    kill "$ELECTRON_PID" 2>/dev/null || true
    wait "$ELECTRON_PID" 2>/dev/null || true
  fi
  agent-browser close --all 2>/dev/null || true
}
trap cleanup EXIT

# ── Launch Electron ───────────────────────────────────────────────────────────
launch_electron() {
  if [[ "${E2E_DEV:-0}" == "1" ]]; then
    info "Starting Electron in dev mode..."
    cd "$DESKTOP_DIR"
    E2E=1 E2E_CDP_PORT="$CDP_PORT" npx electron-vite dev &
    ELECTRON_PID=$!
  else
    info "Starting Electron from built output..."
    cd "$DESKTOP_DIR"
    E2E=1 E2E_CDP_PORT="$CDP_PORT" npx electron out/main/index.js &
    ELECTRON_PID=$!
  fi

  # Wait for CDP port to become available
  info "Waiting for CDP port $CDP_PORT (timeout: ${STARTUP_TIMEOUT}s)..."
  local elapsed=0
  until curl -sf "http://localhost:$CDP_PORT/json/version" >/dev/null 2>&1; do
    sleep 1
    elapsed=$((elapsed + 1))
    if [[ $elapsed -ge $STARTUP_TIMEOUT ]]; then
      fail "Timed out waiting for Electron CDP port $CDP_PORT"
      exit 1
    fi
  done
  pass "Electron CDP ready on port $CDP_PORT"

  # Connect agent-browser to the app
  agent-browser connect "$CDP_PORT"
  pass "agent-browser connected"

  # Give the renderer a moment to fully hydrate
  agent-browser wait --load networkidle 2>/dev/null || sleep 2
}

# ── Run suites ────────────────────────────────────────────────────────────────
PASS=0
FAIL=0
FAILED_SUITES=()

run_suite() {
  local name="$1"
  local script="$SCRIPT_DIR/$2"
  info "Running: $name"
  if bash "$script"; then
    PASS=$((PASS + 1))
    pass "$name"
  else
    FAIL=$((FAIL + 1))
    FAILED_SUITES+=("$name")
    fail "$name"
  fi
}

# ── Main ──────────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════"
echo "  Contexture Desktop E2E  (CDP :$CDP_PORT)"
echo "═══════════════════════════════════════════"
echo ""

launch_electron

run_suite "App Launch"    "app-launch.sh"
run_suite "Ontology CRUD" "ontology-crud.sh"
run_suite "Import/Export" "import-export.sh"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "───────────────────────────────────────────"
echo "  Results: ${PASS} passed, ${FAIL} failed"
echo "───────────────────────────────────────────"

if [[ $FAIL -gt 0 ]]; then
  echo "Failed suites:"
  for s in "${FAILED_SUITES[@]}"; do echo "  - $s"; done
  echo ""
  exit 1
fi

echo ""
pass "All e2e suites passed."
