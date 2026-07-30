#!/usr/bin/env sh
# Prove build_report.py and build_report.js are interchangeable.
#
#     tests/parity.sh
#
# Runs both selftests, then builds the same fixture with each runtime and diffs the HTML,
# the rewritten project.json and the lint output. Any difference is a bug: the two scripts
# are a port of each other and users pick between them by accident (whatever is installed),
# so a report must not depend on which one ran.
#
# Skips a runtime that isn't installed, and says so. Exits non-zero on any mismatch.

set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
skill="$root/skills/feature-recon"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT INT TERM

has() { command -v "$1" >/dev/null 2>&1; }
fail() { echo "FAIL: $*" >&2; exit 1; }

have_py=0; have_js=0
has python3 && have_py=1 || echo "SKIP python3 (not installed)"
has node && have_js=1 || echo "SKIP node (not installed)"
[ "$have_py" = 1 ] || [ "$have_js" = 1 ] || fail "neither python3 nor node is installed"

# --- fixture -------------------------------------------------------------------------------
# Deliberately nasty: non-ASCII, a '</script>' in prose, an unknown enum, a duplicate id, a
# finding with no evidence, a dangling top_findings ref, and a feature file listed last that
# project.json indexes first (so ordering is exercised).
make_fixture() {
  mkdir -p "$1/features"
  # A fake repo root, so the citation check activates and both runtimes must agree about it.
  # b.php has 4 lines: b.php:1-3 resolve, b.php:9 is past the end, gone.php is not there at all.
  mkdir -p "$1/.git"
  printf 'one\ntwo\nthree\nfour\n' > "$1/b.php"
  cat > "$1/project.json" <<'EOF'
{
  "schema_version": "1.0",
  "project_name": "Parité Tëst 🎯",
  "reviewed_at": "2026-07-30",
  "git_commit": "deadbee",
  "method": "parity",
  "summary": "Unicode: café — a naïve </script> in prose must not break the data island",
  "features": [
    {"slug": "billing", "name": "Billing", "file": "features/billing.json"},
    {"slug": "brands", "name": "Brands", "file": "features/brands.json"}
  ],
  "cross_cutting": [
    {"id": "xc-01", "title": "No input validation", "features": ["billing"],
     "description": "d", "evidence": ["a.php:1"], "effort": "M", "priority": "P1"}
  ],
  "top_findings": [
    {"ref": "billing-bug-01", "feature": "billing", "why": "money"},
    {"ref": "ghost-99", "feature": "billing", "why": "dangling ref, must warn"}
  ],
  "recommended_sequence": [{"step": 1, "action": "fix billing", "rationale": "r", "effort": "S"}]
}
EOF
  cat > "$1/features/billing.json" <<'EOF'
{
  "schema_version": "1.0", "slug": "billing", "name": "Billing", "reviewed_at": "2026-07-30",
  "maturity": "alpha", "confidence": "medium",
  "state_summary": "Charges work, refunds don't — the 50€ edge case fails",
  "surface": {"routes": ["POST /billing"], "controllers": [], "packages": [], "models": [],
              "frontend_pages": [], "queues_jobs": [], "external_deps": ["stripe"]},
  "coverage": {"test_files": [], "tested_paths": [], "untested_paths": ["refunds"],
               "not_inspected": []},
  "user_flows": [
    {"name": "Refund", "status": "broken", "breaks_at": "b.php:9", "evidence": ["b.php:9"]},
    {"name": "Charge", "status": "weird_status", "breaks_at": null, "evidence": []}
  ],
  "bugs": [
    {"id": "billing-bug-01", "title": "Double charge", "severity": "critical",
     "type": "data_integrity", "description": "d", "repro": "r", "impact": "i",
     "evidence": ["b.php:1"], "suggested_fix": "f", "effort": "M", "confidence": "high"},
    {"id": "billing-bug-01", "title": "Duplicate id on purpose", "severity": "high",
     "type": "logic", "description": "d", "repro": "r", "impact": "i", "evidence": [],
     "suggested_fix": "f", "effort": "XL", "confidence": "high"}
  ],
  "gaps": [{"id": "billing-gap-01", "title": "No dunning", "kind": "missing_feature",
            "description": "d", "expected_by": "x", "blocks": [], "evidence": ["b.php:2", "gone.php:5"],
            "effort": "L", "priority": "P0"}],
  "opportunities": [{"id": "billing-opp-01", "title": "Cache the price table",
                     "value": "medium", "effort": "S", "priority": "P2", "description": "d",
                     "evidence": ["b.php:3"]}],
  "dependencies": ["brands"], "open_questions": ["Who owns retries?"]
}
EOF
  cat > "$1/features/brands.json" <<'EOF'
{
  "schema_version": "1.0", "slug": "brands", "name": "Brands", "reviewed_at": "2026-07-30",
  "maturity": "production_ready", "confidence": "high", "state_summary": "Solid.",
  "surface": {"routes": [], "controllers": [], "packages": [], "models": [],
              "frontend_pages": [], "queues_jobs": [], "external_deps": []},
  "coverage": {"test_files": ["tests/BrandsTest.php"], "tested_paths": [],
               "untested_paths": [], "not_inspected": []},
  "user_flows": [], "bugs": [], "gaps": [], "opportunities": [],
  "dependencies": [], "open_questions": []
}
EOF
}

