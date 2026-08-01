# The dashboard

One file. No chart library, no CDN, no build step, no network access at runtime — every chart is
hand-rolled SVG and CSS, and the four lens portraits are inlined as `data:` URIs, so it opens by
double-click from any path and keeps working offline five years from now.

| Section | What it shows |
|---|---|
| Cover | Readiness gauge — two rings: production-ready inside, beta-or-better outside — over a crew line-up of the lenses that ran |
| The review crew | A card per lens: who it is, what it went looking for, and what it filed. With more than one lens, a stacked bar of each lens's bugs, gaps and opportunities |
| Maturity mix | One stacked bar across all features, stub → production-ready |
| Headline numbers | Critical bugs, high bugs, flows that don't complete, features without tests, low-confidence reads — each with its share of the whole |
| Verdict | The rollup's prose assessment |
| Risk map | Every feature as a bubble: maturity across, severity weight up, area is total findings. High and to the left is unfinished *and* dangerous |
| Bugs by feature | Stacked severity bars, ordered by severity weight — click a row to jump to that feature |
| What kind of broken | The same bugs cut by type — runtime error, logic, data integrity, security, performance, UX, a11y, regression — split by severity |
| User-flow health | Working / partial / broken / not implemented across the project, then per feature |
| Planning | Two heat grids: bugs by severity × effort, gaps & opportunities by priority × effort. The dark corner is where the work is pooled |
| Dependency map | Feature × feature matrix, plus which features are most depended on |
| Cross-cutting | One root cause spanning many features, with the affected features as jump links |
| Where to start | Biggest findings and the recommended fix sequence |
| Features | A card per feature — maturity, severity bar, counts — clicking one opens its full read |
| Every finding | Sticky filters (kind, severity, maturity, effort, priority, lens, full-text) over per-feature drill-downs with every cited `path:line` |
| Lens attribution | With more than one lens, each finding carries the lens that filed it — `product`, `security`, `ux` or `e2e` (*Live browser*) — and the filter bar gains a lens selector. A single-lens report shows one crew card and none of the rest |

Light and dark themes with a toggle that persists, deep links (`#feature-slug`), a sortable data
table, keyboard `/` to search, `Copy JSON`, and print styles.

## On the colors

Two hue families carry all the meaning — blue for magnitude and structure, red for severity — each
an ordinal ramp validated with the [`dataviz`](https://github.com/anthropics/skills) palette
validator in both light and dark (monotone lightness, adjacent ΔL ≥ 0.06, light end ≥ 2:1 against
its surface). Severity and status are always named in text, never carried by color alone, and the
reserved status palette is used only for flow state. Which lens filed a finding is carried by its
portrait and its label — never by a hue, so no lens competes with severity for meaning.

## Rebuild without re-running the sweep

```sh
B="sh <plugin>/skills/feature-recon/build_report.sh"

$B docs/recon                  # rebuild the dashboard from the JSON
$B --check docs/recon          # do all the state files still parse?
$B --which                     # which runtime would be used
$B --selftest                  # check the builder itself
```

Edit a JSON file by hand, rebuild, and the report follows. `ERROR` lines block the build; `WARN`
lines (unknown enum values, missing evidence, duplicate ids) are advisory. Exit 127 means no
runtime was found.

When the report directory sits inside its own repository, every `path:line` in `evidence[]` is
resolved against it and a citation that points at a file that isn't there — or past the end of one
that is — comes back as a `WARN`. It is the one automatic check on invented evidence. Copy the
report out of the repo and the check goes quiet, since nothing is left to resolve against.
