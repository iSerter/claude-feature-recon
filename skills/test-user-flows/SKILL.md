---
name: test-user-flows
description: Replay a codebase's user-flow recipes against the running app in a real browser with Playwright, then file what broke as evidence-cited findings. Use when the user asks to run end-to-end or e2e tests, wants the app tested in a real browser, asks whether the flows actually work, or wants to verify recon findings against the running application. Writes results and findings; it never edits application code.
---

# Test User Flows

Runs the recipes in `<recon-dir>/user-flows.json` (shared config + cross-feature flows) and
`<recon-dir>/flows/*.json` (one file per feature) against the live app, and writes two things:

- `<recon-dir>/e2e-test-results.json` — **what happened.** Step-by-step status, console errors,
  failed requests, screenshots.
- `<recon-dir>/features/{slug}.e2e.json` — **what it means.** Report-spec findings with `path:line`
  evidence, merged into the dashboard as the `e2e` lens.

Those are deliberately separate. A timeout is not a bug report until someone has traced it to a line
of code, and that trace is the valuable part.

This is the only part of feature-recon that leaves static analysis. A finding here was *reproduced*,
not inferred — which makes it the strongest evidence in the report, and also the only lens that can
retire a finding the sweep got wrong.

Bundled files live beside this SKILL.md (`${CLAUDE_PLUGIN_ROOT}/skills/test-user-flows/`):
`run_flows.mjs`. The flow spec is at
`${CLAUDE_PLUGIN_ROOT}/skills/identify-user-flows/reference/flow-spec.md`, the report spec at
`${CLAUDE_PLUGIN_ROOT}/skills/feature-recon/reference/report-spec.md`, and the agent at
`${CLAUDE_PLUGIN_ROOT}/agents/recon-test-engineer.md`. Always pass absolute paths.

**Requires Node 20+ and Playwright** — unlike the core sweep, which runs on either python3 or node.
`sh ${CLAUDE_PLUGIN_ROOT}/scripts/install-deps.sh` reports what is missing.

## Procedure

### 1. Resolve arguments

- `<recon-dir>` — default `docs/recon`, or `--dir <path>`.
- `--feature <slug>` / `--only <flowId>` — run a subset. Results for flows you did not run are kept.
- `--headed` — watch it happen. Worth it the first time, and when a failure makes no sense.
- `--retries 1` — retry a failed flow once, to separate a real defect from a race.
- `--no-findings` — run and record only; skip the agent pass.

If there are no recipes, stop and tell the user to run `/identify-user-flows` first. **Do not invent
recipes here** — this skill runs them, it does not write them.

### 2. Preflight

```sh
sh ${CLAUDE_PLUGIN_ROOT}/scripts/install-deps.sh
node ${CLAUDE_PLUGIN_ROOT}/skills/test-user-flows/run_flows.mjs <abs recon-dir> --check
curl -s -o /dev/null -w '%{http_code}' <baseUrl from user-flows.json>
```

All three have to be clean before anything else. Name the one thing that is missing and stop — a run
against an app that is down produces a full set of failures that mean nothing, and costs an agent
pass to work that out. `--check` opens no browser; it catches duplicate ids, a flow with no
assertion, and a `feature` that matches nothing in `project.json`.

Check the credentials too: `user-flows.json` references `${RECON_APP_USER}` / `${RECON_APP_PASS}` by
convention, and the runner refuses to start if a referenced variable is unset. Tell the user which
one to export rather than editing the file to hold a literal.

### 3. Run

```sh
node ${CLAUDE_PLUGIN_ROOT}/skills/test-user-flows/run_flows.mjs <abs recon-dir> [--retries 1]
```

The runner logs one line per flow and **never stops on a failure** — the second failure is often what
explains the first. It writes `e2e-test-results.json` and puts artifacts for anything that did not
pass in `<recon-dir>/e2e-artifacts/{flowId}/` (failure screenshot, Playwright trace, video). A flow
that passes leaves nothing behind.

Three statuses, and the difference matters:

| Status | Meaning | Whose problem |
|---|---|---|
| `passed` | Every assertion held. | — |
| `failed` | An `expect` did not hold. | The application. |
| `blocked` | The recipe never reached an assertion — a selector that no longer exists, missing data, a page that would not open. | The recipe or the environment. |

**`blocked` is not a bug.** Read the reason: if a selector is stale, fix it in `user-flows.json` and
re-run just that flow (`--only`). If data is missing, name what has to be seeded and ask the user —
never seed it yourself, and never loosen an assertion to make a flow go green.

Re-run with `--headed` for anything you cannot explain from the trace.

### 4. Triage — one agent per affected feature

Skip a feature whose flows all passed cleanly; there is nothing to file and an empty file adds a row
to the dashboard that says nothing. Spawn `recon-test-engineer` with job `results` for every feature
that had a `failed`, a `blocked`, a `flaky`, or console errors worth reporting, in **batches of 3–4**.

Each agent prompt contains, in this order:

1. The orientation brief — project name, stack, where handlers and pages live.
2. `Job: results. Handle exactly one feature: {name} (slug: {slug}).`
3. The absolute paths: `<abs>/reference/report-spec.md`, the absolute `<recon-dir>`, and
   `<abs recon-dir>/e2e-test-results.json`.
4. `The sweep's file for this feature is at <abs recon-dir>/features/{slug}.json — read it first.
   Say which of its findings this run confirmed and which it retired.`

The JSON file is the deliverable; never ask an agent to return the report body.

### 5. Reconcile with the sweep

This is the step that only exists because the browser ran, and it is the most valuable thing here.

- **Confirmed** — the sweep predicted a break and the browser hit it. Leave both findings in place;
  they are the same defect seen twice, and the e2e file's `description` should say so. Do not dedup
  these: one is a code read, one is a reproduction with a screenshot.
- **Retired** — a flow passed where the sweep said it would break. Go and read the code before
  believing either one. If the finding is genuinely stale, **delete it** from
  `features/{slug}.json` per the report spec's section 5, and prune its id from `project.json`'s
  `top_findings`, `recommended_sequence` and any `cross_cutting[].affects`.
- **Unverified** — a finding no flow touched. Say so; it is still an open question, not a pass.

### 6. Rebuild the dashboard

```sh
sh ${CLAUDE_PLUGIN_ROOT}/skills/feature-recon/build_report.sh <recon-dir>
```

It re-derives every count and adds the `e2e` lens to the report's lens filter, labelled
**Live browser**. Fix anything it reports as `ERROR`.

### 7. Report

Give the user the pass/fail/blocked counts, the single worst thing a real user hits, and the paths.
Then, explicitly:

- which recon findings this run **confirmed**, and which it **retired**
- every `blocked` flow and what has to change for it to run — this is the backlog for the next pass
- what stayed untested. A feature with no flows is not a feature that works.

Mention that `/feature-tasks` turns the findings into task files, and `/create-demo-videos` films the
flows that passed.

## Rules

- **Read-only against the application.** Run flows, record results, write JSON into the recon
  directory. Never edit source, never seed data unasked, never add a `data-testid` to make a flow go
  green.
- **Never loosen an assertion to make a test pass.** If an `expect` is wrong, fix the recipe and say
  why. If it is right, the failure is the finding.
- A failure with no `path:line` is a symptom, not a finding. That is what the triage pass is for.
- A flow that passed once and failed once is `flaky` and is not a bug report until someone says
  whether the race is in the app or the recipe.
- Never delete `e2e-test-results.json` on a partial run — `--only` and `--feature` merge into it.
