#!/usr/bin/env python3
"""Build a self-contained HTML dashboard from feature-recon JSON state files.

    python3 build_report.py <recon-dir> [--out PATH]
    python3 build_report.py --check <recon-dir>
    python3 build_report.py --selftest

Reads <recon-dir>/project.json and <recon-dir>/features/*.json, lints them against the
report spec, derives every count (so the model never has to do arithmetic), writes the
counts back into project.json, and injects the merged payload into template.html.

Stdlib only. No install step. build_report.js is a port of this script with the same CLI
and byte-identical output; build_report.sh picks whichever runtime the machine has.
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
        """Print what has accumulated. Warnings are cleared so a second call cannot repeat them;
        errors are kept because callers branch on them."""
        for w in self.warnings:
            print(f"WARN  {w}", file=sys.stderr)
        self.warnings = []
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


def count_lines(path):
    """Lines in a file, or None when it cannot be read."""
    try:
        data = path.read_bytes()
    except OSError:
        return None
    if not data:
        return 0
    return data.count(b"\n") + (0 if data.endswith(b"\n") else 1)


class Citations:
    """Resolves `path:line` evidence against the repo the report lives in.

    The only automatic check on invented evidence: a finding whose citation points at a file that
    is not there, or past the end of one that is, gets a WARN naming it. Advisory, never blocking —
    the code may simply have moved since the sweep.

    Disabled (every check a no-op) when no `.git` sits above <recon-dir>, so a report copied out of
    its repository does not warn about every citation it can no longer resolve.
    """

    def __init__(self, recon_dir):
        self.root = None
        self.lines = {}
        here = Path(recon_dir).resolve()
        for d in [here] + list(here.parents):
            if (d / ".git").exists():
                self.root = d
                break

    def check(self, problems, where, label, evidence):
        if self.root is None or not isinstance(evidence, list):
            return
        for cite in evidence:
            if not isinstance(cite, str):
                continue
            rel, _, lineno = cite.rpartition(":")
            # Anything that is not repo-relative `path:line` is prose or a bare path: not ours.
            if not rel or not lineno.isdigit() or int(lineno) < 1:
                continue
            if rel.startswith("/") or ".." in Path(rel).parts:
                continue
            if rel not in self.lines:
                self.lines[rel] = count_lines(self.root / rel)
            total = self.lines[rel]
            if total is None:
                problems.warn(f"{where}: {label} cites {cite!r} but that file does not exist")
            elif int(lineno) > total:
                problems.warn(
                    f"{where}: {label} cites {cite!r} but {rel} has {total} lines")


def lint_feature(feature, path, problems, seen_ids, citations):
    where = path.name
    for key in FEATURE_KEYS:
        if key not in feature:
            problems.warn(f"{where}: missing key {key!r}")

    check_enum(problems, where, "maturity", feature.get("maturity"), MATURITY)
    check_enum(problems, where, "confidence", feature.get("confidence"), CONFIDENCE)

    for flow in feature.get("user_flows", []):
        check_enum(problems, where, "user_flows[].status", flow.get("status"), FLOW_STATUS)
        citations.check(problems, where, repr(flow.get("name")), flow.get("evidence"))

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
            label = repr(fid or finding.get("title"))
            if not finding.get("evidence"):
                problems.warn(f"{where}: {label} has no evidence")
            else:
                citations.check(problems, where, label, finding.get("evidence"))


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

    citations = Citations(recon_dir)
    features = []
    seen_ids = {}
    for path in feature_paths:
        feature = load_json(path, problems)
        if feature is None:
            continue
        feature.setdefault("slug", path.stem)
        lint_feature(feature, path, problems, seen_ids, citations)
        features.append(feature)

    for entry in project.get("cross_cutting") or []:
        citations.check(problems, "project.json", repr(entry.get("id")), entry.get("evidence"))

    if not problems.report():
        raise SystemExit(1)

    features = order_features(project, features)
    derive(project, features, problems)
    if not problems.report():  # derive() warnings never block, but its errors do
        raise SystemExit(1)

    project_path.write_text(json.dumps(project, indent=2, ensure_ascii=False) + "\n")

    template_path = Path(template_path or Path(__file__).parent / "template.html")
    out_path = Path(out_path or recon_dir / "recon-report.html")
    out_path.write_text(render(template_path.read_text(),
                               {"project": project, "features": features}))
    return out_path, project


def check(recon_dir):
    """--check: does every state file parse? Nothing else.

    Runs mid-sweep, before project.json exists, so a missing file is skipped rather than failed.
    """
    recon_dir = Path(recon_dir)
    files = [p for p in [recon_dir / "project.json"] if p.exists()]
    files += sorted((recon_dir / "features").glob("*.json"))
    if not files:
        raise SystemExit(f"no JSON state files in {recon_dir}")
    bad = 0
    for path in files:
        problems = Problems()
        if load_json(path, problems) is None:
            for err in problems.errors:
                print(f"BAD: {err}")
            bad += 1
    if bad:
        raise SystemExit(f"{bad} of {len(files)} files did not parse")
    print(f"OK {len(files)} JSON files parse")


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

        check(recon)
    print("selftest OK")


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("recon_dir", nargs="?", help="directory holding project.json + features/")
    parser.add_argument("--out", help="output HTML path (default <recon-dir>/recon-report.html)")
    parser.add_argument("--template", help="override the bundled template.html")
    parser.add_argument("--check", action="store_true",
                        help="only check that every JSON file parses, then exit")
    parser.add_argument("--selftest", action="store_true", help="run the built-in check and exit")
    args = parser.parse_args()

    if args.selftest:
        selftest()
        return
    if not args.recon_dir:
        parser.error("recon_dir is required (or use --selftest)")
    if args.check:
        check(args.recon_dir)
        return

    out, project = build(args.recon_dir, args.out, args.template)
    t = project["totals"]
    print(f"{out}  ({t['features']} features, {t['bugs']} bugs, "
          f"{t['bugs_by_severity']['critical']} critical, {t['gaps']} gaps, "
          f"{t['opportunities']} opportunities)")


if __name__ == "__main__":
    main()
