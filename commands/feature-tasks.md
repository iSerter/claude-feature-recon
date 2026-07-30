---
description: Turn feature-recon findings into ordered, ready-to-execute task files with tests and report-update steps
argument-hint: "[--severity critical] [--priority P0] [--feature x] [--ids a-bug-01,...] [--all] [--dir docs/recon] [--out tasks]"
disable-model-invocation: false
---

Create task files from this repository's feature-recon report using the `feature-tasks` skill.

Arguments (all optional): $ARGUMENTS

- `--severity` / `--priority` / `--feature` / `--ids` / `--all` → which findings to write tasks for.
  With none of these, defaults to critical + high bugs, P0/P1 gaps, and anything in `top_findings`.
- `--dir <path>` → where the report lives (default `docs/recon`).
- `--out <path>` → where to write the tasks (default `tasks`).

Invoke the `feature-tasks` skill and follow its procedure. Re-verify each finding against the
current source before writing its task, and write the task files only — do not implement the fixes.
