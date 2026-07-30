# feature-recon

A Claude Code plugin that sweeps a codebase feature by feature and tells you, with citations, what
works, what's broken, what's missing and what isn't tested — as JSON state files plus a
self-contained HTML dashboard.

It is **reconnaissance, not ground truth**: a static read of the code that cites `path:line` for
every claim and declares what it could not inspect. Read-only — it never changes your code.

## Install

```sh
/plugin marketplace add https://github.com/iSerter/claude-feature-recon
/plugin install feature-recon
```

A local checkout works too — pass its path instead of the URL. Requires `python3` (stdlib only,
nothing to install) and `git` for the commit stamp.

## Use

```
/feature-recon                          # discover features, confirm the list, sweep everything
/feature-recon brands,campaigns,billing # sweep exactly these
/feature-recon --dir docs/state         # write somewhere other than docs/recon
/feature-recon --sequential             # no subagent fan-out, one feature at a time
```

The skill also triggers on plain requests like "review the state of this project", "which features
are untested", or "build me a project state dashboard".

## What you get

```
docs/recon/
  project.json              rollup: verdict, cross-cutting findings, top findings, sequence, totals
  features/{slug}.json      one per feature: maturity, surface, coverage, flows, bugs, gaps, opps
  recon-report.html         the dashboard — one file, opens by double-click, works offline
```

Each finding carries a stable id (`billing-bug-01`), an effort estimate, and the evidence it came
from, so consecutive runs diff cleanly in git and findings can be referenced in tickets.

## How it works

1. **Orient** — one pass over the repo for stack, entrypoints, module layout, test locations.
2. **Discover** — derive the feature list from the product's own navigation, or from module/package
   dirs, or route groups. You confirm the list before anything expensive happens.
3. **Sweep** — one subagent per feature, in batches, each reading the code and writing its own JSON
   state file against `reference/report-spec.md`.
4. **Roll up** — the verdict, the cross-cutting root causes, the ranked findings and a recommended
   fix sequence.
5. **Build** — `build_report.py` validates every file, derives all counts (no hand arithmetic), and
   injects the data into the dashboard template.

## The dashboard

One file. No chart library, no CDN, no build step, no network access at runtime — every chart is
hand-rolled SVG and CSS, so it opens by double-click and keeps working offline five years from now.

| Section | What it shows |
|---|---|
| Cover | Readiness gauge — two rings: production-ready inside, beta-or-better outside |
| Maturity mix | One stacked bar across all features, stub → production-ready |
| Headline numbers | Critical bugs, high bugs, flows that don't complete, features without tests, low-confidence reads |
| Verdict | The rollup's prose assessment |
| Bugs by feature | Stacked severity bars, ordered by severity weight — click a row to jump to that feature |
| Planning | Two heat grids: bugs by severity × effort, gaps & opportunities by priority × effort. The dark corner is where the work is pooled |
| Dependency map | Feature × feature matrix, plus which features are most depended on |
| Cross-cutting | One root cause spanning many features, with the affected features as jump links |
| Where to start | Biggest findings and the recommended fix sequence |
| Features | A card per feature — maturity, severity bar, counts — clicking one opens its full read |
| Every finding | Sticky filters (kind, severity, maturity, effort, priority, full-text) over per-feature drill-downs with every cited `path:line` |

Light and dark themes with a toggle that persists, deep links (`#feature-slug`), a sortable data
table, keyboard `/` to search, `Copy JSON`, and print styles.

**On the colors:** two hue families carry all the meaning — blue for magnitude and structure, red
for severity — each an ordinal ramp validated with the [`dataviz`](https://github.com/anthropics/skills)
palette validator in both light and dark (monotone lightness, adjacent ΔL ≥ 0.06, light end ≥ 2:1
against its surface). Severity and status are always named in text, never carried by color alone,
and the reserved status palette is used only for flow state.

## Rebuild the dashboard without re-running the sweep

```sh
python3 <plugin>/skills/feature-recon/build_report.py docs/recon
python3 <plugin>/skills/feature-recon/build_report.py --selftest   # check the script itself
```

Edit a JSON file by hand, rebuild, and the report follows. `ERROR` lines block the build; `WARN`
lines (unknown enum values, missing evidence, duplicate ids) are advisory.

## Files

| Path | What it is |
|---|---|
| `skills/feature-recon/SKILL.md` | the procedure Claude follows |
| `skills/feature-recon/reference/report-spec.md` | the JSON contract, handed to each subagent |
| `skills/feature-recon/build_report.py` | validate + derive counts + render (stdlib only) |
| `skills/feature-recon/template.html` | the dashboard template |
| `commands/feature-recon.md` | the `/feature-recon` entry point |

## Limits

- Static analysis only: no app runtime, no database, no test execution. Nothing here depends on a
  test passing — if you want that signal, run the suite yourself and re-sweep.
- Snapshot, not a time series. Commit `docs/recon/` and `git log` is your history.
- Costs scale with feature count — a 16-feature sweep is 16 subagents' worth of reading.

## License

MIT — see [LICENSE.md](LICENSE.md).
