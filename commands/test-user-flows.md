---
description: Replay the user-flow recipes against the running app in a real browser and file what breaks
argument-hint: "[--dir docs/recon] [--feature billing] [--only 02-billing-refund-desktop] [--headed] [--retries 1] [--no-findings]"
disable-model-invocation: false
---

Run this repository's user flows against the live application using the `test-user-flows` skill.

Arguments (all optional): $ARGUMENTS

- `--dir <path>` → where the recipes and the report live (default `docs/recon`).
- `--feature <slug>` / `--only <flowId>` → run a subset. Results for flows you did not run are kept.
- `--headed` → watch the browser do it.
- `--retries 1` → retry a failed flow once, to tell a real defect from a race.
- `--no-findings` → record the run only; skip the triage pass that writes `features/{slug}.e2e.json`.

Invoke the `test-user-flows` skill and follow its procedure. Do not fix anything you find, do not
loosen an assertion to make a flow pass, and do not seed data without asking — this produces the
results and the findings only.
