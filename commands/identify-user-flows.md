---
description: Turn this codebase's features into executable user-flow recipes a browser can replay
argument-hint: "[feature-a,feature-b,...] [--dir docs/recon] [--base-url http://localhost] [--sequential]"
disable-model-invocation: false
---

Map the user flows in this repository using the `identify-user-flows` skill.

Arguments (all optional): $ARGUMENTS

- A comma-separated list of features → write recipes for exactly those.
- `--dir <path>` → where the recon report lives and the recipes go (default `docs/recon`).
- `--base-url <url>` → where the app is running (default `http://localhost`).
- `--sequential` → do not fan out subagents; work through features one at a time in this context.

Invoke the `identify-user-flows` skill and follow its procedure. Write recipes only — do not run
them, do not seed data, and do not add a `data-testid` or any other handle to the application to
make a flow work. Every selector must be read out of the existing source first.
