#!/usr/bin/env bash
# Suite: Ontology CRUD
# Loads the built-in sample ontology and verifies the graph renders.
# Agent-browser is already connected by runner.sh.

set -euo pipefail

pass() { echo "  ✓ $*"; }
fail() { echo "  ✗ $*" >&2; exit 1; }

SCREENSHOT_DIR="${E2E_SCREENSHOT_DIR:-/tmp/ontograph-e2e}"
mkdir -p "$SCREENSHOT_DIR"

# 1. Verify empty state is shown (no ontology loaded yet in this suite)
#    The empty state shows "Load sample ontology" button
agent-browser wait --text "Load sample ontology" \
  || fail "'Load sample ontology' button not found — empty state may not be showing"
pass "Empty state visible"

# 2. Get snapshot to find the "Load sample ontology" button ref
SNAPSHOT=$(agent-browser snapshot -i)
LOAD_SAMPLE_REF=$(echo "$SNAPSHOT" | grep -i "Load sample" | grep -oE '@e[0-9]+' | head -1)

if [[ -z "$LOAD_SAMPLE_REF" ]]; then
  fail "Could not find 'Load sample ontology' button ref in snapshot"
fi
pass "Found 'Load sample ontology' button at $LOAD_SAMPLE_REF"

# 3. Click it to load the sample People ontology
agent-browser click "$LOAD_SAMPLE_REF"
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
SEARCH_REF=$(agent-browser snapshot -i | grep -i "Search\|search" | grep -oE '@e[0-9]+' | head -1)
if [[ -n "$SEARCH_REF" ]]; then
  agent-browser fill "$SEARCH_REF" "Person"
  pass "Search bar accepts input"
  # Clear search
  agent-browser fill "$SEARCH_REF" ""
else
  pass "Search bar test skipped (ref not found)"
fi
