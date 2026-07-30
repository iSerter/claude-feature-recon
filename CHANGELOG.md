# Changelog

All notable changes to this plugin. Follows [semantic versioning](https://semver.org).

The `version` field in `.claude-plugin/plugin.json` is what Claude Code uses as the update cache
key: **users receive changes only when it is bumped.** Pushing commits without bumping it makes
`/plugin update` report "already at the latest version". So every release here is one version bump.

## [0.5.0] — 2026-07-30

The app opens. Until now every finding in a report was an inference from reading code — accurate
often enough to be useful, and impossible to confirm without a human going and clicking. Three new
commands drive the actual application: they turn the sweep's prose descriptions of user flows into
replayable recipes, run them in Chromium, and record what happened. Findings that come back are
things that were *reproduced*, with a screenshot.

The same recipes then film the product. A flow that passes is a flow worth demoing, so
`/create-demo-videos` records the ones that work, narrates them, and cuts one mp4 per feature.

**Nothing about the static sweep changes.** `/feature-recon` and `/feature-tasks` behave exactly as
before, need no new dependencies, and a report with no browser run renders identically.

### Added

- **`/identify-user-flows`** — turns each feature's `user_flows[]` prose, plus the browser probes the
  UX and security lenses parked in `open_questions[]`, into executable recipes. Writes
  `<recon-dir>/flows/{slug}.json` per feature and `<recon-dir>/user-flows.json` for shared config
  and cross-feature journeys. Every selector is read out of the page source; none is invented, and
  none is added to the application to make a flow work.
- **`/test-user-flows`** — replays the recipes in Chromium and writes `e2e-test-results.json`
  (per-step status, console errors, failed requests, artifacts) plus `features/{slug}.e2e.json`
  (findings, cited to `path:line`). A failure never halts the suite; the second failure is often what
  explains the first. `--check` validates every recipe without opening a browser.
- **`/create-demo-videos`** — records one narrated mp4 per feature into `<recon-dir>/videos/demo/`,
  with a visible cursor and click pulses. Only flows that **passed** are eligible.
- **The `e2e` review lens**, labelled *Live browser* in the dashboard. It merges into the report like
  any other lens, so runtime-confirmed defects sit next to static ones and the lens filter can
  separate them.
- **`agents/recon-test-engineer.md`** — writes the recipes, and turns a run's raw results into
  findings by tracing each failure back into the source.
- **`agents/recon-feature-explainer.md`** — writes the narration, bounded by what the recon report
  says actually works.
- **`lib/`** — `flows.mjs` (the interaction vocabulary, auth, viewports, cursor overlay),
  `recipes.mjs`, `common.mjs`, `preflight.mjs`. Both browser skills drive the app through this one
  module, so the flow the suite verified is the flow the camera films.
- **`scripts/install-deps.sh`** — reports what is missing (node 20+, Playwright, Chromium, ffmpeg,
  TTS key) and installs the installable parts with `--install`.
- An **`expect`** interaction kind — assertions on a selector, its text, its state, or the URL. A
  recipe without one always passes and verifies nothing, so `identify-user-flows` requires at least
  one per flow and `--check` rejects any that lack it.

### Changed

- `report-spec.md` gains the `e2e` row and explains what makes that lens different: it is the only
  one that can **retire** a finding, because a flow completing where the product lens predicted a
  break is evidence no amount of re-reading could produce.
- `lens-ux.md` and `lens-security.md` keep their static-review rule, but now say where a parked
  browser probe actually goes. The security lens is explicit that `e2e` runs normal user flows and
  will not fuzz or attack anything.
- README documents the new dependencies, and its **Limits** section no longer claims the plugin never
  runs the app — it now draws the line around what the browser lens does and does not do.
- Credentials are referenced as `${RECON_APP_USER}` / `${RECON_APP_PASS}` and resolved from the
  environment, because the recon directory is meant to be committed. An unset variable fails the run
  by name rather than becoming an empty password and a baffling login failure.

### Fixed

Two defects carried over from the walkthrough-video skill this pipeline was adapted from:

- The capture cache ignored `leadInMs`, so changing a scene's lead-in silently reused the previous
  clip. It is now part of the recipe hash.
- A stored login session was reused without being checked, so an expired one produced a full run of
  login-redirect screens with no error anywhere. It is now probed before reuse, and re-established
  when stale.

Also: pointer steps now honour the recipe's `defaultTimeoutMs` instead of falling back to
Playwright's 30-second default, so a stale selector fails in seconds and names itself.

## [0.4.0] — 2026-07-30

Review **lenses**. The sweep had one reviewer with ten things to check, so the items that lost were
always the same ones: authorization got a glance rather than a pass, and empty/loading/error states
were the tenth of ten that the budget ran out on. A feature can now be read by more than one
specialist, each with its own method and its own file.

**Default behaviour does not change.** `/feature-recon` with no arguments runs the product lens only,
exactly as before, and a single-lens report renders exactly as it did.

### Added

- **`agents/`** — the review personas are first-class subagents now, not prose inlined into the
  fan-out prompt: `recon-product-engineer` (the default, extracted unchanged in behaviour),
  `recon-security` and `recon-ux`. Their descriptions are scoped to recon runs so they are not
  auto-delegated to during unrelated work, and each writes a state file and fixes nothing.
- **`--lens <product|security|ux|all>`** on `/feature-recon`. Opt-in, comma-separated, product-only by
  default. Above ~20 agents (lenses × features) the sweep states the count and asks before spawning —
  three lenses across sixteen features is 48 subagents and should never be a surprise.
- **`reference/lens-security.md`** — threat-model method: name the assets, the entry points and the
  guard, then read the guard rather than the flow. Ten places to look, severity anchors for abuse
  paths, and a **what is not a security finding** list (CVE-scanner noise, unreachable theory, generic
  hardening advice, anything needing a live probe).
- **`reference/lens-ux.md`** — walk the *states*, not the screens: no data yet, still loading, failed,
  half-worked, stuck. Ten things in scope including `a11y` defects, and an explicit out-of-scope list
  (visual preference, copy that is already correct, redesign proposals) because this is the lens most
  at risk of filing taste as defect.
- **Per-lens state files.** `features/{slug}.security.json` and `features/{slug}.ux.json` alongside
  the unchanged `features/{slug}.json`. Three agents cannot write one file, and per-lens files mean
  re-running one lens does not clobber the others.
- **The merge, in both builders.** Files are grouped by `slug`, findings concatenated product-lens
  first and stamped with the lens that filed them, `surface` and `coverage` lists unioned, and
  `maturity`/`state_summary`/`confidence`/`dependencies` taken from the product lens — a specialist
  rates its own slice, not the feature. No product-lens file in a group falls back to the most
  confident member and warns. Every existing count is derived from the merged feature, so the
  arithmetic is unchanged.
- **`lens` field** (`product` | `security` | `ux`) on the feature schema, absent meaning `product`, so
  every report written before this release is still valid. Finding ids gain a lens segment for the
  specialists (`billing-sec-bug-01`, `billing-ux-gap-01`); product ids do not move.
- **`bug.type: a11y`.** Keyboard, focus, labelling and screen-reader defects were being filed as `ux`
  and losing their category.
- **Lens attribution in the dashboard** — a dashed lens chip on each finding, a lens filter in the
  sticky bar, and a "Reviewed by" line on each feature. All of it appears only when more than one lens
  ran; a single-lens report has no lens UI at all.
- **A dedup pass in the rollup.** The same defect at the same `path:line` from two lenses collapses to
  one entry, keeping the more specific write-up, before `project.json` is written. Overlap above ~20%
  means the specialists are re-treading the primary flow and gets reported to the user.
- **Multi-lens coverage in `tests/parity.sh`** — the fixture now has a feature with all three lens
  files (one identified by its `lens` field, one by its filename) and a feature with no product lens
  at all, so the merge and its fallback warning are inside the byte-parity diff. Plus a check that a
  finding id shared by two lens files of one feature fails the build on both runtimes.

### Changed

- A finding id used by **two lens files of the same feature** is an `ERROR`, not a warning: ids are the
  only handle `top_findings`, `cross_cutting` and `/feature-tasks` have on a finding, so a collision
  makes those references ambiguous. A duplicate inside one file stays a warning.
- The per-feature agent prompt is now four short items — the orientation brief, the feature, the
  absolute paths, feature-specific pointers — because the stance, method, read-only rule and output
  contract live in the agent definitions.
- `/feature-tasks` gains `--lens`, reads every lens file, and each task's **Report updates** section
  names the exact file a finding must be deleted from.
- `--sequential` points at the agent definitions rather than restating them, so there is one source of
  truth for how a lens works.

## [0.3.0] — 2026-07-30

The sweep's prompts described **where to look** and **what shape to emit**, but never who to be or how
to find a defect — so a faithful agent produced a competent inventory of what exists instead of a list
of what breaks. This release is mostly prompt work to fix that.

### Added

- **Stance and method** (`report-spec.md` §0). The sweep agent is a senior product engineer doing a
  pre-handover readiness review of a feature they are about to own. Trace the 1–3 real user flows
  through every layer until they break, rather than inventorying files layer by layer. A reading
  budget (15–40 files) and the reminder that defects live on the error path, in the second call, and
  in the brand-new empty account.
- **A defect-pattern pass** (`report-spec.md` §2b). Ten patterns with what each looks like in code:
  sibling divergence (the highest-yield one — diff the feature against its twin), failure paths, input
  validation, authorization and tenancy, atomicity and idempotency, data integrity, contract drift,
  product completeness, cost and performance, and markers-as-leads. §2a's nine categories stay as the
  coverage floor you check afterwards.
- **Calibration** (`report-spec.md` §1). What is *not* a finding (bare TODOs, lint nits, generic
  advice, speculative scale, decisions you merely disagree with); a self-test for bugs (name the input
  and the wrong outcome) and for gaps (name who expects it); severity anchors for all four levels; and
  confidence tied to what you actually read.
- **A pre-submit checklist** (`report-spec.md` §6): re-open every citation, check `maturity` against
  the flows, and flag anything that looks like shared infrastructure so the lead promotes it to
  `cross_cutting` once instead of it being filed in eight files.
- **Citation checking in both builders.** Every `path:line` in `evidence[]` is resolved against the
  repo the report lives in; a citation pointing at a file that isn't there, or past the end of one that
  is, comes back as a `WARN`. The one automatic check on invented evidence. Silent when no `.git` sits
  above the recon dir, so a report copied out of its repo doesn't warn about everything.
- **`## Risk` in the task template.** Sibling callers the fix also changes, artifacts already in the
  wild it invalidates, and how it should roll out. `feature-tasks` already told Claude to work this
  out; there was nowhere in the template to write it down.
- **`Needs a decision` in the task index.** Findings that are product or design questions don't get a
  patch written for them — they get the question and who answers it.

### Changed

- The per-feature subagent prompt carries the stance, the method, the reading budget, explicit
  read-only latitude, and what to do when a feature turns out not to exist. It also returns finding
  counts by severity, so a suspiciously empty sweep is visible and can be re-run.
- The orientation brief now captures the repo's **shared abstractions** (base classes, middleware,
  auth/tenancy mechanism, shared clients) and test conventions — without them a sibling comparison is
  impossible and cross-cutting causes stay invisible.
