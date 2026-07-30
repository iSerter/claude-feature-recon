#!/usr/bin/env sh
# Build the feature-recon dashboard with whatever runtime this machine has.
#
#     ./build_report.sh <recon-dir> [--out PATH] [--template PATH]
#     ./build_report.sh --check <recon-dir>     # do all the JSON files parse?
#     ./build_report.sh --selftest              # check the build script itself
#     ./build_report.sh --which                 # print the runtime that would be used
#
# Prefers python3, falls back to node — build_report.py and build_report.js are ports of
# each other and emit byte-identical output, so it does not matter which one runs. Set
# FEATURE_RECON_RUNTIME=python3|node (or an absolute interpreter path) to force one.
#
# POSIX sh, no bashisms: this has to run on whatever /bin/sh the machine ships.

set -eu

# Builtins only, so this still reports something useful on a machine missing coreutils.
dir=${0%/*}
if [ "$dir" = "$0" ]; then dir=.; fi
here=$(CDPATH= cd -- "$dir" && pwd)
py="$here/build_report.py"
js="$here/build_report.js"

has() { command -v "$1" >/dev/null 2>&1; }

# python3, or a `python` that is actually Python 3.
find_python() {
  if has python3; then echo python3; return 0; fi
  if has python && python -c 'import sys; sys.exit(0 if sys.version_info >= (3, 6) else 1)' \
      >/dev/null 2>&1; then echo python; return 0; fi
  return 1
}

# node (>= 14, for fs.rmSync), or bun, which runs the same CommonJS file.
find_node() {
  if has node && node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 14 ? 0 : 1)' \
      >/dev/null 2>&1; then echo node; return 0; fi
  if has bun; then echo bun; return 0; fi
  return 1
}

runtime=${FEATURE_RECON_RUNTIME:-}
if [ -n "$runtime" ]; then
  has "$runtime" || { echo "FEATURE_RECON_RUNTIME=$runtime is not on PATH" >&2; exit 127; }
else
  runtime=$(find_python || find_node || true)
fi

case "${runtime##*/}" in
  python*) script=$py ;;
  node|bun|deno) script=$js ;;
  "") printf '%s\n' \
      "feature-recon needs one of these to build the dashboard, and found neither:" \
      "  python3  (3.6+)   https://www.python.org/downloads/" \
      "  node     (14+)    https://nodejs.org/en/download" \
      "Both builders use only the standard library — nothing to install beyond the runtime." \
      "The JSON state files in the recon dir are already complete and readable without either." >&2
    exit 127 ;;
  *) echo "don't know whether $runtime runs Python or JavaScript" >&2; exit 2 ;;
esac

[ -f "$script" ] || { echo "missing $script beside this wrapper" >&2; exit 1; }

if [ "${1:-}" = "--which" ]; then
  echo "$runtime $script"
  exit 0
fi

exec "$runtime" "$script" "$@"
