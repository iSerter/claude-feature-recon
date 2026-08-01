# The live-browser lens

The sweep is a code read. These three commands open the app.

```
/identify-user-flows  →  /test-user-flows  →  /create-demo-videos
   recipes                 results + findings      narrated mp4s
```

## 1. Recipes

The sweep already described each feature's flows in prose and said where each one stops.
`/identify-user-flows` turns those sentences into recipes a browser can replay — with real
selectors, read out of the page components, never invented. The UX and security lenses are told to
park anything needing a browser in `open_questions`; those parked probes are picked up here and
become flows.

Every flow must carry at least one `expect` step. A recipe of hovers and scrolls always passes and
therefore verifies nothing.

## 2. Results, then findings

`/test-user-flows` replays them and records what happened. It never stops on a failure — the second
failure is often what explains the first. Three outcomes, and the distinction is the point:

| | Meaning | Whose problem |
|---|---|---|
| `passed` | Every assertion held | — |
| `failed` | An `expect` did not hold | The application |
| `blocked` | Never reached an assertion — stale selector, missing data, page would not open | The recipe or the environment |

Then an agent traces each failure back into the source and files it as an ordinary finding with a
`path:line`, so it lands in the same dashboard as everything else, tagged **Live browser**. A raw
timeout is not a bug report; the trace is the valuable part.

This is the only lens that can **retire** a finding. When a flow completes where the product lens
predicted a break, that finding was wrong and gets deleted — which no amount of re-reading the code
could have established.

## 3. Videos

`/create-demo-videos` films the flows that **passed**, one mp4 per feature: Playwright drives the
real UI with a visible cursor, Gemini TTS narrates each scene, ffmpeg cuts it together. A flow that
failed is never filmed — that would be a recording of a bug presented as a feature — and the
narration is bounded by what the report says actually works.

Both browser commands drive the app through the same interaction code, so the flow the suite
verified is the flow the camera films.
