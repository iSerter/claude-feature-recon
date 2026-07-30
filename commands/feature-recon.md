---
description: Sweep this codebase feature by feature and build an evidence-cited state report + HTML dashboard
argument-hint: "[feature-a,feature-b,...] [--dir docs/recon] [--sequential]"
disable-model-invocation: false
---

Run a feature reconnaissance sweep of this repository using the `feature-recon` skill.

Arguments (all optional): $ARGUMENTS

- A comma-separated list of features → skip discovery and sweep exactly those.
- `--dir <path>` → output directory (default `docs/recon`).
- `--sequential` → do not fan out subagents; sweep features one at a time in this context.

Invoke the `feature-recon` skill and follow its procedure. Do not fix anything you find —
this produces the report only.
