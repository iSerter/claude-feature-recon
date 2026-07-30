#!/usr/bin/env python3
"""Build a self-contained HTML dashboard from feature-recon JSON state files.

    python3 build_report.py <recon-dir> [--out PATH]
    python3 build_report.py --selftest

Reads <recon-dir>/project.json and <recon-dir>/features/*.json, lints them against the
report spec, derives every count (so the model never has to do arithmetic), writes the
counts back into project.json, and injects the merged payload into template.html.

Stdlib only. No install step.
"""

import argparse
import json
import sys
import tempfile
from pathlib import Path

MATURITY = ["missing", "stub", "alpha", "beta", "production_ready"]
SEVERITY = ["critical", "high", "medium", "low"]
CONFIDENCE = ["high", "medium", "low"]
EFFORT = ["S", "M", "L"]
PRIORITY = ["P0", "P1", "P2", "P3"]
VALUE = ["high", "medium", "low"]
FLOW_STATUS = ["working", "partial", "broken", "not_implemented"]
BUG_TYPE = ["runtime_error", "logic", "data_integrity", "security",
            "performance", "ux", "regression"]
GAP_KIND = ["missing_feature", "missing_validation", "missing_tests",
            "missing_error_handling", "missing_ui", "unwired"]

FEATURE_KEYS = ["slug", "name", "maturity", "confidence", "state_summary", "surface",
                "coverage", "user_flows", "bugs", "gaps", "opportunities",
                "dependencies", "open_questions"]

PLACEHOLDER = '<script id="recon-data" type="application/json">'


class Problems:
    """Collected lint output. Errors block the build, warnings don't."""

    def __init__(self):
        self.errors = []
        self.warnings = []

    def error(self, msg):
        self.errors.append(msg)

    def warn(self, msg):
        self.warnings.append(msg)

    def report(self):
        for w in self.warnings:
            print(f"WARN  {w}", file=sys.stderr)
        for e in self.errors:
            print(f"ERROR {e}", file=sys.stderr)
        return not self.errors


def load_json(path, problems):
    try:
        return json.loads(path.read_text())
    except json.JSONDecodeError as exc:
        problems.error(f"{path}: invalid JSON at line {exc.lineno} col {exc.colno}: {exc.msg}")
    except OSError as exc:
        problems.error(f"{path}: {exc}")
    return None


def check_enum(problems, where, field, value, allowed):
    if value not in allowed:
        problems.warn(f"{where}: {field}={value!r} is not one of {allowed}")


def lint_feature(feature, path, problems, seen_ids):
    where = path.name
    for key in FEATURE_KEYS:
        if key not in feature:
            problems.warn(f"{where}: missing key {key!r}")

    check_enum(problems, where, "maturity", feature.get("maturity"), MATURITY)
    check_enum(problems, where, "confidence", feature.get("confidence"), CONFIDENCE)

    for flow in feature.get("user_flows", []):
        check_enum(problems, where, "user_flows[].status", flow.get("status"), FLOW_STATUS)

    for bug in feature.get("bugs", []):
        check_enum(problems, where, "bugs[].severity", bug.get("severity"), SEVERITY)
        check_enum(problems, where, "bugs[].type", bug.get("type"), BUG_TYPE)
        check_enum(problems, where, "bugs[].effort", bug.get("effort"), EFFORT)
    for gap in feature.get("gaps", []):
        check_enum(problems, where, "gaps[].kind", gap.get("kind"), GAP_KIND)
        check_enum(problems, where, "gaps[].effort", gap.get("effort"), EFFORT)
        check_enum(problems, where, "gaps[].priority", gap.get("priority"), PRIORITY)
    for opp in feature.get("opportunities", []):
        check_enum(problems, where, "opportunities[].value", opp.get("value"), VALUE)
        check_enum(problems, where, "opportunities[].effort", opp.get("effort"), EFFORT)
        check_enum(problems, where, "opportunities[].priority", opp.get("priority"), PRIORITY)

    for kind in ("bugs", "gaps", "opportunities"):
        for finding in feature.get(kind, []):
            fid = finding.get("id")
            if not fid:
                problems.warn(f"{where}: a {kind[:-1]} has no id ({finding.get('title')!r})")
            elif fid in seen_ids:
                problems.warn(f"{where}: duplicate finding id {fid!r} (also in {seen_ids[fid]})")
            else:
                seen_ids[fid] = where
            if not finding.get("evidence"):
                problems.warn(f"{where}: {fid or finding.get('title')!r} has no evidence")


