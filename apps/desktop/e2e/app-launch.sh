#!/usr/bin/env bash
# Suite: App Launch
# Verifies the Contexture window loads and renders the expected initial state.

set -euo pipefail

pass() { echo "  ✓ $*"; }
fail() { echo "  ✗ $*" >&2; exit 1; }

# 1. Page title should be "Contexture" (set via app.setName in Electron main)
TITLE=$(agent-browser get title 2>/dev/null || echo "")
if [[ "$TITLE" == *"Contexture"* ]]; then
  pass "Window title contains 'Contexture' (got: '$TITLE')"
else
  fail "Unexpected window title: '$TITLE' (expected to contain 'Contexture')"
fi

# 2. Main UI should be visible — toolbar renders at top of the app
#    The theme toggle button has title="Toggle theme" (no visible text — icon only),
#    so we check via JS DOM query rather than --text which matches visible content.
agent-browser wait --fn "!!document.querySelector('[title=\"Toggle theme\"]')" 2>/dev/null \
  || fail "Toolbar 'Toggle theme' button did not appear within timeout"
pass "Toolbar visible"

# 3. App renders either empty-state or graph canvas — both are acceptable
#    Empty state shows "Open" and "Paste" buttons; canvas shows graph elements.
SNAPSHOT=$(agent-browser snapshot -i 2>/dev/null || echo "")
if echo "$SNAPSHOT" | grep -qi "open\|paste\|ontology\|graph"; then
  pass "Main content area rendered"
else
  fail "Could not detect main content in snapshot output"
fi

# 4. Screenshot for visual record
SCREENSHOT_DIR="${E2E_SCREENSHOT_DIR:-/tmp/contexture-e2e}"
mkdir -p "$SCREENSHOT_DIR"
agent-browser screenshot --screenshot-dir "$SCREENSHOT_DIR" 2>/dev/null \
  && pass "Screenshot saved to $SCREENSHOT_DIR" \
  || pass "Screenshot skipped (non-fatal)"
