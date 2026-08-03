---
name: feature-tasks
description: Turn a feature-recon report into ready-to-execute task files — one per fix, ordered, with evidence, a test plan, and instructions to update the report when the fix lands. Use when the user asks to create tasks or a fix plan from the recon report, wants findings turned into tickets or task files, asks "what should we fix first" from the report, or says work through / act on the recon findings.
---

# Feature Tasks

Converts findings in `<recon-dir>` into task files a developer (or agent) can pick up and execute.
Each task fixes one root cause, cites the evidence, names the tests, and closes the loop by updating
the report itself.

Write these as the engineer who gets blamed if one of these fixes breaks production. That is the bar:
not "here is roughly where the bug is" but "here is the choke point, here is what else calls it, here
is what this change invalidates, and here is the test that fails before and passes after."

Bundled templates live beside this SKILL.md (`${CLAUDE_PLUGIN_ROOT}/skills/feature-tasks/`):
`templates/task.md`, `templates/index.md`. Use absolute paths.

## Procedure

### 1. Locate the report

Default `docs/recon`; accept `--dir <path>`. Read `project.json` and every file in `features/`.
If there is no report, stop and tell the user to run `/feature-recon` first — do not invent findings.

A feature may have more than one state file, one per review lens: `{slug}.json` is the product lens,
`{slug}.security.json` and `{slug}.ux.json` are the specialists. **Read them all** — they are one
feature's findings split across files, and the finding id tells you which file a given finding lives
in: `{slug}-sec-*` in the security file, `{slug}-ux-*` in the UX file, everything else in
`{slug}.json`. You need that mapping in step 6.

Output goes to `tasks/` by default, `--out <dir>` to change it. Check what is already in that
directory first: if tasks from a previous run exist, update them rather than writing duplicates.

### 2. Select the findings

With no arguments, take everything that is `critical` or `high` severity, plus every `P0`/`P1` gap,
plus anything named in `top_findings` or `recommended_sequence`. Honour explicit selectors when
given: `--ids a-bug-01,b-gap-02` · `--feature billing` · `--severity critical` · `--priority P0` ·
`--lens security` · `--all`.

`--lens <list>` narrows to findings from those lenses — `product`, `security`, `ux`, or `all`
(the default: every lens in the report). Combines with the other selectors. Note that a task usually
ends up spanning lenses anyway: a security finding and a product finding at the same choke point are
one fix, and step 4 says merge them.

If the selection exceeds ~20 tasks, write the top 20 and list the remainder in the index under
"Not yet written" — a 40-task dump gets read by nobody.

### 3. Re-verify every finding against the current source — mandatory

The report is a snapshot and may be stale: the code may have moved, or the bug may already be fixed.
For each selected finding, open the cited `path:line` and confirm the defect is still there.

- Still present → write the task.
- Already fixed → do not write a task. Note it in the index under "Already resolved" and delete the
  finding from the report per step 6.
- Evidence no longer resolves (file moved or renamed) → find the current location and use it; say so
  in the task's Evidence section.

Never copy a finding's description into a task without reading the code first. A task built on a
stale citation sends someone to the wrong file.

While you are in the code, **re-judge the severity** against real product impact — the sweep saw one
feature, you can see the whole report and the current source. If a `medium` turns out to sit on the
signup path, or a `critical` turns out to be unreachable in practice, say so in the task and give your
own rating alongside the report's. Do not silently overwrite it.

### 4. Group findings into tasks

One task = one fix at one choke point. This is the judgement step:

- **Merge** findings that share a root cause and would be fixed by the same edit, even across
  features — one task, several `State refs`. A cross-cutting entry (`xc-*`) usually merges into the
  task that actually fixes it.
- **Split** a finding that needs two independent changes (e.g. a containment fix now, a data
  migration later) into two tasks, and say which is which.
- **Grep for sibling callers** of the function you are about to name in the fix. If the reported path
  is one of five callers, the task fixes the shared function, not the one path. Say so explicitly —
  this is the single most common way these fixes go wrong.
- **Ask what the fix invalidates.** If it changes a URL, token, signature, payload shape or stored
  format, artifacts already in the wild break — links in email already delivered, webhooks third
  parties already call, rows already written. Name them and give the task a migration or grace-period
  step. A fix that silently breaks in-flight data is worse than the bug.
- **Refuse the non-tasks.** Some findings are not engineering work: they are product decisions ("should
  expired links 404 or redirect?"), open design questions, or a disagreement about intent. There is no
  correct patch to write, so do not write one. List them in the index under **Needs a decision** with
  the question and who has to answer it.

### 5. Write the files

Order tasks so each one unblocks the next: irreversible/data-losing first, then cheap containment,
then structural work. Respect `recommended_sequence` from the report where it still holds, and say
where you departed from it.

When a fix changes behaviour users currently depend on, say how it should land: behind a flag, in
stages, or with a grace period. A correct fix deployed all at once can still be an incident.

- `<out>/00-index.md` — from `templates/index.md`
- `<out>/{nn}-{slug}.md` — from `templates/task.md`, `nn` zero-padded from 01

Fill every section of the template. Delete a section only when it genuinely does not apply, and
never leave a placeholder in place. Effort and severity come from the finding; do not re-estimate
silently — if you disagree with the report's effort, say so in the task and give your own.

### 6. Close the loop

Every task ends with a **Report updates** section telling whoever lands the fix to delete the
resolved finding from the file it actually lives in — `<recon-dir>/features/{slug}.json`,
`{slug}.security.json` or `{slug}.ux.json`, per the id's lens segment. **Name the exact file in the
task**; a task that says "delete it from the feature file" sends someone to the wrong one. Then
re-run:

```sh
sh <plugin>/skills/feature-recon/build_report.sh <recon-dir>
```

The build script re-derives every count and total from the feature files, so **no counts are ever
edited by hand.** Also prune the finding's id from `project.json`'s `top_findings` and
`recommended_sequence`, and from any `cross_cutting[].affects` it no longer applies to; refresh
`git_commit` and `reviewed_at`.

Deleted rather than flagged as fixed, because a later `/feature-recon` sweep rewrites the feature
files wholesale — a `status: fixed` marker would not survive it. `git log <recon-dir>` is the record
of what was closed and when.

### 7. Report

Tell the user how many tasks were written, the recommended first one, and anything found already
fixed or unverifiable. Do not start implementing unless they ask.

## Rules

- Task files describe the fix; they do not contain the fix. No patches, no rewritten files.
- Every task carries at least one `path:line` you personally opened.
- No task without a test plan. "Add tests" is not a test plan — name the cases and the file.
- Keep each task under roughly 70 lines — about the length of `templates/task.md` itself. If it needs
  more, it is two tasks.