- The rollup looks for **negative space**: what is uniformly absent across every feature, which is the
  one thing a per-feature agent structurally cannot see.
- `feature-tasks` re-judges severity against product impact while re-verifying, and says how a
  behaviour-changing fix should land (flag, stages, grace period).

### Fixed

- Warnings were printed twice on every build: `Problems.report()` is called once after linting and
  again after `derive()`, and re-printed everything the first call had already shown.
- An `ERROR` from `derive()` — `project.json` indexing a feature with no file — was printed but did not
  block the build, which then wrote a report anyway and exited 0. `ERROR` now means what the README
  says it means.

## [0.2.0] — 2026-07-30

### Added

- **Node builder.** `build_report.js` is a port of `build_report.py` using Node builtins only. The
  plugin no longer requires Python: either `python3` (3.6+) or `node` (14+) will do.
- **`build_report.sh`.** POSIX-sh wrapper that detects the runtime and dispatches. This is now the
  only entry point the skills call. `FEATURE_RECON_RUNTIME=python3|node` forces one; `--which`
  prints what would run; exit 127 means neither runtime is installed.
- **`--check <recon-dir>`** on both builders: parse every state file and report which ones are
  broken. Replaces the `python3 -m json.tool` loop in the sweep's verify step, which was the last
  hard Python dependency in the procedure.
- **`tests/parity.sh`.** Runs both selftests, then builds one deliberately nasty fixture (non-ASCII,
  a `</script>` in prose, a bad enum, a duplicate finding id, a dangling `top_findings` ref) with
  each runtime and diffs the HTML, the rewritten `project.json`, the lint output and the summary
  line. Also checks that either runtime can rebuild the other's output identically.

### Changed

- The two builders emit **byte-identical** output, including `ensure_ascii`-style escaping of the
  embedded JSON, so switching runtimes never shows up as a diff in a committed report.
- Docs, skills and templates now invoke `sh <plugin>/skills/feature-recon/build_report.sh` instead
  of `python3 .../build_report.py`. Calling either builder directly still works and is supported.
- `feature-recon` SKILL.md tells Claude what to do when no runtime exists: report the JSON paths and
  stop, rather than hand-rendering HTML or hand-computing counts.

## [0.1.0]

- Initial release: `/feature-recon` sweep, `/feature-tasks` task generation, the JSON report spec,
  and the self-contained HTML dashboard.