def derive(project, features, problems):
    """Compute per-feature counts and project totals from the feature files."""
    by_slug = {f["slug"]: f for f in features if f.get("slug")}
    index = project.get("features") or []

    for entry in index:
        if entry.get("slug") not in by_slug:
            problems.error(f"project.json indexes {entry.get('slug')!r} but no feature file exists")
    for slug in by_slug:
        if not any(e.get("slug") == slug for e in index):
            problems.warn(f"features/{slug}.json exists but project.json does not index it")

    totals = {
        "features": len(features),
        "by_maturity": {m: 0 for m in MATURITY},
        "bugs_by_severity": {s: 0 for s in SEVERITY},
        "bugs": 0,
        "gaps": 0,
        "opportunities": 0,
        "test_files": 0,
        "features_without_tests": [],
    }

    for feature in features:
        bugs = feature.get("bugs", [])
        by_sev = {s: sum(1 for b in bugs if b.get("severity") == s) for s in SEVERITY}
        tests = feature.get("coverage", {}).get("test_files", []) or []
        feature["counts"] = {
            "bugs": len(bugs),
            "bugs_by_severity": by_sev,
            "critical_bugs": by_sev["critical"],
            "gaps": len(feature.get("gaps", [])),
            "opportunities": len(feature.get("opportunities", [])),
            "test_files": len(tests),
            "flows_broken": sum(1 for f in feature.get("user_flows", [])
                                if f.get("status") in ("broken", "not_implemented")),
        }

        maturity = feature.get("maturity")
        if maturity in totals["by_maturity"]:
            totals["by_maturity"][maturity] += 1
        for sev in SEVERITY:
            totals["bugs_by_severity"][sev] += by_sev[sev]
        totals["bugs"] += len(bugs)
        totals["gaps"] += feature["counts"]["gaps"]
        totals["opportunities"] += feature["counts"]["opportunities"]
        totals["test_files"] += len(tests)
        if not tests:
            totals["features_without_tests"].append(feature["slug"])

    project["totals"] = totals

    # Mirror the derived counts into the rollup index so project.json stands alone.
    for entry in index:
        feature = by_slug.get(entry.get("slug"))
        if feature:
            entry["counts"] = feature["counts"]
            entry.setdefault("maturity", feature.get("maturity"))
            entry.setdefault("confidence", feature.get("confidence"))

    refs = {fid for f in features for kind in ("bugs", "gaps", "opportunities")
            for fid in (x.get("id") for x in f.get(kind, []))}
    for top in project.get("top_findings", []):
        if top.get("ref") and top["ref"] not in refs:
            problems.warn(f"top_findings references unknown finding id {top['ref']!r}")

    return project


def order_features(project, features):
    """Report order = project.json's index order, with any unindexed files appended."""
    order = [e.get("slug") for e in project.get("features") or []]
    rank = {slug: i for i, slug in enumerate(order)}
    return sorted(features, key=lambda f: (rank.get(f.get("slug"), len(rank)), f.get("slug") or ""))


def render(template, payload):
    if PLACEHOLDER not in template:
        raise SystemExit(f"template is missing the {PLACEHOLDER!r} data slot")
    blob = json.dumps(payload, separators=(",", ":")).replace("</", r"<\/")
    head, rest = template.split(PLACEHOLDER, 1)
    _, tail = rest.split("</script>", 1)
    return f"{head}{PLACEHOLDER}{blob}</script>{tail}"


def build(recon_dir, out_path=None, template_path=None):
    recon_dir = Path(recon_dir)
    problems = Problems()

    project_path = recon_dir / "project.json"
    if not project_path.exists():
        raise SystemExit(f"no project.json in {recon_dir}")
    project = load_json(project_path, problems)
    if project is None:
        problems.report()
        raise SystemExit(1)

    feature_paths = sorted((recon_dir / "features").glob("*.json"))
    if not feature_paths:
        raise SystemExit(f"no feature files in {recon_dir / 'features'}")

    features = []
    seen_ids = {}
    for path in feature_paths:
        feature = load_json(path, problems)
        if feature is None:
            continue
        feature.setdefault("slug", path.stem)
        lint_feature(feature, path, problems, seen_ids)
        features.append(feature)

    if not problems.report():
        raise SystemExit(1)

    features = order_features(project, features)
    derive(project, features, problems)
    problems.report()  # derive() can add warnings; they never block

    project_path.write_text(json.dumps(project, indent=2, ensure_ascii=False) + "\n")

    template_path = Path(template_path or Path(__file__).parent / "template.html")
    out_path = Path(out_path or recon_dir / "recon-report.html")
    out_path.write_text(render(template_path.read_text(),
                               {"project": project, "features": features}))
    return out_path, project


