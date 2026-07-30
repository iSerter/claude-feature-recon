# Changelog

All notable changes to this plugin. Follows [semantic versioning](https://semver.org).

The `version` field in `.claude-plugin/plugin.json` is what Claude Code uses as the update cache
key: **users receive changes only when it is bumped.** Pushing commits without bumping it makes
`/plugin update` report "already at the latest version". So every release here is one version bump.

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
