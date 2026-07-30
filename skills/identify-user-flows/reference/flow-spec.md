# User-flow recipe spec

The contract for the recipe files in a recon directory:

- `<recon-dir>/user-flows.json` — shared configuration, plus the flows that span several features
- `<recon-dir>/flows/{slug}.json` — one file per feature, holding that feature's flows

**Nothing here is generated from anything else.** There is no merged copy, so there is never a wrong
file to edit: a stale selector is fixed in the feature's own file, and that is the file that runs.
Cross-feature flows live in the config file for the same reason `cross_cutting[]` lives in
`project.json` — a flow spanning three features has no single feature to own it.

One recipe, two consumers. `test-user-flows` runs it and asks *did this work*;
`create-demo-videos` runs it and asks *does this look good*. Both drive the browser through the same
code (`lib/flows.mjs`), so a flow the suite verified is the same flow the camera films. Write the
recipe once, honestly, and both get it right.

`<recon-dir>` is whatever directory the caller chose (default `docs/recon`).

Run order is deterministic without any global numbering: cross-feature flows first (they are usually
onboarding, and set up state the rest assume), then the per-feature files in `project.json`'s feature
order, then each file's own array order.

## 0. The rule that matters most

**Every selector must exist in the source.** Open the page component, the template or the router and
find the real `data-testid`, the real visible text, the real input `name`. A plausible-looking
selector that does not exist wastes a full browser run and then reports a bug that is really a typo.

Never invent a handle, and never add one to the application to make a flow work. If a page gives you
nothing to hold on to, say so and script a shallower flow.

## 1. The config file — `<recon-dir>/user-flows.json`

Written once by the skill, not per feature. It holds everything shared, so a changed login selector
is a one-line edit rather than the same edit in eight files.

```json
{
  "schema_version": "1.0",
  "name": "MAGO",
  "baseUrl": "http://localhost",
  "generated_at": "2026-07-30",
  "source": "docs/recon/features/*.json",
  "paceFactor": 1.0,
  "defaultTimeoutMs": 15000,
  "viewports": {
    "desktop": { "width": 1920, "height": 1080 },
    "mobile":  { "width": 360,  "height": 780 }
  },
  "auth": {
    "kind": "form",
    "loginPath": "/login",
    "email": "${RECON_APP_USER}",
    "password": "${RECON_APP_PASS}",
    "emailSelector": "#email",
    "passwordSelector": "#password",
    "submitSelector": "button[type=submit]",
    "successPath": "/dashboard"
  },
  "cross_feature_flows": []
}
```

### `cross_feature_flows[]`

For a journey that genuinely crosses features — signup → onboarding → first campaign — and therefore
belongs to none of them. Same flow shape as section 2, with one difference: `feature` is omitted, and
`features[]` lists every slug it touches so its results can be reported against all of them.

Keep this list short. A flow only belongs here when no single feature owns it; a flow that mostly
exercises billing and happens to pass through the dashboard is a billing flow.

## 1a. A per-feature file — `<recon-dir>/flows/{slug}.json`

One per feature, written by one agent, never merged into anything.

```json
{
  "schema_version": "1.0",
  "feature": "lead-magnets",
  "generated_at": "2026-07-30",
  "user_flows": []
}
```

`feature` must match a slug in `project.json`, and it is what files each flow's results against the
right feature. A flow may override it, but should not need to.

| Field | Meaning |
|---|---|
| `baseUrl` | Where the app is running. Every `path` is resolved against it. |
| `source` | Where the flows came from — a report glob, or `"routes"` when there was no report. |
| `paceFactor` | Scales every delay. `1.0` for tests; `create-demo-videos` raises it for the camera. |
| `defaultTimeoutMs` | Default for `waitFor` and `expect`. A step may override it. |
| `viewports` | Named sizes. A flow's `viewport` is a key into this map. `desktop` and `mobile` exist by default. |
| `auth.kind` | `form` or `none`. `none` skips login entirely, for a public-only tour. |
| `auth.successPath` | Where a logged-in user lands. Used to check a stored session is still valid before reusing it. |

### Credentials

**`docs/recon/` is meant to be committed.** Write credentials as `${VAR}` and export the variable —
`${RECON_APP_USER}` and `${RECON_APP_PASS}` are the conventional names. A literal password is
accepted, because sometimes the target is a throwaway local container, but it will be warned about
every single run, and it should never be committed.

An unresolved `${VAR}` fails the run with the variable's name. It never silently becomes an empty
password and a baffling login failure.

## 2. A flow

