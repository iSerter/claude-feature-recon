# Feature recon report spec

How to review a feature, and the contract for the state file you write about it. Sections 0–2 are the
method; sections 3–4 are the shape. Follow both exactly — the dashboard renders from these fields and
the build script validates them.

`<recon-dir>` below is whatever directory the caller chose (default `docs/recon`).

- `<recon-dir>/features/{slug}.json` — one per feature
- `<recon-dir>/project.json` — rollup + index (no duplicated finding bodies)

## 0. Stance and method

**Who you are.** A senior product engineer doing a pre-handover readiness review of one feature you
are about to own. Two questions drive everything: *does this actually work for a real user*, and
*what will page me at 3am*. Cataloguing what exists is not the job — an inventory with no findings is
a failed review, not a clean bill of health.

**Trace, don't inventory.** Start from the 1–3 flows a real user performs and walk every hop:
entrypoint → validation → handler → domain logic → data write → async/side effects → the UI that
reflects the result. At each hop ask three questions:

- What if the input is hostile, empty, or the wrong shape?
- What if the previous hop already failed?
- What if two of these run at once?

The categories in section 2a are the coverage floor you check *after* tracing, not the way you look.
A layer-by-layer file listing finds nothing; following one flow until it breaks finds the bug.

**Where defects live.** The error path, the second call, and the brand-new empty account. Happy-path
code is the code someone already exercised by hand — it is the least likely place to find anything.

**Budget.** Expect to open roughly 15–40 files. If you have read fewer than about 8, you have not
looked yet and the state file is not honest.

## 1. Evidence rules and calibration (non-negotiable)

Every `state_summary`, bug, gap and opportunity must be traceable to code you actually read.

- Cite `path/to/file.ext:123` in `evidence[]`, repo-relative. No evidence → do not report it.
- Never infer from filenames alone. Open the handler/service/model and read it.
- If you could not inspect an area, say so in `coverage.not_inspected[]` — do not guess. An honest
  blind spot is a finding; a confident guess is a lie.
- Distinguish **bug** (implemented but wrong/broken) from **gap** (not implemented at all) from
  **opportunity** (works, could be better). Never file "missing feature" as a bug.
- Line numbers must be real. If you cite a line, you read that line.

### What is not a finding

Padding costs you the reader's trust in everything else in the file. None of these are findings:

- A `TODO` comment on its own. Go read what it points at; the confirmed defect is the finding.
- Lint or style nits, formatting, a missing type annotation.
- Generic advice untethered to this code — "add caching", "add monitoring", "improve error handling".
- Speculative scale problems for load this product does not have.
- A design decision you merely disagree with. That goes in `open_questions`.

**Bug self-test:** name the input and the observable wrong outcome. If you cannot, it is not a bug —
downgrade it to an opportunity or drop it.

**Gap self-test:** name who expects it, with a citation, in `expected_by` — a caller, a UI affordance,
the product's own nav. A gap nobody expects is a feature request, not a gap.

### Severity, and not inflating it

- `critical` — data loss or corruption, auth bypass, cross-tenant read, or the primary flow is
  unusable for everyone.
- `high` — the primary flow fails for a common case, or the feature silently produces wrong data with
  no way to recover.
- `medium` — a secondary flow is broken, or a workaround exists.
- `low` — cosmetic, rare, or self-correcting.

Do not inflate to be heard and do not deflate to be safe. If every finding in your file is `high`,
you have ranked nothing and the reader has to redo your work.

### Confidence means something specific

- `high` — you read every line you cited and traced the flow end to end.
- `medium` — you read the mechanism but not its callers or its config.
- `low` — pattern match or partial read. Then `coverage.not_inspected[]` must say what you could not
  reach.

## 2. Minimum sweep per feature

### 2a. Where to look

Adapt the paths to the stack — the *categories* are the requirement, not the paths.

