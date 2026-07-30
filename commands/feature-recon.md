---
description: Sweep this codebase feature by feature and build an evidence-cited state report + HTML dashboard
argument-hint: "[feature-a,feature-b,...] [--dir docs/recon] [--lens product,security,ux|all] [--sequential]"
disable-model-invocation: false
---

Run a feature reconnaissance sweep of this repository using the `feature-recon` skill.

Arguments (all optional): $ARGUMENTS

- A comma-separated list of features → skip discovery and sweep exactly those.
- `--dir <path>` → output directory (default `docs/recon`).
- `--lens <list>` → which review lenses to run: `product` (default), `security`, `ux`, or `all`.
  With no `--lens`, only the product lens runs. Each extra lens costs one more subagent per feature,
  so never add one that was not asked for, and confirm the count with the user before spawning more
  than about 20 agents.
- `--sequential` → do not fan out subagents; sweep features one at a time in this context.

Invoke the `feature-recon` skill and follow its procedure. Do not fix anything you find —
this produces the report only.
