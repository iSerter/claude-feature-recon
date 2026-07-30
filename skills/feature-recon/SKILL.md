---
name: feature-recon
description: Sweep a codebase feature by feature and produce an evidence-cited state report plus an HTML dashboard — per-feature maturity, bugs, gaps, opportunities, test coverage. Use when the user asks to review or audit the state of a project, asks "what's the state of this codebase", wants a feature maturity or readiness report, asks which features are broken/untested/incomplete, or wants a project state dashboard. Read-only; it reports, it does not fix.
---

# Feature Recon

A reconnaissance sweep, not an authoritative audit: it reports what it actually read, cites
`path:line` for every claim, and declares its blind spots. Output is one JSON state file per
feature, a rollup, and a self-contained HTML dashboard built from them.

Bundled files live beside this SKILL.md (`${CLAUDE_PLUGIN_ROOT}/skills/feature-recon/`):
`reference/report-spec.md`, `reference/lens-security.md`, `reference/lens-ux.md`,
`build_report.sh`, `template.html`. The review agents live at `${CLAUDE_PLUGIN_ROOT}/agents/`.
Always pass absolute paths.

`build_report.sh` is the only entry point you call: it runs whichever of python3 / node the
machine has. Never call `build_report.py` or `build_report.js` directly, and never assume a
runtime — if the wrapper reports that neither is installed, say so and stop at step 6, where the
JSON state files are already complete and useful on their own.

## Procedure

### 1. Resolve arguments

- `<recon-dir>` — default `docs/recon`, or `--dir <path>`.
- Explicit feature list, if the user gave one → skip step 3.
- `--sequential` → skip the fan-out in step 4 and sweep features one at a time in this context.
- `--lens <list>` — which review lenses to run: `product` (the default, and what a plain run does),
  `security`, `ux`, or `all`. Comma-separated. **Never add a lens the user did not ask for**: each one
  multiplies the agent count by the feature count, and the specialists exist to be opted into.

### 2. Orient once

Gather this **once** and reuse it in every subagent prompt, so N agents don't each re-derive it:

```sh
git rev-parse --short HEAD && git log -1 --date=short --format=%ad
```

Plus, from a quick look at the repo root: project name, stack/framework, and where these live —
entrypoints/routes, domain modules, models/migrations, UI pages, tests. Read the root README and
`CLAUDE.md`/`AGENTS.md` if present.

Two more, because the sweep cannot find its best findings without them:

- **Shared abstractions** — the base controller/job/service classes, the middleware stack, how auth
  and tenancy are enforced, the shared HTTP/AI/queue client. These are what make a sibling comparison
  possible ("this job skips the guard its four siblings apply") and what turn eight identical findings
  into one cross-cutting entry.
- **Test conventions** — how tests are named, where they live, how they are run.

Keep it to ~15 lines; this is the **orientation brief**.

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

One subagent per (feature, lens). The stance, the method, the read-only rule and the output contract
live in the agent definitions, so the prompt you write is short:

| Lens | Agent | Writes | Extra spec to pass |
|---|---|---|---|
| `product` (default) | `recon-product-engineer` | `features/{slug}.json` | — |
| `security` | `recon-security` | `features/{slug}.security.json` | `reference/lens-security.md` |
| `ux` | `recon-ux` | `features/{slug}.ux.json` | `reference/lens-ux.md` |

**Count the agents before you spawn any: lenses × features.** If that is more than about 20, tell the
user the number and the breakdown and **ask them to confirm before spawning**. Forty-eight subagents
is a real bill and must never be a surprise.

Fan out in **batches of 3–4 agents** (a batch = one message with multiple Agent calls), spawning each
one by the agent name in the table — never a generic agent with the persona pasted into the prompt,
which is what these files exist to replace. Run **every feature's product lens first**, then the
specialist lenses: a specialist reads the product lens's file for its feature and skips what it
already filed, which is the cheapest dedup available.

Each agent prompt contains, in this order:

1. The orientation brief from step 2.
2. `Review exactly one feature: {name} (slug: {slug}).`
3. The absolute paths: `<abs>/reference/report-spec.md`, the lens spec from the table above for a
   specialist, and the absolute `<recon-dir>` to write into. Say explicitly that `features/` may need
   creating.
