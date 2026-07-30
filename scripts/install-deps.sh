#!/usr/bin/env sh
# Check (and optionally install) what the browser-driven skills need.
#
#     sh scripts/install-deps.sh             # report only, installs nothing
#     sh scripts/install-deps.sh --install   # install what is missing and installable
#
# Only /identify-user-flows, /test-user-flows and /create-demo-videos need any of this.
# The core sweep — /feature-recon and /feature-tasks — needs nothing beyond python3 or node.
#
# Exits non-zero if anything required is still missing after the run, so a skill can gate on it.

set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
install=0
[ "${1:-}" = "--install" ] && install=1

has() { command -v "$1" >/dev/null 2>&1; }
ok()   { printf '  OK    %s\n' "$1"; }
bad()  { printf '  MISS  %s\n' "$1"; missing=$((missing + 1)); }
note() { printf '        %s\n' "$1"; }

missing=0
echo "feature-recon — browser skill dependencies"
echo

# --- node ----------------------------------------------------------------------------------
if has node; then
  major=$(node -p 'process.versions.node.split(".")[0]')
  if [ "$major" -ge 20 ]; then
    ok "node $(node -v)"
  else
    bad "node $(node -v) — 20 or newer is required"
    note "https://nodejs.org  (or: nvm install 20)"
  fi
else
  bad "node — not installed (20 or newer required)"
  note "https://nodejs.org  (or: nvm install 20)"
fi

# --- ffmpeg / ffprobe ----------------------------------------------------------------------
# Only /create-demo-videos needs these; the test runner does not.
for tool in ffmpeg ffprobe; do
  if has "$tool"; then
    ok "$tool"
  else
    bad "$tool — needed by /create-demo-videos only"
    note "macOS: brew install ffmpeg   ·   Debian: sudo apt-get install ffmpeg"
  fi
done

# --- playwright ----------------------------------------------------------------------------
# Resolved from the plugin's own node_modules first, then from the project being reviewed, so
# a repo that already depends on Playwright does not need a second copy.
playwright_ok=0
if node -e "require('$root/node_modules/playwright')" 2>/dev/null; then
  playwright_ok=1
  ok "playwright (plugin-local)"
elif node -e "require('playwright')" 2>/dev/null; then
  playwright_ok=1
  ok "playwright (from the current project)"
fi

if [ "$playwright_ok" = 0 ]; then
  if [ "$install" = 1 ] && has npm; then
    echo "  ...   installing playwright into $root"
    (cd "$root" && npm install --no-save --no-audit --no-fund playwright >/dev/null 2>&1) \
      && playwright_ok=1
    if [ "$playwright_ok" = 1 ]; then
      ok "playwright (installed)"
    else
      bad "playwright — npm install failed"
    fi
  else
    bad "playwright"
    note "sh scripts/install-deps.sh --install"
  fi
fi

# --- the browser binary --------------------------------------------------------------------
# Installing the package is not enough; Playwright downloads browsers separately.
if [ "$playwright_ok" = 1 ]; then
  if node -e "
    const p = require('$root/node_modules/playwright');
    require('node:fs').accessSync(p.chromium.executablePath());
  " 2>/dev/null || node -e "
    const p = require('playwright');
    require('node:fs').accessSync(p.chromium.executablePath());
  " 2>/dev/null; then
    ok "chromium browser"
  elif [ "$install" = 1 ]; then
    echo "  ...   downloading chromium"
    if (cd "$root" && npx --yes playwright install chromium >/dev/null 2>&1); then
      ok "chromium browser (installed)"
    else
      bad "chromium browser — download failed"
      note "npx playwright install chromium"
    fi
  else
    bad "chromium browser — the package is present but the browser is not"
    note "sh scripts/install-deps.sh --install   (or: npx playwright install chromium)"
  fi
fi

# --- TTS key -------------------------------------------------------------------------------
# Optional on purpose: without it the demo videos render silent rather than failing.
echo
if [ -n "${GOOGLE_GENAI_API_KEY:-}" ] || [ -n "${GEMINI_API_KEY:-}" ]; then
  ok "GOOGLE_GENAI_API_KEY / GEMINI_API_KEY (narration)"
else
  printf '  ---   no TTS key — demo videos will render silent\n'
  note "export GOOGLE_GENAI_API_KEY='...'   ·   https://aistudio.google.com/apikey"
fi

# --- app credentials -----------------------------------------------------------------------
if [ -n "${RECON_APP_USER:-}" ] && [ -n "${RECON_APP_PASS:-}" ]; then
  ok "RECON_APP_USER / RECON_APP_PASS (app login)"
else
  printf '  ---   RECON_APP_USER / RECON_APP_PASS not set\n'
  note "Needed only if user-flows.json references them. Never commit real credentials."
fi

echo
if [ "$missing" -gt 0 ]; then
  echo "$missing dependency/dependencies missing."
  [ "$install" = 0 ] && echo "Re-run with --install to install what can be installed automatically."
  exit 1
fi
echo "All set."
