---
name: identify-user-flows
description: Turn a codebase's features into executable user-flow recipes — a JSON file of real selectors, interactions and assertions that a browser can replay. Use when the user asks to identify or map user flows, wants end-to-end or e2e flows defined, asks what a real user actually does in the app, or is preparing to run browser tests or record demo videos. Writes recipes only; it runs no browser and changes no application code.
---

# Identify User Flows

Writes the flows a real user performs, as recipes a browser can replay:

- `<recon-dir>/user-flows.json` — shared config (base URL, viewports, auth) and `cross_feature_flows[]`
- `<recon-dir>/flows/{slug}.json` — one file per feature, written by one agent each

One recipe, two consumers — `/test-user-flows` runs it to find out what breaks, and
`/create-demo-videos` runs it to film what works.

This is the step where a static report becomes something executable. The sweep already described this
codebase's flows in prose and said where each one stops; this turns those sentences into selectors.

Bundled files live beside this SKILL.md (`${CLAUDE_PLUGIN_ROOT}/skills/identify-user-flows/`):
`reference/flow-spec.md`, `templates/user-flows.example.json`,
`templates/feature-flows.example.json`. The agent lives at
`${CLAUDE_PLUGIN_ROOT}/agents/recon-test-engineer.md`. Always pass absolute paths.

## Procedure

### 1. Resolve arguments

- `<recon-dir>` — default `docs/recon`, or `--dir <path>`.
- `--base-url <url>` — where the app is running. Default `http://localhost`.
- Explicit feature list, if the user gave one → only those features.
- `--sequential` → no fan-out; do the work yourself, one feature at a time.

### 2. Find the app, and confirm it is up

A recipe written against a guess is worthless, so establish these before anything expensive:

- **The base URL and how the app is started.** Read the README, `compose.yaml`/`docker-compose.yml`,
  `Procfile`, `package.json` scripts, `Makefile`. Do not start it yourself without asking.
- **How login works** — the login route, the field selectors, where a logged-in user lands. Open the
  login page component; do not assume `#email` / `#password`.
- **Whether there are test credentials** — `.env.example`, `CLAUDE.md`, seeders, factories.

Then check the app actually answers:

```sh
curl -s -o /dev/null -w '%{http_code}' <base-url>
```

If it is not up, say so and stop. Everything downstream needs a live app, and a recipe written
blind will be wrong in ways nobody can see until the run fails.

### 3. Orient once

Gather this **once** and reuse it in every subagent prompt: project name, stack, where routes/pages
live, the UI component conventions, and how selectors are usually written in this codebase — does it
use `data-testid` at all, or will flows have to lean on visible text? Keep it to ~15 lines.

If `<recon-dir>/project.json` exists, read it. The sweep already did this work.

### 4. Choose the features

First source that yields a clean list wins:

1. `<recon-dir>/project.json` → `features[]`. **Use this whenever it exists** — the slugs must match,
   because a flow's `feature` is what files its results back against the right feature.
2. The product's own nav, then domain modules, then route groups — the same ladder `/feature-recon`
   uses.

Skip features with no user interface: a queue worker has no flow to record. Say which ones you
skipped and why.

Show the user the feature list and the flows-per-feature estimate, and **ask them to confirm before
fanning out.**

### 5. Write the config file

Write `<recon-dir>/user-flows.json` yourself, before spawning anything — the agents need the auth
block and the viewport names to already be settled, and it is the one file no agent owns. Use
`templates/user-flows.example.json` as the starting shape and fill it from step 2.

Credentials go in as `${RECON_APP_USER}` / `${RECON_APP_PASS}`, never as literals: this directory is
meant to be committed. Tell the user which variables to export.

Leave `cross_feature_flows[]` empty for now; you fill it in step 7, once you can see what the
per-feature files already cover.

### 6. Fan out

One `recon-test-engineer` per feature, job `flows`, in **batches of 3–4** (a batch = one message with
multiple Agent calls). **Count the agents first** — one per feature. Above about 20, tell the user the
number and ask before spawning.

Each agent prompt contains, in this order:

1. The orientation brief from step 3.
2. `Job: flows. Handle exactly one feature: {name} (slug: {slug}).`
3. The absolute paths: `<abs>/reference/flow-spec.md`, the absolute `<recon-dir>`, and the base URL.
   Say explicitly that `flows/` may need creating.
4. Any feature-specific pointers you already know — its route prefix, its page directory.
5. `The sweep's file for this feature is at <abs recon-dir>/features/{slug}.json — read its
   user_flows[] and open_questions[] first; a flow it marked partial or broken is the most valuable
   one to script.`

Each agent writes `<recon-dir>/flows/{slug}.json` — its own file, and the only one it touches. That
file is the deliverable, not a fragment of one: nothing merges it anywhere, so re-running one feature
rewrites exactly one file and a hand-fixed selector stays fixed.

**Sequential mode** (`--sequential`): do the same work yourself, one feature at a time. Read
`${CLAUDE_PLUGIN_ROOT}/agents/recon-test-engineer.md` and hold yourself to it exactly as if you had
been handed it as a prompt.

### 7. Add the flows nobody owns

Read the per-feature files that came back, then ask what a real user does that **crosses** them —
signup → onboarding → first real action is the usual one, and it is both the most important flow in
most products and the one no per-feature agent can see. Write those into `cross_feature_flows[]` in
the config file, with `features[]` listing every slug they touch.

Keep it short. A flow only belongs here when no single feature owns it; a flow that mostly exercises
billing and happens to pass through the dashboard is a billing flow.

### 8. Check what came back

These are the errors that cost a whole browser run, so check them now rather than after:

- **Ids are unique across every file**, not just within one. Two flows with one id means one result
  overwrites the other. The runner refuses to start and names both files, but finding it here is
  cheaper.
- **Every flow has at least one `expect`.** Send back any that do not — a flow that cannot fail is
  not worth running.
- **Every file's `feature` matches a slug in `project.json`.** A typo silently drops the results.
- **No literal credentials** anywhere.

One command checks all of it, without opening a browser:

```sh
node ${CLAUDE_PLUGIN_ROOT}/skills/test-user-flows/run_flows.mjs <abs recon-dir> --check
```

It prints `BAD: <flow id>: <what is wrong>` per problem, or `OK N flows …`. Fix everything it
reports before handing over to `/test-user-flows` — each one costs a full run to discover otherwise.

### 9. Report

Give the user the path, the flow count by feature, and the environment variables they need to export.
Then tell them the next step is `/test-user-flows`, and that nothing has touched a browser yet.

Call out honestly: any feature you could not script because its pages offered no stable handle, and
any flow whose `requires[]` needs data that does not exist yet. Both are work the user has to do
before a run means anything.

## Rules

- **Never invent a selector**, and never add one to the application. Every selector is read out of the
  source first.
- **Read-only against the app.** This skill writes recipes. It does not run them, does not seed data,
  and does not start services without asking.
- A flow with no assertion is not a flow. At least one `expect`, every time.
- Slugs and ids are stable across runs — they are how results, findings and scenes refer back here.
- Do not pad. Four flows that reach a real outcome beat twelve that hover over a heading.
