# How it works

1. **Orient** — one pass over the repo for stack, entrypoints, module layout, test locations.
2. **Discover** — derive the feature list from the product's own navigation, or from module/package
   dirs, or route groups. You confirm the list before anything expensive happens.
3. **Sweep** — one subagent per feature per lens, in batches, each writing its own JSON state file
   against `reference/report-spec.md`. The default lens works like a product engineer taking the
   feature over: trace the primary user flow through every layer until it breaks, then run a
   defect-pattern pass over what it traced — sibling divergence, failure paths, validation, tenancy,
   atomicity, data integrity, contract drift, the empty-account walkthrough. An inventory of what
   exists is not the deliverable.
4. **Roll up** — the verdict, the cross-cutting root causes, the ranked findings and a recommended
   fix sequence. Findings two lenses filed at the same line collapse to one here.
5. **Build** — `build_report.sh` validates every file, derives all counts (no hand arithmetic), and
   injects the data into the dashboard template.

## Files

| Path | What it is |
|---|---|
| `skills/feature-recon/SKILL.md` | the sweep procedure Claude follows |
| `skills/feature-recon/reference/report-spec.md` | the JSON contract, handed to each subagent |
| `skills/feature-recon/reference/lens-security.md` | the security lens's method and scope |
| `skills/feature-recon/reference/lens-ux.md` | the UI/UX lens's method and scope |
| `agents/recon-product-engineer.md` | the default review agent — stance, method, output contract |
| `agents/recon-security.md`, `agents/recon-ux.md` | the two opt-in specialist review agents |
| `skills/feature-recon/build_report.sh` | runtime picker — the only entry point anything calls |
| `skills/feature-recon/build_report.py` | validate + derive counts + render, Python (stdlib only) |
| `skills/feature-recon/build_report.js` | the same, JavaScript (Node builtins only) |
| `skills/feature-recon/template.html` | the dashboard template |
| `tests/parity.sh` | proves the two builders emit identical bytes |
| `skills/feature-tasks/SKILL.md` | the findings → tasks procedure |
| `skills/feature-tasks/templates/task.md` | one task file's shape |
| `skills/feature-tasks/templates/index.md` | the fix-set index's shape |
| `skills/identify-user-flows/SKILL.md` | the flows → recipes procedure |
| `skills/identify-user-flows/reference/flow-spec.md` | the recipe contract, handed to each subagent |
| `skills/test-user-flows/SKILL.md` | the run + triage procedure |
| `skills/test-user-flows/run_flows.mjs` | the Playwright runner (`--check` validates recipes offline) |
| `skills/create-demo-videos/SKILL.md` | the recording procedure |
| `skills/create-demo-videos/capture.mjs` · `tts.mjs` · `build.mjs` | record → narrate → cut |
| `agents/recon-test-engineer.md` | writes the recipes, and turns a run into findings |
| `agents/recon-feature-explainer.md` | writes the narration |
| `lib/flows.mjs` | the interaction vocabulary, auth and cursor — shared by both browser skills |
| `lib/common.mjs`, `lib/recipes.mjs`, `lib/preflight.mjs` | CLI parsing + content-hash cache, recipe loading, dependency checks |
| `scripts/install-deps.sh` | checks (and optionally installs) node / Playwright / ffmpeg |
| `commands/*.md` | the five slash-command entry points |

## Limits

- **The sweep is static.** `/feature-recon` reads code: no app runtime, no database, no test
  execution. Every finding it files is an inference about what the code would do.
- **The browser commands are the exception, and they are narrow.** `/test-user-flows` drives real
  flows as a normal signed-in user and reports what it saw. It does not fuzz, attack, or probe for
  vulnerabilities; it runs no existing test suite; it only knows about flows somebody wrote a recipe
  for. A feature with no flows is not a feature that works.
- A `blocked` flow tells you the recipe or the environment is wrong, not the feature. Recipes go
  stale as the UI changes and need maintaining like any other test.
- Snapshot, not a time series. Commit `docs/recon/` and `git log` is your history. The `videos/`,
  `e2e-artifacts/` and `.auth.json` outputs are large or sensitive — gitignore them.
- Costs scale with feature count **times lens count** — a 16-feature sweep is 16 subagents' worth of
  reading, and `--lens all` is 48. The specialists are default-off for exactly this reason.
- Chromium only. No visual-regression diffing, no captions on the videos.
