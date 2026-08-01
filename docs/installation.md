# Installation

```sh
/plugin marketplace add https://github.com/iSerter/claude-feature-recon
/plugin install feature-recon
```

A local checkout works too — pass its path instead of the URL.

## Requirements for the static sweep

`/feature-recon` and `/feature-tasks` need almost nothing:

- `git` — for the commit stamp.
- **Either `python3` (3.6+) or `node` (14+)** — to build the dashboard, whichever you already have.

`build_report.sh` detects one and uses it. The Python and JavaScript builders are ports of each
other and emit byte-identical reports, both standard-library only, nothing to install. Force one
with `FEATURE_RECON_RUNTIME=node`.

With neither runtime the sweep still produces the JSON state files; only the HTML render is skipped.

## Requirements for the browser commands

The three browser commands need more, because they drive a real application:

| Needed by | Dependency |
|---|---|
| `/identify-user-flows`, `/test-user-flows`, `/create-demo-videos` | `node` 20+ and Playwright with Chromium |
| `/create-demo-videos` | `ffmpeg` + `ffprobe` |
| Narration (optional) | `GOOGLE_GENAI_API_KEY` or `GEMINI_API_KEY` — without it the videos render silent |

```sh
sh <plugin>/scripts/install-deps.sh             # report what is missing, install nothing
sh <plugin>/scripts/install-deps.sh --install   # install Playwright + Chromium into the plugin
```

Playwright is resolved from the plugin's own `node_modules` first and from the project being
reviewed second, so a repo that already uses Playwright needs no second copy.

**None of this is needed for `/feature-recon` or `/feature-tasks`** — the static sweep is unchanged.