FIXTURE_FEATURES = [
    {
        "schema_version": "1.0", "slug": "alpha", "name": "Alpha", "reviewed_at": "2026-07-30",
        "maturity": "beta", "confidence": "high", "state_summary": "Works.",
        "surface": {"routes": ["GET /alpha"], "controllers": [], "packages": [], "models": [],
                    "frontend_pages": [], "queues_jobs": [], "external_deps": []},
        "coverage": {"test_files": ["tests/AlphaTest.php"], "tested_paths": [],
                     "untested_paths": [], "not_inspected": []},
        "user_flows": [{"name": "Do it", "status": "working", "breaks_at": None,
                        "evidence": ["a.php:1"]}],
        "bugs": [{"id": "alpha-bug-01", "title": "Boom", "severity": "critical",
                  "type": "runtime_error", "description": "d", "repro": "r", "impact": "i",
                  "evidence": ["a.php:2"], "suggested_fix": "f", "effort": "S",
                  "confidence": "high"}],
        "gaps": [], "opportunities": [], "dependencies": [], "open_questions": [],
    },
    {
        "schema_version": "1.0", "slug": "beta", "name": "Beta", "reviewed_at": "2026-07-30",
        "maturity": "stub", "confidence": "low", "state_summary": "Shell only.",
        "surface": {"routes": [], "controllers": [], "packages": [], "models": [],
                    "frontend_pages": [], "queues_jobs": [], "external_deps": []},
        "coverage": {"test_files": [], "tested_paths": [], "untested_paths": [],
                     "not_inspected": ["everything"]},
        "user_flows": [], "bugs": [{"id": "beta-bug-01", "title": "Slow", "severity": "low",
                                    "type": "performance", "description": "d", "repro": "r",
                                    "impact": "i", "evidence": ["b.php:3"],
                                    "suggested_fix": "f", "effort": "M", "confidence": "medium"}],
        "gaps": [{"id": "beta-gap-01", "title": "No UI", "kind": "missing_ui", "description": "d",
                  "expected_by": "x", "blocks": [], "evidence": ["b.php:4"], "effort": "L",
                  "priority": "P1"}],
        "opportunities": [], "dependencies": ["alpha"], "open_questions": [],
    },
]

FIXTURE_PROJECT = {
    "schema_version": "1.0", "project_name": "Fixture", "reviewed_at": "2026-07-30",
    "git_commit": "abc1234", "method": "selftest", "summary": "s",
    "features": [{"slug": "alpha", "name": "Alpha", "maturity": "beta", "confidence": "high",
                  "file": "features/alpha.json"},
                 {"slug": "beta", "name": "Beta", "maturity": "stub", "confidence": "low",
                  "file": "features/beta.json"}],
    "cross_cutting": [], "top_findings": [{"ref": "alpha-bug-01", "feature": "alpha", "why": "w"}],
    "recommended_sequence": [{"step": 1, "action": "a", "rationale": "r", "effort": "S"}],
}


def selftest():
    with tempfile.TemporaryDirectory() as tmp:
        recon = Path(tmp) / "recon"
        (recon / "features").mkdir(parents=True)
        (recon / "project.json").write_text(json.dumps(FIXTURE_PROJECT))
        for feature in FIXTURE_FEATURES:
            (recon / "features" / f"{feature['slug']}.json").write_text(json.dumps(feature))

        out, project = build(recon)
        totals = project["totals"]
        assert totals["features"] == 2, totals
        assert totals["by_maturity"] == {"missing": 0, "stub": 1, "alpha": 0, "beta": 1,
                                         "production_ready": 0}, totals
        assert totals["bugs_by_severity"] == {"critical": 1, "high": 0, "medium": 0,
                                              "low": 1}, totals
        assert totals["gaps"] == 1 and totals["opportunities"] == 0, totals
        assert totals["features_without_tests"] == ["beta"], totals
        assert project["features"][0]["counts"]["critical_bugs"] == 1

        # counts survive the round-trip into project.json
        assert json.loads((recon / "project.json").read_text())["totals"] == totals

        html = out.read_text()
        payload_start = html.index(PLACEHOLDER) + len(PLACEHOLDER)
        payload = json.loads(html[payload_start:html.index("</script>", payload_start)])
        assert payload["project"]["project_name"] == "Fixture"
        assert [f["slug"] for f in payload["features"]] == ["alpha", "beta"]
        assert "Fixture" in html
    print("selftest OK")


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("recon_dir", nargs="?", help="directory holding project.json + features/")
    parser.add_argument("--out", help="output HTML path (default <recon-dir>/recon-report.html)")
    parser.add_argument("--template", help="override the bundled template.html")
    parser.add_argument("--selftest", action="store_true", help="run the built-in check and exit")
    args = parser.parse_args()

    if args.selftest:
        selftest()
        return
    if not args.recon_dir:
        parser.error("recon_dir is required (or use --selftest)")

    out, project = build(args.recon_dir, args.out, args.template)
    t = project["totals"]
    print(f"{out}  ({t['features']} features, {t['bugs']} bugs, "
          f"{t['bugs_by_severity']['critical']} critical, {t['gaps']} gaps, "
          f"{t['opportunities']} opportunities)")


if __name__ == "__main__":
    main()
