# Changelog

All notable changes to this plugin. Follows [semantic versioning](https://semver.org).

The `version` field in `.claude-plugin/plugin.json` is what Claude Code uses as the update cache
key: **users receive changes only when it is bumped.** Pushing commits without bumping it makes
`/plugin update` report "already at the latest version". So every release here is one version bump.

## [0.3.0] — 2026-07-30

The sweep's prompts described **where to look** and **what shape to emit**, but never who to be or how
to find a defect — so a faithful agent produced a competent inventory of what exists instead of a list
of what breaks. This release is mostly prompt work to fix that.

### Added

- **Stance and method** (`report-spec.md` §0). The sweep agent is a senior product engineer doing a
  pre-handover readiness review of a feature they are about to own. Trace the 1–3 real user flows
  through every layer until they break, rather than inventorying files layer by layer. A reading
  budget (15–40 files) and the reminder that defects live on the error path, in the second call, and
  in the brand-new empty account.
- **A defect-pattern pass** (`report-spec.md` §2b). Ten patterns with what each looks like in code:
  sibling divergence (the highest-yield one — diff the feature against its twin), failure paths, input
  validation, authorization and tenancy, atomicity and idempotency, data integrity, contract drift,
  product completeness, cost and performance, and markers-as-leads. §2a's nine categories stay as the
  coverage floor you check afterwards.
- **Calibration** (`report-spec.md` §1). What is *not* a finding (bare TODOs, lint nits, generic
  advice, speculative scale, decisions you merely disagree with); a self-test for bugs (name the input
  and the wrong outcome) and for gaps (name who expects it); severity anchors for all four levels; and
  confidence tied to what you actually read.
- **A pre-submit checklist** (`report-spec.md` §6): re-open every citation, check `maturity` against
  the flows, and flag anything that looks like shared infrastructure so the lead promotes it to
  `cross_cutting` once instead of it being filed in eight files.
- **Citation checking in both builders.** Every `path:line` in `evidence[]` is resolved against the
  repo the report lives in; a citation pointing at a file that isn't there, or past the end of one that
  is, comes back as a `WARN`. The one automatic check on invented evidence. Silent when no `.git` sits
  above the recon dir, so a report copied out of its repo doesn't warn about everything.
- **`## Risk` in the task template.** Sibling callers the fix also changes, artifacts already in the
  wild it invalidates, and how it should roll out. `feature-tasks` already told Claude to work this
  out; there was nowhere in the template to write it down.
- **`Needs a decision` in the task index.** Findings that are product or design questions don't get a
  patch written for them — they get the question and who answers it.

### Changed

- The per-feature subagent prompt carries the stance, the method, the reading budget, explicit
  read-only latitude, and what to do when a feature turns out not to exist. It also returns finding
  counts by severity, so a suspiciously empty sweep is visible and can be re-run.
- The orientation brief now captures the repo's **shared abstractions** (base classes, middleware,
  auth/tenancy mechanism, shared clients) and test conventions — without them a sibling comparison is
  impossible and cross-cutting causes stay invisible.
- The rollup looks for **negative space**: what is uniformly absent across every feature, which is the
  one thing a per-feature agent structurally cannot see.
- `feature-tasks` re-judges severity against product impact while re-verifying, and says how a
  behaviour-changing fix should land (flag, stages, grace period).

### Fixed

- Warnings were printed twice on every build: `Problems.report()` is called once after linting and
  again after `derive()`, and re-printed everything the first call had already shown.
- An `ERROR` from `derive()` — `project.json` indexing a feature with no file — was printed but did not
  block the build, which then wrote a report anyway and exited 0. `ERROR` now means what the README
  says it means.

## [0.2.0] — 2026-07-30

### Added

- **Node builder.** `build_report.js` is a port of `build_report.py` using Node builtins only. The
  plugin no longer requires Python: either `python3` (3.6+) or `node` (14+) will do.
- **`build_report.sh`.** POSIX-sh wrapper that detects the runtime and dispatches. This is now the
  only entry point the skills call. `FEATURE_RECON_RUNTIME=python3|node` forces one; `--which`
  prints what would run; exit 127 means neither runtime is installed.
- **`--check <recon-dir>`** on both builders: parse every state file and report which ones are
  broken. Replaces the `python3 -m json.tool` loop in the sweep's verify step, which was the last
  hard Python dependency in the procedure.
- **`tests/parity.sh`.** Runs both selftests, then builds one deliberately nasty fixture (non-ASCII,
  a `</script>` in prose, a bad enum, a duplicate finding id, a dangling `top_findings` ref) with
  each runtime and diffs the HTML, the rewritten `project.json`, the lint output and the summary
  line. Also checks that either runtime can rebuild the other's output identically.

### Changed

- The two builders emit **byte-identical** output, including `ensure_ascii`-style escaping of the
  embedded JSON, so switching runtimes never shows up as a diff in a committed report.
- Docs, skills and templates now invoke `sh <plugin>/skills/feature-recon/build_report.sh` instead
  of `python3 .../build_report.py`. Calling either builder directly still works and is supported.
- `feature-recon` SKILL.md tells Claude what to do when no runtime exists: report the JSON paths and
  stop, rather than hand-rendering HTML or hand-computing counts.

## [0.1.0]

- Initial release: `/feature-recon` sweep, `/feature-tasks` task generation, the JSON report spec,
  and the self-contained HTML dashboard.
