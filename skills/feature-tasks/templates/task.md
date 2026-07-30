# {NN} — {Imperative title naming the defect, not the symptom}

**State refs:** `{feature-bug-01}` ({severity}), `{xc-02}`
**Severity:** {critical|high|medium|low} · **Effort:** {S|M|L}
**Blocks:** {task numbers or features this unblocks, or "nothing"}

## Problem

{2-5 sentences on the mechanism: what the code actually does, and why that is wrong. Name the
function and the missing constraint. Contrast with the sibling that gets it right, if there is one —
that contrast is usually the strongest evidence the defect is unintentional.}

Repro: {the exact call, request, or path that triggers it, and what you observe.}

## Evidence

- `{path/to/file.ext}:{line}` ({what is there})
- `{path/to/file.ext}:{line}` ({what is there})
- Correct pattern already in the repo: `{path/to/file.ext}:{line}` ({name it})

## Fix

{One sentence naming the choke point and why the fix belongs there rather than at the reported
call site. If sibling callers exist, list them — they are all broken too.}

1. {Concrete change, naming the function and the new signature or guard.}
2. {Next change.}
3. {Next change.}

{Optional: "Note: this is a containment fix — the real model fix is task NN. Land this one anyway
because …" Be explicit when a task deliberately stops short.}

## Risk

- **Also changes:** {the sibling callers of the choke point, with paths — they get the new behaviour
  too, which is the point. "None, single caller" if you grepped and it is genuinely one.}
- **Invalidates:** {artifacts already in the wild that this breaks — URLs in delivered email, tokens
  users hold, webhook payload shapes third parties parse, rows already written in the old format — and
  the migration or grace period that covers them. "Nothing in flight" if truly none.}
- **Rollout:** {all at once, behind a flag, or staged — and why.}

## Tests

`{path/to/test/dir}` — {extend the existing tests or add a new file, say which}:

- {case → expected outcome}
- {case → expected outcome}
- {the negative/adversarial case → expected outcome}

{Optional: the existing test in the repo whose shape to copy, with its path. Optional: known
pre-existing failures in this area that will need reading first.}

## Report updates (after the fix merges)

1. `{recon-dir}/features/{slug}.json` — delete `{feature-bug-01}` from `{bugs|gaps|opportunities}[]`;
   update `coverage.test_files` with the tests you added, revisit `maturity` if this changes it, and
   refresh `reviewed_at`. {Name one line per file when the task closes findings from more than one
   lens: `-sec-` ids live in `{slug}.security.json`, `-ux-` ids in `{slug}.ux.json`.}
2. `{recon-dir}/project.json` — refresh `git_commit` and `reviewed_at`. Then, only where they
   actually apply: remove `{feature-bug-01}` from `top_findings[]`; drop it from the
   `recommended_sequence[]` step that names it; remove `{slug}` from `cross_cutting[].affects` if the
   cause no longer reaches this feature. {State here which of these apply and which do not — a
   targeted guard usually leaves the cross-cutting entry standing.}
3. Rebuild — this re-derives every count and total, so never edit `counts` or `totals` by hand:

   ```sh
   sh <plugin>/skills/feature-recon/build_report.sh {recon-dir}
   ```

4. Commit the report changes with the fix, in the same PR.
