---
name: feature-recon
description: Sweep a codebase feature by feature and produce an evidence-cited state report plus an HTML dashboard — per-feature maturity, bugs, gaps, opportunities, test coverage. Use when the user asks to review or audit the state of a project, asks "what's the state of this codebase", wants a feature maturity or readiness report, asks which features are broken/untested/incomplete, or wants a project state dashboard. Read-only; it reports, it does not fix.
---

# Feature Recon

A reconnaissance sweep, not an authoritative audit: it reports what it actually read, cites
`path:line` for every claim, and declares its blind spots. Output is one JSON state file per
feature, a rollup, and a self-contained HTML dashboard built from them.

Bundled files live beside this SKILL.md (`${CLAUDE_PLUGIN_ROOT}/skills/feature-recon/`):
`reference/report-spec.md`, `build_report.py`, `template.html`. Always pass absolute paths.

## Procedure

### 1. Resolve arguments

- `<recon-dir>` — default `docs/recon`, or `--dir <path>`.
- Explicit feature list, if the user gave one → skip step 3.
- `--sequential` → skip the fan-out in step 4 and sweep features one at a time in this context.

### 2. Orient once

Gather this **once** and reuse it in every subagent prompt, so N agents don't each re-derive it:

```sh
git rev-parse --short HEAD && git log -1 --date=short --format=%ad
```

Plus, from a quick look at the repo root: project name, stack/framework, and where these live —
entrypoints/routes, domain modules, models/migrations, UI pages, tests. Read the root README and
`CLAUDE.md`/`AGENTS.md` if present. Keep it to ~15 lines; this is the **orientation brief**.

### 3. Discover the feature list

First source that yields a clean list wins:

1. A nav definition — sidebar/menu/tab component, or a nav config file. Best signal: it is the
   product's own view of its features.
2. Top-level domain modules or packages — `packages/*`, `src/modules/*`, `apps/*`, Django apps.
3. Route groups — prefixes in the router (`/brands`, `/campaigns`, …).
4. Top-level service dirs — `cmd/*`, `services/*`.

Then **show the user the derived list and ask them to confirm or edit it before sweeping.** A wrong
list wastes the whole run. Note the source you used, and flag anything feature-flagged or clearly
internal. Aim for 5–25 features: merge trivia, split anything that is obviously two products.

Slugs are kebab-case and stable — they are the JSON filenames and the dashboard's deep links.

### 4. Sweep

Default: fan out **one subagent per feature, in batches of 3–4** (a batch = one message with
multiple Agent calls). Sequential mode: do the same work yourself, one feature at a time.

Each agent prompt contains, in this order:

1. The orientation brief from step 2.
2. `You are auditing exactly one feature: {name} (slug: {slug}).`
3. `Read <abs>/reference/report-spec.md and follow it exactly.`
4. `Write your result to <abs recon-dir>/features/{slug}.json. Return only a 3-line summary:
   maturity, biggest finding, anything you could not inspect.`
5. Any feature-specific pointers you already know (its route prefix, its package dir).

The JSON file is the deliverable — never ask an agent to return the report body in its response.

### 5. Verify

```sh
for f in <recon-dir>/features/*.json; do python3 -m json.tool "$f" >/dev/null || echo "BAD: $f"; done
```

Re-run a failed or missing feature once. If it fails twice, write a minimal file for it with
`confidence: "low"` and the failure recorded in `coverage.not_inspected`.

### 6. Rollup

Write `<recon-dir>/project.json` per the spec's section 4 — prose plus the `features[]` index.
Build it from the feature files **on disk**, not from memory. Do not write `counts` or `totals`;
the build script derives them.

`summary`, `cross_cutting`, `top_findings` and `recommended_sequence` are the parts only you can
write: read back the feature files, look for the same root cause repeating across features, and rank
by severity × blast radius.

### 7. Build the dashboard

```sh
python3 <abs>/build_report.py <recon-dir>
```

Stdlib only, no install step. It validates, derives all counts, and writes
`<recon-dir>/recon-report.html` — self-contained, opens by double-click. Fix anything it reports as
`ERROR`; `WARN` lines are yours to judge.

### 8. Report

Give the user the output paths and a 3–5 line verdict. Do not open the HTML for them, and do not
start fixing what you found unless they ask.

## Rules

- **Read-only.** No fixes, no refactors, no "while I was in there".
- No evidence, no finding. Every claim carries a `path:line` you actually read.
- Blind spots go in `coverage.not_inspected[]`. Never fill a hole with a guess.
- An honest `stub` beats a generous `beta`.
