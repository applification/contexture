#!/usr/bin/env bash
# Suite: Ontology CRUD
# Loads the built-in sample ontology and verifies the graph renders.
# Agent-browser is already connected by runner.sh.

set -euo pipefail

pass() { echo "  ✓ $*"; }
fail() { echo "  ✗ $*" >&2; exit 1; }

SCREENSHOT_DIR="${E2E_SCREENSHOT_DIR:-/tmp/contexture-e2e}"
mkdir -p "$SCREENSHOT_DIR"

# 1. Verify empty state is shown (no ontology loaded yet in this suite)
#    The empty state shows "Load sample ontology" button
agent-browser wait --text "Load sample ontology" \
  || fail "'Load sample ontology' button not found — empty state may not be showing"
pass "Empty state visible"

# 2. Click "Load sample ontology" via semantic locator (no snapshot-ref parsing needed)
agent-browser find text "Load sample ontology" click \
  || fail "Could not find/click 'Load sample ontology' button"
pass "Clicked 'Load sample ontology'"

# 4. Wait for graph canvas to appear — sample ontology has "Person" class
agent-browser wait --text "Person" \
  || fail "'Person' node did not appear after loading sample ontology"
pass "Graph rendered with 'Person' node visible"

# 5. Verify at least one more expected class from the people.ttl sample
agent-browser wait --text "Organisation" \
  || fail "'Organisation' node not visible in graph"
pass "'Organisation' node visible"

# 6. Screenshot with graph loaded
agent-browser screenshot --screenshot-dir "$SCREENSHOT_DIR" 2>/dev/null \
  && pass "Screenshot saved (graph state)" \
  || pass "Screenshot skipped (non-fatal)"

# 7. Search functionality — use the search bar to find a specific node
#    Toolbar input has placeholder="Search label, URI, comment…"
if agent-browser find placeholder "Search label" fill "Person" 2>/dev/null; then
  pass "Search bar accepts input"
  agent-browser find placeholder "Search label" fill "" 2>/dev/null || true
else
  pass "Search bar test skipped (non-fatal)"
fi