1. **Entrypoints** — routes, URL config, router, CLI commands, GraphQL schema, event subscriptions.
2. **Handlers** — controllers, resolvers, request handlers, view functions.
3. **Domain code** — the service/module/package where the logic actually lives.
4. **Data** — models, entities, migrations, schema, seed data.
5. **UI** — pages/components/templates for this feature, including their loading and error states.
6. **Tests** — every test touching the feature. **A feature with zero tests is itself a finding.**
7. **Async** — jobs, queues, cron/schedulers, webhooks, retries and failure handling.
8. **Authorization** — policies, guards, middleware, tenancy/ownership scoping. Check that objects
   reached by ID actually belong to the caller.
9. **Markers** — grep the feature's files for `TODO|FIXME|HACK|XXX|not implemented|NotImplemented`.

Illustrative layouts (pick the closest, don't force it):

| Stack | Entrypoints | Handlers | Domain | UI | Tests |
|---|---|---|---|---|---|
| Laravel | `routes/*.php`, `packages/*/routes` | `app/Http/Controllers` | `packages/*/src`, `app/Services` | `resources/js/pages` | `tests`, `packages/*/tests` |
| Node/Nest | `src/**/*.routes.ts`, `*.controller.ts` | `*.controller.ts` | `src/modules/*` | `apps/web/app` | `*.spec.ts`, `test/` |
| Django | `urls.py` | `views.py` | `services.py`, app package | `templates/`, frontend app | `tests/`, `test_*.py` |
| Go | `cmd/*`, router setup | `internal/http`, handlers | `internal/<domain>` | `web/` | `*_test.go` |

### 2b. What to look for

Section 2a is where to point your eyes; this is what a defect looks like when you get there. Run
these against the flows you traced. Each one you confirm is a finding; each one you rule out is worth
a line in `state_summary` or `coverage`.

1. **Sibling divergence** — find the feature's twin: the other module doing the same job, the other
   subclass of the same base, the sibling route. Diff them. If four jobs extend one base class and one
   skips the guard, that is a bug *and* the sibling is your evidence it was unintentional. This is the
   highest-yield technique here; do it first.
2. **Failure paths** — an external call with no timeout or retry; a `catch` that swallows; a job that
   throws and leaves no failed state; a failure the user is never told about.
3. **Input validation** — a request field reaching a query, a model, a filesystem path or a shell with
   nothing validating it; mass assignment; a missing uniqueness or foreign-key constraint.
4. **Authorization and tenancy** — an object fetched by ID with no ownership scope; a list endpoint
   that is not scoped to the caller; a mutation that checks read permission only.
5. **Atomicity and idempotency** — a multi-write operation with no transaction; a retried job or an
   inbound webhook with no idempotency key; read-modify-write races; double submit.
6. **Data integrity** — orphan rows after a delete; a migration with no backfill for existing rows;
   status or enum values that have drifted between code and schema; money in a float; naive datetimes.
7. **Contract drift** — the frontend expecting a shape the backend no longer returns; a type or
   interface that has diverged from the actual response; a field renamed on one side only.
8. **Product completeness** — walk it as a brand-new account with no data. Loading, empty and error
   states. Is the feature reachable from the product's own nav at all? Once a flow fails, is there a
   way out, or is the user stuck? Is any of it behind a flag that is off?
9. **Cost and performance** — an N+1 in a list endpoint; an unbounded query; a synchronous external
   call inside a request; a collection returned unpaginated.
10. **Markers are leads** — `TODO|FIXME|HACK|XXX` tells you where an author already knew something was
    wrong. Follow it into the code. The comment is never the finding.

## 3. Per-feature schema — `<recon-dir>/features/{slug}.json`

IDs must be stable across runs (`{slug}-bug-01`) so reports diff cleanly. Number in the order you
report them and keep an ID attached to the same finding on re-runs.

```json
{
  "schema_version": "1.0",
  "slug": "lead-magnets",
  "name": "Lead Magnets",
  "reviewed_at": "2026-07-30",
  "maturity": "beta",
  "confidence": "high",
  "state_summary": "2-4 sentences: what it does today, how far the happy path gets, where it stops.",
  "surface": {
    "routes": ["GET /lead-magnets", "POST /lead-magnets/{id}/generate"],
    "controllers": ["app/Http/Controllers/LeadMagnetController.php"],
    "packages": ["packages/mago/lead-magnets"],
    "models": ["app/Models/LeadMagnet.php"],
    "frontend_pages": ["resources/js/pages/lead-magnets/index.tsx"],
    "queues_jobs": ["packages/mago/lead-magnets/src/Jobs/GenerateLeadMagnet.php"],
    "external_deps": ["openai", "s3"]
  },
  "coverage": {
    "test_files": ["tests/Feature/LeadMagnetTest.php"],
    "tested_paths": ["generation happy path"],
    "untested_paths": ["PDF export", "failure retry"],
    "not_inspected": ["admin resources"]
  },
  "user_flows": [
    {
      "name": "Generate a lead magnet from a brand",
      "status": "partial",
      "breaks_at": "PDF render step returns 500 for brands without a logo",
      "evidence": ["packages/mago/lead-magnets/src/Services/PdfRenderer.php:88"]
    }
  ],
  "bugs": [
    {
      "id": "lead-magnets-bug-01",
      "title": "Short imperative title",
      "severity": "high",
      "type": "runtime_error",
      "description": "What is wrong and why, in mechanism terms.",
      "repro": "Steps or the exact call path that triggers it.",
      "impact": "What the user sees / what data is at risk.",
      "evidence": ["packages/mago/lead-magnets/src/Services/PdfRenderer.php:88"],
      "suggested_fix": "One sentence.",
      "effort": "S",
      "confidence": "high"
    }
  ],
  "gaps": [
    {
      "id": "lead-magnets-gap-01",
      "title": "No delivery email after generation",
      "kind": "missing_feature",
      "description": "What is absent.",
      "expected_by": "Campaign flow assumes delivery exists — packages/mago/campaigns/src/Foo.php:41",
      "blocks": ["campaigns"],
      "evidence": ["routes/web.php:120"],
      "effort": "M",
      "priority": "P1"
    }
  ],
  "opportunities": [
    {
      "id": "lead-magnets-opp-01",
      "title": "Cache brand context between generations",
      "description": "What to change and the payoff.",
      "value": "high",
      "effort": "S",
      "priority": "P2",
      "evidence": ["packages/mago/lead-magnets/src/Services/Generator.php:150"]
    }
  ],
  "dependencies": ["brands", "avatars"],
  "open_questions": ["Is SMS delivery in scope for v1?"]
}
```

All keys are required. Use `[]` for an empty list and `null` for `breaks_at` when a flow does not
break. Omit nothing — the build script warns on missing keys.

### Enums (use these exact values)

- `maturity`: `missing` | `stub` | `alpha` | `beta` | `production_ready`
  - `missing` = nothing exists. `stub` = route/page exists, no real logic.
  - `alpha` = happy path only, no tests. `beta` = works end to end, gaps or tests missing.
  - `production_ready` = flows + tests + error handling.
- `confidence`: `high` | `medium` | `low` — calibrated in section 1, not a vibe
- `severity`: `critical` | `high` | `medium` | `low` — anchors in section 1; spread them
- `bug.type`: `runtime_error` | `logic` | `data_integrity` | `security` | `performance` | `ux` | `regression`
- `gap.kind`: `missing_feature` | `missing_validation` | `missing_tests` | `missing_error_handling` | `missing_ui` | `unwired` (backend exists with no UI, or vice versa)
- `user_flows[].status`: `working` | `partial` | `broken` | `not_implemented`
- `effort`: `S` (<1d) | `M` (1-3d) | `L` (>3d)
- `priority`: `P0` | `P1` | `P2` | `P3` — `value`: `high` | `medium` | `low`

## 4. Rollup — `<recon-dir>/project.json`

Index + prose only. Findings live in the feature files; do not copy them here.
**Do not write `counts` or `totals`** — `build_report.sh` derives them from the feature files so they
always match what is on disk.

```json
{
  "schema_version": "1.0",
  "project_name": "MAGO",
  "reviewed_at": "2026-07-30",
  "git_commit": "d65a6ad",
  "method": "Static review of routes, handlers, domain packages, models, UI and tests. No app runtime or DB inspection.",
  "summary": "5-10 sentences on overall readiness, strongest and weakest areas, and the single biggest blocker.",
  "features": [
    {
      "slug": "lead-magnets",
      "name": "Lead Magnets",
      "maturity": "beta",
      "confidence": "high",
      "file": "docs/recon/features/lead-magnets.json"
    }
  ],
  "cross_cutting": [
    {
      "id": "xc-01",
      "title": "AI generation jobs have no retry/backoff",
      "type": "bug",
      "severity": "high",
      "affects": ["lead-magnets", "ad-copies", "social-posts"],
      "evidence": ["packages/mago/core/src/Jobs/BaseGenerationJob.php:30"],
      "suggested_fix": "One sentence."
    }
  ],
  "top_findings": [
    { "ref": "lead-magnets-bug-01", "feature": "lead-magnets", "why": "Blocks the primary generation flow." }
  ],
  "recommended_sequence": [
    { "step": 1, "action": "Fix lead-magnets-bug-01", "rationale": "Unblocks campaigns.", "effort": "S" }
  ]
}
```

- `features[]` lists every feature swept, in the order they should appear in the report.
- `cross_cutting[].type`: `bug` | `gap` | `opportunity`. Use it for anything that is one root cause
  across several features — do not duplicate it into every feature file.
- `top_findings` — max 10, ranked by severity × blast radius, referencing finding IDs that exist.
- `recommended_sequence` — max 10 steps, ordered so each step unblocks the next.

## 5. Keeping the report current as fixes land

Findings have no `status` field on purpose. When a finding is fixed, **delete it** from its feature
file and re-run `build_report.sh`, which re-derives every `counts` and `totals` value from the
feature files — never hand-edit those. Then prune the finding's id from `project.json`'s
`top_findings` and `recommended_sequence`, and from any `cross_cutting[].affects` it no longer
applies to.

A `status: fixed` marker would not survive the next sweep (a sweep rewrites the feature files), so
`git log` on the report directory is the record of what was closed and when. Stable finding ids are
what make that history readable. The `feature-tasks` skill writes this loop into every task file.

## 6. Before you write the file

A last pass over your own work. Every item here is something the reader cannot check for you.

1. **Re-open every citation.** Go back to each `path:line` in `evidence[]` and confirm the line says
   what you claim. A citation you cannot re-confirm gets dropped, and so does the finding resting on
   it. The build script also checks these paths and line numbers, so a wrong one shows up as a `WARN`
   with your name on it.
2. Every bug has a real `repro` and `impact`. Every gap has `expected_by` pointing at who wants it.
   Every flow has a concrete `breaks_at`, or `null` because it genuinely completes.
3. `maturity` agrees with the rest of the file: a `broken` flow rules out `production_ready`, and so
   does zero tests.
4. Anything you suspect is **shared infrastructure** — a base class, middleware, a shared client, a
   common helper — gets called out in your return summary. The lead promotes it to `cross_cutting`
   once instead of it being filed identically in eight feature files.
5. Findings are ordered most severe first, ids are `{slug}-bug-01` style, and the JSON parses.

## 7. Rules of engagement

- **Read-only.** Do not fix anything you find; this produces the report only.
- Valid JSON. No comments, no trailing commas. Every file must parse.
- Be blunt. An honest `stub` beats a generous `beta`. `"bugs": []` is a legitimate result.
- Caps per feature: 10 bugs, 8 gaps, 6 opportunities. Keep the highest-signal ones.
- Write the feature file as soon as that feature is done, before moving on.