```json
{
  "id": "01-lead-magnets-generate-desktop",
  "viewport": "desktop",
  "kind": "primary",
  "title": "Generate a lead magnet from an existing brand.",
  "path": "/lead-magnets",
  "description": "3-5 sentences: what the user is trying to achieve, what they touch on the way, and what success looks like on screen. Note where a non-obvious selector came from.",
  "requires": ["at least one brand exists"],
  "include_in_demo": true,
  "leadInMs": 700,
  "holdMs": 1200,
  "interactions": [
    { "kind": "wait", "ms": 900 },
    { "kind": "click", "selector": "a:has-text('New lead magnet')" },
    { "kind": "waitFor", "selector": "input[name='title']" },
    { "kind": "type", "selector": "input[name='title']", "text": "Spring checklist" },
    { "kind": "click", "selector": "button:has-text('Generate')" },
    { "kind": "expect", "selector": "[data-testid='generation-status']", "text": "Complete" },
    { "kind": "expect", "urlContains": "/lead-magnets/" }
  ]
}
```

| Field | Meaning |
|---|---|
| `id` | Ordering, filename and the handle every result and finding refers to. Number-prefixed, kebab-case, stable across runs. |
| `feature` | Inherited from the file's `feature`; only set it to override. This is what files a flow's results as a lens. In `cross_feature_flows[]` it is omitted in favour of `features[]`. |
| `viewport` | A key from `viewports`, or a literal `{width,height}`. |
| `kind` | `primary` \| `secondary` \| `edge`. Tests run all of them; videos film `primary` only. |
| `path` | Where the flow starts, relative to `baseUrl`. |
| `requires` | Data prerequisites, in plain words. A flow that needs a seeded record fails for the wrong reason otherwise. |
| `include_in_demo` | `false` for a flow that is correct but unwatchable — an error path, a destructive action, anything showing fixtures a viewer should not see. |
| `leadInMs` / `holdMs` | Still time before the first move and after the last. Only the camera uses these; defaults 700 / 1200. |

`id` convention: `{nn}-{feature-slug}-{what}-{viewport}`. The viewport suffix matters — the same
flow at two sizes is two flows with two results.

## 3. Interactions

| Kind | Fields | Notes |
|---|---|---|
| `wait` | `ms` | Scaled by `paceFactor`. |
| `goto` | `path` | Resolved against `baseUrl`; waits for network idle. |
| `hover` / `move` | `selector`, `nth?` | Eased 36-step pointer move. |
| `click` | `selector`, `nth?` | Moves first, then a real down/up so the click pulse renders. |
| `type` | `selector`, `text` | Keystroke by keystroke. |
| `press` | `key` | e.g. `Enter`, `Escape`. |
| `select` | `selector`, `value` | Native `<select>`. |
| `scroll` | `dy` | Six chunked wheel events, so the page eases rather than teleports. |
| `drag` | `from`, `to` | Both are selectors. |
| `waitFor` | `selector`, `state?`, `timeout?` | `visible` \| `hidden` \| `attached` \| `detached`. |
| `expect` | `selector?`, `text?`, `state?`, `urlContains?`, `not?`, `timeout?` | The assertion. See below. |

A `hover` before every `click` is what makes a recording read as a person rather than a script. It
costs a test nothing.

### `expect` — the one that makes it a test

**Every flow needs at least one.** A flow of hovers and scrolls always passes and therefore proves
nothing; the run would report a green suite that verified no behaviour at all.

```json
{ "kind": "expect", "selector": "[data-testid='row']" }                        // is visible
{ "kind": "expect", "selector": "[data-testid='status']", "text": "Complete" } // contains text
{ "kind": "expect", "selector": ".error", "not": true }                        // is not visible
{ "kind": "expect", "urlContains": "/lead-magnets/" }                          // navigated
{ "kind": "expect", "selector": "#spinner", "state": "hidden", "timeout": 30000 }
```

Assert **what means the user succeeded** — the row that appears, the URL they land on, the status
that reaches "Complete". Not that a heading exists: a heading renders fine on a page whose data
never loaded.

`create-demo-videos` strips `expect` steps when it generates scenes. An assertion is not a camera
move, and it costs screen time.

## 4. How many, and which

3–8 flows for a normal feature. In priority order:

1. **The primary flow** — the thing the feature exists to do, end to end.
2. **Whatever the sweep flagged.** A flow the product lens marked `partial` or `broken` is the most
   valuable one to script: the run either confirms the finding with a screenshot or retires it.
3. **Parked browser probes.** The UX and security lenses put anything needing a browser into
   `open_questions[]`. Those are questions waiting for exactly this.
4. **The empty state**, if a brand-new account sees something different.

Do not script a flow you cannot assert on, and do not pad the file. Twelve shallow flows take longer
to run and tell you less than four that reach a real outcome.

## 5. Before you write the file

1. **Re-open every selector.** Confirm each one appears in the source you cited. A selector you
   cannot re-confirm gets dropped, and so does the step resting on it.
2. Every flow has at least one `expect`, and that assertion means the user succeeded.
3. `requires[]` names every piece of data the flow assumes exists.
4. Ids are stable, number-prefixed, carry the viewport, and are **unique across the whole recon
   directory** — not just within your file. Prefix with the feature slug and they will be.
5. The JSON parses. No comments, no trailing commas.
