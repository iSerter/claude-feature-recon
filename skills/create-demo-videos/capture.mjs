#!/usr/bin/env node
// Record one clip per scene by driving the live app with Playwright.
//
//   node capture.mjs docs/recon
//   node capture.mjs docs/recon --only 02-billing-invoices
//   node capture.mjs docs/recon --video 01-billing
//   node capture.mjs docs/recon --force
//
// Reads demo-videos.json (layered over user-flows.json for baseUrl and auth) and writes
// <recon-dir>/videos/clips/<sceneId>.mp4. Cached by a hash of each scene's recipe, so
// re-running only re-records what you actually edited.

import fs from 'node:fs';
import path from 'node:path';

import { parseArgs, run, cache, die } from '../../lib/common.mjs';
import { requireNode, requireFfmpeg, loadChromium } from '../../lib/preflight.mjs';
import { loadDemo } from '../../lib/recipes.mjs';
import {
  ensureAuth, resolveViewport, runInteraction, interactionContext,
  withoutAssertions, CURSOR,
} from '../../lib/flows.mjs';

requireNode(20);
requireFfmpeg({ probe: false });

const args = parseArgs();
const { cfg, videos } = loadDemo(args.reconDir);

const OUT = path.join(args.reconDir, 'videos', 'clips');
const AUTH = path.join(args.reconDir, '.auth.json');
const FPS = cfg.fps ?? 30;
const ctxOpts = interactionContext(cfg);

fs.mkdirSync(OUT, { recursive: true });

const selected = videos
  .filter((v) => !args.video || v.id === args.video)
  .map((v) => ({ ...v, scenes: (v.scenes ?? []).filter((s) => !args.only || s.id === args.only) }))
  .filter((v) => v.scenes.length);

if (!selected.length) {
  die(`no scene matched${args.video ? ` --video ${args.video}` : ''}`
    + `${args.only ? ` --only ${args.only}` : ''}.`);
}

async function captureScene(browser, video, scene) {
  const viewport = resolveViewport(cfg, video.viewport);
  const steps = withoutAssertions(scene.interactions ?? []);
  const outFile = path.join(OUT, `${scene.id}.mp4`);

  // leadInMs is in the recipe on purpose: the skill this was ported from left it out, so
  // changing a scene's lead-in silently reused the previous clip.
  const recipe = JSON.stringify({
    path: scene.path,
    interactions: steps,
    leadIn: scene.leadInMs ?? 700,
    hold: scene.holdMs ?? 1200,
    viewport,
    pace: cfg.paceFactor ?? 1.3,
    fps: FPS,
  });

  const { fresh, commit } = cache({ dir: OUT, id: scene.id, recipe, outFile, force: args.force });
  if (fresh) {
    console.log(`· ${scene.id} (cached)`);
    return false;
  }

  const tmp = fs.mkdtempSync(path.join(OUT, '.rec-'));
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    storageState: fs.existsSync(AUTH) ? AUTH : undefined,
    recordVideo: { dir: tmp, size: viewport },
  });
  await context.addInitScript(CURSOR);

  try {
    const page = await context.newPage();
    await page.goto(new URL(scene.path ?? '/', cfg.baseUrl).href, { waitUntil: 'networkidle' });
    await page.waitForTimeout(ctxOpts.pace(scene.leadInMs ?? 700));
    for (const step of steps) await runInteraction(page, step, ctxOpts);
    await page.waitForTimeout(ctxOpts.pace(scene.holdMs ?? 1200));

    const video_ = page.video();
    await context.close();                       // flushes the webm
    const webm = await video_.path();

    run('ffmpeg', ['-y', '-i', webm, '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
      '-pix_fmt', 'yuv420p', '-r', String(FPS), '-an', outFile], { stdio: 'inherit' });
    commit();
    console.log(`✓ ${scene.id}`);
    return true;
  } catch (err) {
    await context.close().catch(() => {});
    // Loud, and specific about which scene: a silently short clip is much worse than a stop.
    throw new Error(`scene ${scene.id}: ${err.message}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const chromium = await loadChromium();
const browser = await chromium.launch({ headless: !args.headed });
let recorded = 0;

try {
  await ensureAuth(browser, cfg, AUTH);
  for (const video of selected) {
    console.log(`\n${video.id}${video.title ? ` — ${video.title}` : ''}`);
    for (const scene of video.scenes) {
      if (await captureScene(browser, video, scene)) recorded++;
    }
  }
} finally {
  await browser.close().catch(() => {});
}

const total = selected.reduce((n, v) => n + v.scenes.length, 0);
console.log(`\n${recorded} recorded, ${total - recorded} cached → ${OUT}`);
console.log('Watch the clips before narrating. A stuck spinner is a re-record, not a build problem.');
