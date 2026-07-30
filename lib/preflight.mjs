// Dependency checks shared by every browser-driven script.
//
// The rule these enforce is the one from the skills: name the single missing thing and stop.
// Never fall back to a different browser, never skip narration silently, never "try anyway".

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { die } from './common.mjs';

/** The plugin root — one level up from lib/. */
export const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const INSTALL_HINT = `Run:  sh ${path.join(PLUGIN_ROOT, 'scripts', 'install-deps.sh')} --install`;

export function requireNode(minMajor = 20) {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < minMajor) {
    die(`node ${minMajor}+ is required (found ${process.versions.node}).`);
  }
}

export function has(cmd) {
  // `sh -c` rather than `shell: true` with an argument array — the latter concatenates
  // unescaped and Node deprecates it (DEP0190).
  return spawnSync('sh', ['-c', `command -v ${cmd}`], { encoding: 'utf8' }).status === 0;
}

export function requireFfmpeg({ probe = true } = {}) {
  const missing = ['ffmpeg', ...(probe ? ['ffprobe'] : [])].filter((c) => !has(c));
  if (missing.length) {
    die(`${missing.join(' and ')} not found on PATH.\n`
      + '  macOS:  brew install ffmpeg\n'
      + '  Debian: sudo apt-get install ffmpeg');
  }
}

/**
 * Resolve Playwright from the plugin's own node_modules first, then from the project being
 * reviewed — a repo that already uses Playwright should not need a second copy.
 */
export async function loadChromium() {
  const names = ['playwright', 'playwright-core'];
  for (const name of names) {
    try {
      return (await import(name)).chromium;
    } catch { /* not resolvable from the plugin; try the project next */ }
  }
  const requireFromCwd = createRequire(path.join(process.cwd(), 'noop.cjs'));
  for (const name of names) {
    try {
      return requireFromCwd(name).chromium;
    } catch { /* fall through to the error below */ }
  }
  die('playwright is not installed.\n' + INSTALL_HINT);
}

/**
 * Gemini API key, or null. Callers decide what null means: `create-demo-videos` degrades to
 * silent video, which is why this returns rather than exits.
 */
export function ttsKey() {
  return process.env.GOOGLE_GENAI_API_KEY ?? process.env.GEMINI_API_KEY ?? null;
}

export const TTS_KEY_HINT =
  'No TTS key found. Set GOOGLE_GENAI_API_KEY (or GEMINI_API_KEY) to narrate these videos.';
