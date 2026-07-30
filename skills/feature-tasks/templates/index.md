# {Fix set name, e.g. "Critical fixes"} — index

Derived from `{recon-dir}/project.json` (swept {reviewed_at}, commit `{git_commit}`) and the
per-feature files under `{recon-dir}/features/`. Every finding below was re-verified against the
source at commit `{current commit}` before its task was written.

## Order

| # | Task | Refs | Effort | Why this order |
|---|------|------|--------|----------------|
| 1 | [{Title}]({01-slug}.md) | `{a-bug-01}`, `{xc-03}` | S | {the one reason it goes first} |
| 2 | [{Title}]({02-slug}.md) | `{b-bug-02}` | M | {why here} |

{One or two lines on the real dependencies between tasks — "#2 must land before #5; everything else
is independent." Do not invent an order where none is needed.}

## Cross-cutting after these land

{Which `xc-*` entries disappear entirely, which shrink and to what, and which survive untouched.
A cross-cutting cause that survives every task in this set is itself worth a design task — say so.}

## Already resolved

{Findings the re-verification pass found already fixed in the source. Name the id and where you
looked. Delete these from the report per each task's Report updates section. Omit this section if
there were none.}

## Not yet written

{Findings that matched the selection but were cut to keep this set readable. List id + one line so
they are not lost. Omit if everything was written.}

## Shared conventions for every task here

- **Fix at the choke point, not the reported path.** These findings have sibling callers; grep them
  before editing.
- **Each fix lands with a test that fails before it and passes after.** {Name the existing test in
  this repo whose shape to copy.}
- **{Anything the repo needs known about running tests}** — {e.g. targeted file lists rather than the
  full suite; known pre-existing failures}.
- **Update the report in the same PR as the fix**, per each task's Report updates section. Counts and
  totals are derived by `build_report.py` — never hand-edit them.
