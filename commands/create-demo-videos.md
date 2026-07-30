---
description: Record narrated demo videos of the features whose user flows actually pass
argument-hint: "[--dir docs/recon] [--feature billing]"
disable-model-invocation: false
---

Record demo videos of this application using the `create-demo-videos` skill.

Arguments (all optional): $ARGUMENTS

- `--dir <path>` → where the recipes and the report live (default `docs/recon`).
- `--feature <slug>` → film one feature only.

Voice, pacing and music are fields in `<recon-dir>/demo-videos.json`, not flags.

Invoke the `create-demo-videos` skill and follow its procedure. Film only flows that passed in
`e2e-test-results.json` — a recording of a broken flow is a bug presented as a feature. Never edit
the application to make a screen look better, and keep the narration inside what the recon report
says actually works.
