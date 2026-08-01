# Command reference

Five commands. Two read the code, two drive the app, one turns findings into work.

## `/feature-recon` — sweep the codebase

```sh
/feature-recon                          # discover features, confirm the list, sweep everything
/feature-recon brands,campaigns,billing # sweep exactly these
/feature-recon --dir docs/state         # write somewhere other than docs/recon
/feature-recon --lens security          # add the security review lens
/feature-recon --lens all               # product + security + UI/UX (3 subagents per feature)
/feature-recon --sequential             # no subagent fan-out, one feature at a time
```

## `/feature-tasks` — turn findings into work

```sh
/feature-tasks                          # task files for critical+high bugs and P0/P1 gaps
/feature-tasks --severity critical      # only the critical ones
/feature-tasks --feature billing        # only one feature
/feature-tasks --lens security          # only what the security lens found
/feature-tasks --ids billing-bug-01,xc-02
/feature-tasks --out tasks/q3           # write somewhere other than tasks/
```

Output:

```
tasks/
  00-index.md               ordered fix set, dependencies, what's cut, shared conventions
  01-{slug}.md              one task per root cause
```

Each task carries the finding ids it closes, the mechanism, cited `path:line` evidence, a
choke-point fix plan, named test cases, and the steps to update the report when it merges.

## Against the running app

```sh
/identify-user-flows                    # turn the report's flows into replayable recipes
/test-user-flows                        # run them in a real browser, file what breaks
/test-user-flows --feature billing      # re-run one feature's flows
/test-user-flows --headed --retries 1   # watch it, and retry failures once

/create-demo-videos                     # film the flows that passed, narrated
/create-demo-videos --feature billing   # one feature only
```

See [the live-browser lens](browser-lens.md) for what these three do and how they fit together.

## Natural-language triggers

The commands also trigger on plain requests — "review the state of this project", "which features
are untested", "what should we fix first", "do the flows actually work", "make me a demo video".

## Output layout

```
docs/recon/
  project.json                    rollup: verdict, cross-cutting findings, top findings, totals
  features/{slug}.json            one per feature: maturity, surface, coverage, flows, bugs, gaps, opps
  features/{slug}.security.json   only with --lens security
  features/{slug}.ux.json         only with --lens ux
  features/{slug}.e2e.json        only after /test-user-flows
  recon-report.html               the dashboard — one file, opens by double-click, works offline
```

and, once the browser commands have run:

```
docs/recon/
  user-flows.json                 shared config (base URL, viewports, auth) + cross-feature flows
  flows/{slug}.json               one per feature: replayable recipes with real selectors
  e2e-test-results.json           what happened in the browser: per-step status, console, network
  e2e-artifacts/{flowId}/         failure screenshot, Playwright trace, video — only for what failed
  features/{slug}.e2e.json        what it meant: findings, cited to path:line, merged into the report
  demo-videos.json                scenes and narration
  videos/demo/{videoId}.mp4       one narrated video per feature
```

Each finding carries a stable id (`billing-bug-01`), an effort estimate, and the evidence it came
from, so consecutive runs diff cleanly in git and findings can be referenced in tickets.
