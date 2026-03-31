#!/usr/bin/env bash
# Suite: App Launch
# Verifies the Ontograph window loads and renders the expected initial state.

set -euo pipefail

pass() { echo "  ✓ $*"; }
fail() { echo "  ✗ $*" >&2; exit 1; }

# 1. Page title should be "Ontograph" (set via app.setName in Electron main)
TITLE=$(agent-browser get title 2>/dev/null || echo "")
if [[ "$TITLE" == *"Ontograph"* ]]; then
  pass "Window title contains 'Ontograph' (got: '$TITLE')"
else
  fail "Unexpected window title: '$TITLE' (expected to contain 'Ontograph')"
fi

# 2. Main UI should be visible — toolbar renders at top of the app
#    We wait for a known landmark: the theme toggle button title attr
agent-browser wait --text "Toggle theme" 2>/dev/null \
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
SCREENSHOT_DIR="${E2E_SCREENSHOT_DIR:-/tmp/ontograph-e2e}"
mkdir -p "$SCREENSHOT_DIR"
agent-browser screenshot --screenshot-dir "$SCREENSHOT_DIR" 2>/dev/null \
  && pass "Screenshot saved to $SCREENSHOT_DIR" \
  || pass "Screenshot skipped (non-fatal)"
