#!/usr/bin/env node
/**
 * Build a self-contained HTML dashboard from feature-recon JSON state files.
 *
 *     node build_report.js <recon-dir> [--out PATH]
 *     node build_report.js --check <recon-dir>
 *     node build_report.js --selftest
 *
 * Reads <recon-dir>/project.json and <recon-dir>/features/*.json, lints them against the
 * report spec, derives every count (so the model never has to do arithmetic), writes the
 * counts back into project.json, and injects the merged payload into template.html.
 *
 * Node builtins only. No install step. Port of build_report.py — same CLI, same output
 * bytes; either script can build a report the other one built.
 */

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const MATURITY = ["missing", "stub", "alpha", "beta", "production_ready"];
const SEVERITY = ["critical", "high", "medium", "low"];
const CONFIDENCE = ["high", "medium", "low"];
const EFFORT = ["S", "M", "L"];
const PRIORITY = ["P0", "P1", "P2", "P3"];
const VALUE = ["high", "medium", "low"];
const FLOW_STATUS = ["working", "partial", "broken", "not_implemented"];
const BUG_TYPE = ["runtime_error", "logic", "data_integrity", "security",
  "performance", "ux", "regression"];
const GAP_KIND = ["missing_feature", "missing_validation", "missing_tests",
  "missing_error_handling", "missing_ui", "unwired"];

const FEATURE_KEYS = ["slug", "name", "maturity", "confidence", "state_summary", "surface",
  "coverage", "user_flows", "bugs", "gaps", "opportunities",
  "dependencies", "open_questions"];

const PLACEHOLDER = '<script id="recon-data" type="application/json">';

const DOC = [
  "Build a self-contained HTML dashboard from feature-recon JSON state files.",
  "",
  "usage: build_report.js [-h] [--out OUT] [--template TEMPLATE] [--check] [--selftest] [recon_dir]",
  "",
  "  recon_dir            directory holding project.json + features/",
  "  --out OUT            output HTML path (default <recon-dir>/recon-report.html)",
  "  --template TEMPLATE  override the bundled template.html",
  "  --check              only check that every JSON file parses, then exit",
  "  --selftest           run the built-in check and exit",
].join("\n");

/** A SystemExit-alike: message to stderr (when set), then exit with `code`. */
class Exit extends Error {
  constructor(message, code = 1) {
    super(message);
    this.code = code;
  }
}

/** Collected lint output. Errors block the build, warnings don't. */
class Problems {
  constructor() {
    this.errors = [];
    this.warnings = [];
  }

  error(msg) {
    this.errors.push(msg);
  }

  warn(msg) {
    this.warnings.push(msg);
  }

  report() {
    for (const w of this.warnings) console.error(`WARN  ${w}`);
    for (const e of this.errors) console.error(`ERROR ${e}`);
    return this.errors.length === 0;
  }
}

/** Python's repr() for the values that reach our lint messages. */
function repr(value) {
  if (typeof value === "string") return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
  if (value === null || value === undefined) return "None";
  if (value === true) return "True";
  if (value === false) return "False";
  if (Array.isArray(value)) return `[${value.map(repr).join(", ")}]`;
  return String(value);
}

/** json.JSONDecodeError's line/col, so both scripts point at the same character. */
function lineCol(text, position) {
  const upto = text.slice(0, position);
  const nl = upto.lastIndexOf("\n");
  return { line: upto.split("\n").length, col: position - nl };
}

function parseError(text, exc) {
  const match = /position (\d+)/.exec(exc.message);
  if (match) {
    const { line, col } = lineCol(text, Number(match[1]));
    return `invalid JSON at line ${line} col ${col}: ${exc.message.split(" in JSON at position")[0]}`;
  }
  return `invalid JSON: ${exc.message}`;
}

function loadJson(file, problems) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (exc) {
    problems.error(`${file}: ${exc.message}`);
    return null;
  }
  try {
    return JSON.parse(text);
  } catch (exc) {
    problems.error(`${file}: ${parseError(text, exc)}`);
    return null;
  }
}

