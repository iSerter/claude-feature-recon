// Shared plumbing for the browser-driven skills: CLI parsing, JSON loading, `${ENV}`
// interpolation, the content-hash cache, and the two ffmpeg shell-outs.
//
// No Playwright in here — that lives in flows.mjs, so a script that only needs to read a
// recipe (build.mjs) never pays to resolve a browser driver.

import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_RECON_DIR = 'docs/recon';

/** Flags that consume the next argv token. Anything else is a boolean or a positional. */
const WITH_VALUE = new Set(['only', 'feature', 'retries', 'dir', 'out', 'video']);

export function die(msg) {
  console.error(msg);
  process.exit(1);
}

/**
 * Parse the flag set every script in this plugin shares.
 *
 *   node <script> <recon-dir> [--only <id>] [--feature <slug>] [--force]
 *                             [--dry-run] [--headed] [--retries <n>]
 *
 * The recon directory is the first positional, falling back to --dir and then to
 * docs/recon, so the scripts stay callable the same way the skills document them.
 */
export function parseArgs(argv = process.argv.slice(2)) {
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      if (WITH_VALUE.has(a.slice(2))) i++;
      continue;
    }
    positional.push(a);
  }
  const val = (n) => {
    const i = argv.indexOf(`--${n}`);
    return i === -1 ? undefined : argv[i + 1];
  };
  const reconDir = path.resolve(positional[0] ?? val('dir') ?? DEFAULT_RECON_DIR);
  return {
    reconDir,
    only: val('only'),
    feature: val('feature'),
    video: val('video'),
    retries: Number(val('retries') ?? 0),
    force: argv.includes('--force'),
    dryRun: argv.includes('--dry-run'),
    headed: argv.includes('--headed'),
    check: argv.includes('--check'),
  };
}

export function readJson(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    die(`${file} does not parse: ${err.message}`);
  }
}

export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

/**
 * Expand `${VAR}` against the environment, recursively through objects and arrays.
 *
 * The recon directory is meant to be committed, so credentials live in the environment and
 * only their names live in the JSON. An unset variable is left as the literal `${VAR}` and
 * reported by the caller, rather than silently becoming an empty password that produces a
 * baffling login failure.
 */
export function resolveEnv(value, missing = []) {
  if (typeof value === 'string') {
    return value.replace(/\$\{([A-Z0-9_]+)\}/gi, (whole, name) => {
      const found = process.env[name];
      if (found === undefined || found === '') {
        missing.push(name);
        return whole;
      }
      return found;
    });
  }
  if (Array.isArray(value)) return value.map((v) => resolveEnv(v, missing));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveEnv(v, missing)]));
  }
  return value;
}

export function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  if (r.error) throw new Error(`${cmd} could not be started: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`${cmd} failed: ${(r.stderr ?? '').slice(-600)}`);
  return r.stdout ?? '';
}

/** Media duration in seconds, via ffprobe. */
export const durationOf = (file) =>
  Number(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=nw=1:nk=1', file]).trim());

/**
 * Content-hash cache. `recipe` is everything that would change the output; when it matches
 * the marker on disk and the output still exists, the step is skipped.
 *
 * Markers live in a `.cache/` subdirectory so they never collide with the artifacts.
 */
export function cache({ dir, id, recipe, outFile, force = false }) {
  const cacheDir = path.join(dir, '.cache');
  fs.mkdirSync(cacheDir, { recursive: true });
  const hash = crypto.createHash('sha256').update(recipe).digest('hex').slice(0, 16);
  const marker = path.join(cacheDir, `${id}.${hash}`);
  const fresh = !force && fs.existsSync(marker) && fs.existsSync(outFile);
  if (!fresh) {
    for (const f of fs.readdirSync(cacheDir)) {
      if (f === `${id}` || f.startsWith(`${id}.`)) fs.rmSync(path.join(cacheDir, f));
    }
  }
  return { fresh, commit: () => fs.writeFileSync(marker, recipe) };
}

/** `03-lead-magnets` -> a filesystem-safe id. Ids are filenames throughout this plugin. */
export const safeId = (s) => String(s).replace(/[^a-zA-Z0-9._-]+/g, '-');

export function gitCommit(cwd = process.cwd()) {
  try {
    return run('git', ['rev-parse', '--short', 'HEAD'], { cwd }).trim();
  } catch {
    return null;
  }
}