# --- selftests -----------------------------------------------------------------------------
if [ "$have_py" = 1 ]; then
  python3 "$skill/build_report.py" --selftest >/dev/null || fail "python3 selftest"
  echo "PASS python3 selftest"
fi
if [ "$have_js" = 1 ]; then
  node "$skill/build_report.js" --selftest >/dev/null || fail "node selftest"
  echo "PASS node selftest"
fi

# --- the wrapper picks something ------------------------------------------------------------
"$skill/build_report.sh" --which >/dev/null || fail "build_report.sh found no runtime"
echo "PASS build_report.sh --which -> $("$skill/build_report.sh" --which)"

# --- byte parity ---------------------------------------------------------------------------
if [ "$have_py" = 1 ] && [ "$have_js" = 1 ]; then
  make_fixture "$tmp/py"
  make_fixture "$tmp/js"
  python3 "$skill/build_report.py" "$tmp/py" >"$tmp/py.out" 2>"$tmp/py.err" \
    || fail "python3 build failed: $(cat "$tmp/py.err")"
  node "$skill/build_report.js" "$tmp/js" >"$tmp/js.out" 2>"$tmp/js.err" \
    || fail "node build failed: $(cat "$tmp/js.err")"

  # The build path is in stdout, so compare it with the recon dir name normalised away.
  sed "s|$tmp/py|DIR|" "$tmp/py.out" >"$tmp/py.norm"
  sed "s|$tmp/js|DIR|" "$tmp/js.out" >"$tmp/js.norm"

  diff -u "$tmp/py.norm" "$tmp/js.norm" || fail "stdout summary differs"
  diff -u "$tmp/py.err" "$tmp/js.err" || fail "lint output differs"
  diff -u "$tmp/py/project.json" "$tmp/js/project.json" || fail "rewritten project.json differs"
  diff "$tmp/py/recon-report.html" "$tmp/js/recon-report.html" || fail "rendered HTML differs"
  echo "PASS byte parity (HTML, project.json, lint output, summary)"

  grep -q "ghost-99" "$tmp/py.err" || fail "fixture should have warned about the dangling ref"
  grep -q "weird_status" "$tmp/py.err" || fail "fixture should have warned about the bad enum"
  grep -q "b.php:9' but b.php has 4 lines" "$tmp/py.err" \
    || fail "fixture should have warned about the citation past end of file"
  grep -q "gone.php:5' but that file does not exist" "$tmp/py.err" \
    || fail "fixture should have warned about the citation to a missing file"
  [ "$(grep -c "b.php:1'" "$tmp/py.err")" = 0 ] || fail "a citation that resolves must not warn"
  [ "$(grep -c "weird_status" "$tmp/py.err")" = 1 ] \
    || fail "a warning must be printed once, not repeated by the second report()"

  # A report must rebuild identically from its own rewritten project.json (idempotence), and
  # the other runtime must accept what this one wrote.
  cp "$tmp/py/recon-report.html" "$tmp/first.html"
  node "$skill/build_report.js" "$tmp/py" >/dev/null 2>&1 || fail "node cannot rebuild python3's output"
  diff "$tmp/first.html" "$tmp/py/recon-report.html" || fail "rebuild is not idempotent"
  echo "PASS cross-runtime rebuild is idempotent"
else
  echo "SKIP byte parity (needs both runtimes)"
fi

# --- --check catches broken JSON ------------------------------------------------------------
make_fixture "$tmp/bad"
printf '{"nope"' > "$tmp/bad/features/billing.json"
if "$skill/build_report.sh" --check "$tmp/bad" >"$tmp/bad.out" 2>&1; then
  fail "--check accepted invalid JSON"
fi
grep -q "BAD: .*billing.json" "$tmp/bad.out" || fail "--check did not name the bad file"
echo "PASS --check rejects invalid JSON"

echo "OK all parity checks passed"