function checkEnum(problems, where, field, value, allowed) {
  if (!allowed.includes(value)) {
    problems.warn(`${where}: ${field}=${repr(value)} is not one of ${repr(allowed)}`);
  }
}

function lintFeature(feature, file, problems, seenIds) {
  const where = path.basename(file);
  for (const key of FEATURE_KEYS) {
    if (!(key in feature)) problems.warn(`${where}: missing key ${repr(key)}`);
  }

  checkEnum(problems, where, "maturity", feature.maturity, MATURITY);
  checkEnum(problems, where, "confidence", feature.confidence, CONFIDENCE);

  for (const flow of feature.user_flows || []) {
    checkEnum(problems, where, "user_flows[].status", flow.status, FLOW_STATUS);
  }

  for (const bug of feature.bugs || []) {
    checkEnum(problems, where, "bugs[].severity", bug.severity, SEVERITY);
    checkEnum(problems, where, "bugs[].type", bug.type, BUG_TYPE);
    checkEnum(problems, where, "bugs[].effort", bug.effort, EFFORT);
  }
  for (const gap of feature.gaps || []) {
    checkEnum(problems, where, "gaps[].kind", gap.kind, GAP_KIND);
    checkEnum(problems, where, "gaps[].effort", gap.effort, EFFORT);
    checkEnum(problems, where, "gaps[].priority", gap.priority, PRIORITY);
  }
  for (const opp of feature.opportunities || []) {
    checkEnum(problems, where, "opportunities[].value", opp.value, VALUE);
    checkEnum(problems, where, "opportunities[].effort", opp.effort, EFFORT);
    checkEnum(problems, where, "opportunities[].priority", opp.priority, PRIORITY);
  }

  for (const kind of ["bugs", "gaps", "opportunities"]) {
    for (const finding of feature[kind] || []) {
      const fid = finding.id;
      if (!fid) {
        problems.warn(`${where}: a ${kind.slice(0, -1)} has no id (${repr(finding.title)})`);
      } else if (seenIds.has(fid)) {
        problems.warn(`${where}: duplicate finding id ${repr(fid)} (also in ${seenIds.get(fid)})`);
      } else {
        seenIds.set(fid, where);
      }
      const evidence = finding.evidence;
      if (!evidence || (Array.isArray(evidence) && evidence.length === 0)) {
        problems.warn(`${where}: ${repr(fid || finding.title)} has no evidence`);
      }
    }
  }
}

/** Compute per-feature counts and project totals from the feature files. */
function derive(project, features, problems) {
  const bySlug = new Map();
  for (const f of features) if (f.slug) bySlug.set(f.slug, f);
  const index = project.features || [];

  for (const entry of index) {
    if (!bySlug.has(entry.slug)) {
      problems.error(`project.json indexes ${repr(entry.slug)} but no feature file exists`);
    }
  }
  for (const slug of bySlug.keys()) {
    if (!index.some((e) => e.slug === slug)) {
      problems.warn(`features/${slug}.json exists but project.json does not index it`);
    }
  }

  const totals = {
    features: features.length,
    by_maturity: Object.fromEntries(MATURITY.map((m) => [m, 0])),
    bugs_by_severity: Object.fromEntries(SEVERITY.map((s) => [s, 0])),
    bugs: 0,
    gaps: 0,
    opportunities: 0,
    test_files: 0,
    features_without_tests: [],
  };

  for (const feature of features) {
    const bugs = feature.bugs || [];
    const bySev = Object.fromEntries(
      SEVERITY.map((s) => [s, bugs.filter((b) => b.severity === s).length]));
    const tests = (feature.coverage || {}).test_files || [];
    feature.counts = {
      bugs: bugs.length,
      bugs_by_severity: bySev,
      critical_bugs: bySev.critical,
      gaps: (feature.gaps || []).length,
      opportunities: (feature.opportunities || []).length,
      test_files: tests.length,
      flows_broken: (feature.user_flows || []).filter(
        (f) => f.status === "broken" || f.status === "not_implemented").length,
    };

    const maturity = feature.maturity;
    if (MATURITY.includes(maturity)) totals.by_maturity[maturity] += 1;
    for (const sev of SEVERITY) totals.bugs_by_severity[sev] += bySev[sev];
    totals.bugs += bugs.length;
    totals.gaps += feature.counts.gaps;
    totals.opportunities += feature.counts.opportunities;
    totals.test_files += tests.length;
    if (tests.length === 0) totals.features_without_tests.push(feature.slug);
  }

  project.totals = totals;

  // Mirror the derived counts into the rollup index so project.json stands alone.
  for (const entry of index) {
    const feature = bySlug.get(entry.slug);
    if (feature) {
      entry.counts = feature.counts;
      if (!("maturity" in entry)) entry.maturity = feature.maturity;
      if (!("confidence" in entry)) entry.confidence = feature.confidence;
    }
  }

  const refs = new Set();
  for (const f of features) {
    for (const kind of ["bugs", "gaps", "opportunities"]) {
      for (const x of f[kind] || []) refs.add(x.id);
    }
  }
  for (const top of project.top_findings || []) {
    if (top.ref && !refs.has(top.ref)) {
      problems.warn(`top_findings references unknown finding id ${repr(top.ref)}`);
    }
  }

  return project;
}

