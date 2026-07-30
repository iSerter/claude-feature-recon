---
name: create-demo-videos
description: Record narrated demo videos of a codebase's features — Playwright drives the real app with a visible cursor, Gemini TTS narrates each screen, and ffmpeg cuts one mp4 per feature. Use when the user asks for a demo video, feature walkthrough, screen tour, product tour, "show how this works" video, or a video for the README, docs or a listing. Records the app as it is; it never edits application code.
---

# Create Demo Videos

Films the flows that **work**. Reads the recipes `/identify-user-flows` wrote, records the real UI,
narrates it, and cuts one mp4 per feature:

```
user-flows.json + flows/*.json  →  demo-videos.json  →  capture  →  tts  →  build
                                                        clips/     voiceover/  videos/demo/*.mp4
```

Deliberately not a motion-graphics piece: hard cuts, a calm voice, one video per feature, 30–120
seconds each. It records the product as it actually is — which is the whole point of it living in a
recon plugin rather than a marketing one.

Bundled files live beside this SKILL.md (`${CLAUDE_PLUGIN_ROOT}/skills/create-demo-videos/`):
`capture.mjs`, `tts.mjs`, `build.mjs`, `templates/demo-videos.example.json`. The narration agent is
at `${CLAUDE_PLUGIN_ROOT}/agents/recon-feature-explainer.md`. Always pass absolute paths.

**Requires Node 20+, Playwright and ffmpeg**, plus `GOOGLE_GENAI_API_KEY` (or `GEMINI_API_KEY`) for
narration. Without the key everything still works and the videos come out silent.
`sh ${CLAUDE_PLUGIN_ROOT}/scripts/install-deps.sh` reports what is missing.

## When not to use

- The app cannot run locally, or the screens are still mocks. **Record nothing rather than record a
  fake UI.**
- The flows have never been tested. Run `/test-user-flows` first — see step 2.

## Procedure

### 1. Resolve arguments

- `<recon-dir>` — default `docs/recon`, or `--dir <path>`.
- `--feature <slug>` — film one feature only.
- Everything else (voice, pacing, music) is a field in `demo-videos.json`.

`demo-videos.json` holds only what filming needs — voice, pacing, music, scenes. `baseUrl`, `auth`
and `viewports` are read from `user-flows.json`, so a changed login selector stays a one-line edit.

### 2. Film only what passes

Read `<recon-dir>/e2e-test-results.json` and **exclude every flow that is not `passed`.** A demo of a
broken flow is the one output this must never produce: it is a recording of a bug, presented as a
feature.

If there are no test results, say so and offer to run `/test-user-flows` first. If the user declines,
film anyway but **watch every clip in step 5** and tell them plainly that nothing verified these.

Also drop:

- flows with `include_in_demo: false`
- `kind: "edge"` flows — error paths and empty states are valuable tests and poor demos
- anything whose `requires[]` names data that would look like test fixtures on screen

### 3. Write `demo-videos.json`

One video per feature, scenes from that feature's passing flows in the order a new user would meet
them: entry point, then the core loop, then the payoff screen. Start from
`templates/demo-videos.example.json`.

Carry each scene's `interactions` over from its flow, minus the `expect` steps — an assertion is not
a camera move and it costs screen time. Keep `user_flow_id` on every scene so a later recipe edit can
be traced to the scene it invalidates.

Then get the narration written: spawn `recon-feature-explainer`, one per video, in batches of 3–4.
Each prompt carries the orientation brief, the feature name and slug, the absolute path to this
SKILL.md, the absolute `<recon-dir>`, and the video entry it is narrating. The agent writes
`narration` in place and returns a summary only.

**Show the narration to the user before running `tts.mjs`.** It is the cheapest review in the whole
pipeline and the most likely thing to need a second pass.

### 4. Capture

```sh
node ${CLAUDE_PLUGIN_ROOT}/skills/create-demo-videos/capture.mjs <abs recon-dir>
```

Logs in once, records one clip per scene with a visible cursor and click pulses. Cached by recipe
hash: editing one scene re-records only that scene. `--only <sceneId>`, `--video <videoId>`,
`--force`, `--headed`.

A failing selector fails that scene loudly. **Fix the selector, do not loosen the timeout** — and fix
it in `flows/{slug}.json` too, or the next test run hits the same thing.

### 5. Watch the clips

Before spending anything on narration. A clip with a spinner stuck on screen, a half-loaded table, or
an empty list where the demo implies data is a **re-record**, not a build problem. Seed the data and
capture again.

### 6. Narrate

```sh
node ${CLAUDE_PLUGIN_ROOT}/skills/create-demo-videos/tts.mjs <abs recon-dir>
```

Gemini TTS per scene, levelled to a common loudness, cached by content hash so re-runs are free.

With no API key it prints how to enable audio and exits 0 — the narration text is already written,
and the videos render silent. Say that plainly rather than treating it as a failure.

### 7. Build

```sh
node ${CLAUDE_PLUGIN_ROOT}/skills/create-demo-videos/build.mjs <abs recon-dir> --dry-run
node ${CLAUDE_PLUGIN_ROOT}/skills/create-demo-videos/build.mjs <abs recon-dir>
```

Each scene lasts `max(clip, 0.4s + narration + 0.6s)`; if the line outlasts the recording the last
frame is held. The dry run prints how much hold and dead air every scene carries.

Fix anything flagged **`← trim the interactions or say more`** before rendering — that is a scene
where the screen sits still while nobody talks. Fix it in the recipe or the narration, **not** by
raising `maxDeadAirSec`.

Output is `<recon-dir>/videos/demo/{videoId}.mp4`, one per feature.

### 8. Watch them, then report

The scripts cannot tell you the pacing is flat. Watch at least the first and last video. Usual fixes,
in order: cut a scene, shorten a narration line, raise `paceFactor`, add a `hover` before a `click`.

Then give the user the paths, the durations, and — honestly — which features have **no** video and
why: a feature whose flows never passed has no demo, and that absence is worth naming.

## Rules

- **Never film a flow that failed.** If it is broken it is a finding, not a demo.
- **Never fake a screen.** No seeded-looking placeholder text, no `--force` past a stuck spinner, no
  editing the app to make it photogenic. Record what is there or record nothing.
- **The narration cannot outrun the report.** Claims are bounded by what `features/{slug}.json` says
  actually works. An overstated demo undermines every honest finding next to it.
- Read-only against the application. This skill drives the app and writes into the recon directory.
- Music is optional, royalty-free, and lives at `music: { "file": "...", "gain": 0.1 }` relative to
  the recon directory.