4. Any feature-specific pointers you already know — its route prefix, its package dir, its pages.
5. For a specialist only: `The product lens's file for this feature is at <abs
   recon-dir>/features/{slug}.json — read it first and do not refile what it already found.`

The JSON file is the deliverable — never ask an agent to return the report body in its response. The
counts in the summary are how you spot an agent that came back suspiciously empty: for a feature of
any size, zero bugs and zero gaps from the product lens usually means a shallow read, not clean code.
Re-run those. A **specialist** coming back with nothing is a legitimate result — but it is also the
signal to report at the end, because a lens that costs N agents and finds nothing is not worth
running again.

**Sequential mode** (`--sequential`): do the same work yourself, one feature at a time and one lens at
a time. Read `${CLAUDE_PLUGIN_ROOT}/agents/recon-product-engineer.md` — plus the specialist's file for
each selected lens — and hold yourself to it exactly as if you had been handed it as a prompt.

### 5. Verify

```sh
sh <abs>/build_report.sh --check <recon-dir>
```

It prints `BAD: <path>: <what went wrong>` for every file that does not parse, or `OK N JSON
files parse`. Run it again after step 6 to catch a hand-written `project.json`.

Re-run a failed or missing (feature, lens) once — only that one file is affected, since each lens
writes its own. If it fails twice, write a minimal file for it with `confidence: "low"` and the
failure recorded in `coverage.not_inspected`.

### 6. Rollup

Write `<recon-dir>/project.json` per the spec's section 4 — prose plus the `features[]` index.
Build it from the feature files **on disk**, not from memory. Do not write `counts` or `totals`;
the build script derives them. `features[]` has **one entry per feature, never one per lens file** —
the build script merges the lens files behind that entry.

**If more than one lens ran, dedup before anything else.** Two lenses that filed the same defect at
the same `path:line` by the same mechanism is one finding: delete the weaker write-up from its file
and keep the more specific one — usually the specialist's, since the generalist reached it as one item
out of ten. Doing this first means the counts the build script derives are already honest. Note the
overlap you had to remove in your final report: a specialist that mostly duplicates the product lens
is not earning its agents. Findings that recur across *features* are a different thing and still get
promoted to `cross_cutting`.

`summary`, `cross_cutting`, `top_findings` and `recommended_sequence` are the parts only you can
write: read back the feature files, look for the same root cause repeating across features, and rank
by severity × blast radius.

Then look at the **negative space** — what is uniformly absent. No feature validates input; nothing
rate-limits; no feature handles the AI provider being down; not one flow has an error state in the UI.
An absence that spans every feature is a cross-cutting finding, and it is the one thing a per-feature
agent structurally cannot see. Also promote anything the agents flagged as shared: one
`cross_cutting` entry beats the same finding filed in eight files.

### 7. Build the dashboard

```sh
sh <abs>/build_report.sh <recon-dir>
```

Standard library only, no install step. It validates, derives all counts, and writes
`<recon-dir>/recon-report.html` — self-contained, opens by double-click. Fix anything it reports as
`ERROR`; `WARN` lines are yours to judge.

Exit 127 means the machine has neither python3 nor node. Do not try to render the HTML yourself and
do not hand-compute counts — report the JSON paths, tell the user which runtime to install, and
that re-running just this step finishes the job.

### 8. Report

Give the user the output paths and a 3–5 line verdict. Do not open the HTML for them, and do not
start fixing what you found unless they ask. Mention that `/feature-tasks` turns these findings into
ordered task files if they want to act on them.

If a specialist lens ran, say what it cost and what it bought: how many agents, how many findings the
product lens had not already filed, and how much overlap you deduped. That is the only way the user
can decide whether to pay for that lens again.

## Rules

- **Read-only.** No fixes, no refactors, no "while I was in there".
- No evidence, no finding. Every claim carries a `path:line` you actually read.
- Blind spots go in `coverage.not_inspected[]`. Never fill a hole with a guess.
- An honest `stub` beats a generous `beta`.
- **An inventory is not a review.** A sweep that comes back with no bugs and no gaps across a whole
  feature set is evidence it read shallowly, not that the codebase is clean. Say so and re-run rather
  than shipping a report that flatters.