/** Report order = project.json's index order, with any unindexed files appended. */
function orderFeatures(project, features) {
  const order = (project.features || []).map((e) => e.slug);
  const rank = new Map(order.map((slug, i) => [slug, i]));
  const rankOf = (f) => (rank.has(f.slug) ? rank.get(f.slug) : rank.size);
  return features.slice().sort((a, b) => {
    const diff = rankOf(a) - rankOf(b);
    if (diff !== 0) return diff;
    const [sa, sb] = [a.slug || "", b.slug || ""];
    return sa < sb ? -1 : sa > sb ? 1 : 0;
  });
}

/** json.dumps(..., ensure_ascii=True): escape everything outside printable ASCII. */
function dumpsAscii(value) {
  return JSON.stringify(value).replace(/[\u007f-\uffff]/g,
    (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
}

function render(template, payload) {
  if (!template.includes(PLACEHOLDER)) {
    throw new Exit(`template is missing the ${repr(PLACEHOLDER)} data slot`);
  }
  const blob = dumpsAscii(payload).replace(/<\//g, "<\\/");
  const start = template.indexOf(PLACEHOLDER);
  const head = template.slice(0, start);
  const rest = template.slice(start + PLACEHOLDER.length);
  const close = rest.indexOf("</script>");
  if (close === -1) throw new Exit("template's recon-data script tag is never closed");
  const tail = rest.slice(close + "</script>".length);
  return `${head}${PLACEHOLDER}${blob}</script>${tail}`;
}

function featurePaths(reconDir) {
  const dir = path.join(reconDir, "features");
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  return names.filter((n) => n.endsWith(".json")).sort().map((n) => path.join(dir, n));
}

function build(reconDir, outPath = null, templatePath = null) {
  const problems = new Problems();

  const projectPath = path.join(reconDir, "project.json");
  if (!fs.existsSync(projectPath)) throw new Exit(`no project.json in ${reconDir}`);
  const project = loadJson(projectPath, problems);
  if (project === null) {
    problems.report();
    throw new Exit(null);
  }

  const paths = featurePaths(reconDir);
  if (paths.length === 0) {
    throw new Exit(`no feature files in ${path.join(reconDir, "features")}`);
  }

  const features = [];
  const seenIds = new Map();
  for (const file of paths) {
    const feature = loadJson(file, problems);
    if (feature === null) continue;
    if (!("slug" in feature)) feature.slug = path.basename(file, ".json");
    lintFeature(feature, file, problems, seenIds);
    features.push(feature);
  }

  if (!problems.report()) throw new Exit(null);

  const ordered = orderFeatures(project, features);
  derive(project, ordered, problems);
  problems.report();  // derive() can add warnings; they never block

  fs.writeFileSync(projectPath, JSON.stringify(project, null, 2) + "\n");

  const template = templatePath || path.join(__dirname, "template.html");
  const out = outPath || path.join(reconDir, "recon-report.html");
  fs.writeFileSync(out, render(fs.readFileSync(template, "utf8"),
    { project, features: ordered }));
  return { out, project };
}

/**
 * --check: does every state file parse? Nothing else.
 *
 * Runs mid-sweep, before project.json exists, so a missing file is skipped rather than failed.
 */
function check(reconDir) {
  const projectPath = path.join(reconDir, "project.json");
  const files = fs.existsSync(projectPath) ? [projectPath] : [];
  files.push(...featurePaths(reconDir));
  if (files.length === 0) throw new Exit(`no JSON state files in ${reconDir}`);
  let bad = 0;
  for (const file of files) {
    const problems = new Problems();
    if (loadJson(file, problems) === null) {
      for (const e of problems.errors) console.log(`BAD: ${e}`);
      bad += 1;
    }
  }
  if (bad) throw new Exit(`${bad} of ${files.length} files did not parse`);
  console.log(`OK ${files.length} JSON files parse`);
}

const FIXTURE_FEATURES = [
  {
    schema_version: "1.0", slug: "alpha", name: "Alpha", reviewed_at: "2026-07-30",
    maturity: "beta", confidence: "high", state_summary: "Works.",
    surface: {
      routes: ["GET /alpha"], controllers: [], packages: [], models: [],
      frontend_pages: [], queues_jobs: [], external_deps: [],
    },
    coverage: {
      test_files: ["tests/AlphaTest.php"], tested_paths: [],
      untested_paths: [], not_inspected: [],
    },
    user_flows: [{ name: "Do it", status: "working", breaks_at: null, evidence: ["a.php:1"] }],
    bugs: [{
      id: "alpha-bug-01", title: "Boom", severity: "critical",
      type: "runtime_error", description: "d", repro: "r", impact: "i",
      evidence: ["a.php:2"], suggested_fix: "f", effort: "S", confidence: "high",
    }],
    gaps: [], opportunities: [], dependencies: [], open_questions: [],
  },
  {
    schema_version: "1.0", slug: "beta", name: "Beta", reviewed_at: "2026-07-30",
    maturity: "stub", confidence: "low", state_summary: "Shell only.",
    surface: {
      routes: [], controllers: [], packages: [], models: [],
      frontend_pages: [], queues_jobs: [], external_deps: [],
    },
    coverage: {
      test_files: [], tested_paths: [], untested_paths: [], not_inspected: ["everything"],
    },
    user_flows: [],
    bugs: [{
      id: "beta-bug-01", title: "Slow", severity: "low", type: "performance",
      description: "d", repro: "r", impact: "i", evidence: ["b.php:3"],
      suggested_fix: "f", effort: "M", confidence: "medium",
    }],
    gaps: [{
      id: "beta-gap-01", title: "No UI", kind: "missing_ui", description: "d",
      expected_by: "x", blocks: [], evidence: ["b.php:4"], effort: "L", priority: "P1",
    }],
    opportunities: [], dependencies: ["alpha"], open_questions: [],
  },
];

const FIXTURE_PROJECT = {
  schema_version: "1.0", project_name: "Fixture", reviewed_at: "2026-07-30",
  git_commit: "abc1234", method: "selftest", summary: "s",
  features: [
    { slug: "alpha", name: "Alpha", maturity: "beta", confidence: "high", file: "features/alpha.json" },
    { slug: "beta", name: "Beta", maturity: "stub", confidence: "low", file: "features/beta.json" },
  ],
  cross_cutting: [], top_findings: [{ ref: "alpha-bug-01", feature: "alpha", why: "w" }],
  recommended_sequence: [{ step: 1, action: "a", rationale: "r", effort: "S" }],
};

function assert(condition, message) {
  if (!condition) throw new Error(`selftest: ${message}`);
}

function eq(actual, expected, label) {
  assert(JSON.stringify(actual) === JSON.stringify(expected),
    `${label}: got ${JSON.stringify(actual)}`);
}

function selftest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "feature-recon-"));
  try {
    const recon = path.join(tmp, "recon");
    fs.mkdirSync(path.join(recon, "features"), { recursive: true });
    fs.writeFileSync(path.join(recon, "project.json"), JSON.stringify(FIXTURE_PROJECT));
    for (const feature of FIXTURE_FEATURES) {
      fs.writeFileSync(path.join(recon, "features", `${feature.slug}.json`),
        JSON.stringify(feature));
    }

    const { out, project } = build(recon);
    const totals = project.totals;
    eq(totals.features, 2, "totals.features");
    eq(totals.by_maturity,
      { missing: 0, stub: 1, alpha: 0, beta: 1, production_ready: 0 }, "by_maturity");
    eq(totals.bugs_by_severity, { critical: 1, high: 0, medium: 0, low: 1 }, "bugs_by_severity");
    assert(totals.gaps === 1 && totals.opportunities === 0, `gaps/opps: ${JSON.stringify(totals)}`);
    eq(totals.features_without_tests, ["beta"], "features_without_tests");
    eq(project.features[0].counts.critical_bugs, 1, "alpha critical_bugs");

    // counts survive the round-trip into project.json
    eq(JSON.parse(fs.readFileSync(path.join(recon, "project.json"), "utf8")).totals,
      totals, "project.json round-trip");

    const html = fs.readFileSync(out, "utf8");
    const start = html.indexOf(PLACEHOLDER) + PLACEHOLDER.length;
    const payload = JSON.parse(html.slice(start, html.indexOf("</script>", start)));
    eq(payload.project.project_name, "Fixture", "payload project_name");
    eq(payload.features.map((f) => f.slug), ["alpha", "beta"], "payload feature order");
    assert(html.includes("Fixture"), "rendered HTML does not mention the project name");

    check(recon);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log("selftest OK");
}

function parseArgs(argv) {
  const args = { recon_dir: null, out: null, template: null, check: false, selftest: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      console.log(DOC);
      throw new Exit(null, 0);
    } else if (arg === "--selftest") {
      args.selftest = true;
    } else if (arg === "--check") {
      args.check = true;
    } else if (arg === "--out" || arg === "--template") {
      const value = argv[i + 1];
      if (value === undefined) throw new Exit(`argument ${arg}: expected one argument`, 2);
      args[arg.slice(2)] = value;
      i += 1;
    } else if (arg.startsWith("--out=") || arg.startsWith("--template=")) {
      const [flag, ...value] = arg.split("=");
      args[flag.slice(2)] = value.join("=");
    } else if (arg.startsWith("-")) {
      throw new Exit(`unrecognized argument: ${arg}`, 2);
    } else if (args.recon_dir === null) {
      args.recon_dir = arg;
    } else {
      throw new Exit(`unrecognized argument: ${arg}`, 2);
    }
  }
  return args;
}

function main(argv) {
  const args = parseArgs(argv);

  if (args.selftest) {
    selftest();
    return;
  }
  if (!args.recon_dir) throw new Exit("recon_dir is required (or use --selftest)", 2);
  if (args.check) {
    check(args.recon_dir);
    return;
  }

  const { out, project } = build(args.recon_dir, args.out, args.template);
  const t = project.totals;
  console.log(`${out}  (${t.features} features, ${t.bugs} bugs, ` +
    `${t.bugs_by_severity.critical} critical, ${t.gaps} gaps, ` +
    `${t.opportunities} opportunities)`);
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (exc) {
    if (exc instanceof Exit) {
      if (exc.message) console.error(exc.message);
      process.exit(exc.code);
    }
    throw exc;
  }
}
