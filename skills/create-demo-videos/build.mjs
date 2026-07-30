#!/usr/bin/env node
// Stitch the clips and voiceover into one finished mp4 per video.
//
//   node build.mjs docs/recon
//   node build.mjs docs/recon --dry-run    # print the timeline only
//   node build.mjs docs/recon --video 01-billing
//   node build.mjs docs/recon --force      # re-encode every scene
//   node build.mjs --selftest              # check the timing math, no project needed
//
// Each scene becomes one normalised mp4 (the clip held on its last frame if the narration
// outlasts it), then a video's scenes are concatenated and the optional music bed is mixed
// underneath. Hard cuts, no transitions.

import fs from 'node:fs';
import path from 'node:path';

import { parseArgs, run, cache, durationOf, die } from '../../lib/common.mjs';
import { requireNode, requireFfmpeg } from '../../lib/preflight.mjs';
import { loadDemo } from '../../lib/recipes.mjs';
import { resolveViewport } from '../../lib/flows.mjs';

/**
 * The whole sync model.
 *
 * A scene lasts as long as the longer of its clip and its spoken line. If the line runs
 * over, the video holds on its last frame (`videoPadSec`); if the clip runs over, the tail
 * is silence (`driftSec`), which is the number worth watching — more than a couple of
 * seconds and the screen is sitting still while nobody talks.
 */
export function planScene({ clipSec, voSec, leadSec, tailSec }) {
  const spokenSec = voSec ? leadSec + voSec + tailSec : 0;
  const durationSec = Math.max(clipSec, spokenSec);
  const r = (n) => Math.round(n * 1000) / 1000;
  return {
    durationSec: r(durationSec),
    videoPadSec: r(Math.max(0, durationSec - clipSec)),
    driftSec: r(spokenSec ? durationSec - spokenSec : 0),
  };
}

// Runs before anything reads a recon directory, so it needs no project.
if (process.argv.includes('--selftest')) {
  const eq = (got, want, what) => {
    const a = JSON.stringify(got);
    const b = JSON.stringify(want);
    if (a !== b) {
      console.error(`FAIL ${what}: got ${a}, want ${b}`);
      process.exit(1);
    }
  };
  eq(planScene({ clipSec: 6, voSec: 8, leadSec: 0.4, tailSec: 0.6 }),
    { durationSec: 9, videoPadSec: 3, driftSec: 0 }, 'narration outlasts the clip');
  eq(planScene({ clipSec: 12, voSec: 5, leadSec: 0.4, tailSec: 0.6 }),
    { durationSec: 12, videoPadSec: 0, driftSec: 6 }, 'clip outlasts the narration');
  eq(planScene({ clipSec: 4.5, voSec: 0, leadSec: 0.4, tailSec: 0.6 }),
    { durationSec: 4.5, videoPadSec: 0, driftSec: 0 }, 'silent scene');
  console.log('selftest ok');
  process.exit(0);
}

requireNode(20);
requireFfmpeg();

const args = parseArgs();
const { cfg, videos } = loadDemo(args.reconDir);

const ROOT = path.join(args.reconDir, 'videos');
const CLIPS = path.join(ROOT, 'clips');
const VO = path.join(ROOT, 'voiceover');
const SCENES = path.join(ROOT, 'scenes');
const DEMO = path.join(ROOT, 'demo');

const FPS = cfg.fps ?? 30;
const LEAD = cfg.leadSec ?? 0.4;
const TAIL = cfg.tailSec ?? 0.6;
const MAX_DEAD_AIR = cfg.maxDeadAirSec ?? 2.5;

const selected = videos.filter((v) => !args.video || v.id === args.video);
if (!selected.length) die(`no video matched --video ${args.video}.`);

// --- preflight ---------------------------------------------------------------------------
const missing = [];
for (const video of selected) {
  for (const scene of video.scenes ?? []) {
    if (!fs.existsSync(path.join(CLIPS, `${scene.id}.mp4`))) missing.push(scene.id);
  }
}
if (missing.length) {
  die(`no clip for ${missing.length} scene(s): ${missing.slice(0, 5).join(', ')}`
    + `${missing.length > 5 ? ', …' : ''}\nRun capture.mjs first.`);
}

// --- timeline ----------------------------------------------------------------------------
const plans = [];
for (const video of selected) {
  const viewport = resolveViewport(cfg, video.viewport);
  for (const scene of video.scenes ?? []) {
    const clip = path.join(CLIPS, `${scene.id}.mp4`);
    const vo = path.join(VO, `${scene.id}.mp3`);
    const hasVo = fs.existsSync(vo);
    const clipSec = durationOf(clip);
    const voSec = hasVo ? durationOf(vo) : 0;
    plans.push({
      video, scene, clip, viewport,
      vo: hasVo ? vo : null,
      clipSec,
      ...planScene({ clipSec, voSec, leadSec: LEAD, tailSec: TAIL }),
    });
  }
}

const narrated = plans.filter((p) => p.vo).length;
console.log('id                                  clip     scene    hold   dead-air');
let currentVideo = null;
for (const p of plans) {
  if (p.video.id !== currentVideo) {
    currentVideo = p.video.id;
    console.log(`─ ${p.video.id}${p.video.title ? ` — ${p.video.title}` : ''}`);
  }
  const flag = p.driftSec > MAX_DEAD_AIR ? '  ← trim the interactions or say more' : '';
  console.log(
    `  ${p.scene.id.padEnd(32)}${p.clipSec.toFixed(1).padStart(6)}s`
    + `${p.durationSec.toFixed(1).padStart(9)}s${p.videoPadSec.toFixed(1).padStart(8)}s`
    + `${p.driftSec.toFixed(1).padStart(9)}s${flag}`,
  );
}

for (const video of selected) {
  const total = plans.filter((p) => p.video.id === video.id)
    .reduce((n, p) => n + p.durationSec, 0);
  console.log(`${video.id}: ${Math.floor(total / 60)}m${String(Math.round(total % 60)).padStart(2, '0')}s`);
}
if (!narrated) {
  console.log('\nNo voiceover found — these will render silent. Run tts.mjs to narrate them.');
}

if (args.dryRun) process.exit(0);

// --- normalise + mux each scene ----------------------------------------------------------
fs.mkdirSync(SCENES, { recursive: true });
fs.mkdirSync(DEMO, { recursive: true });

for (const p of plans) {
  const outFile = path.join(SCENES, `${p.scene.id}.mp4`);
  const stat = (f) => (f && fs.existsSync(f) ? `${fs.statSync(f).size}:${fs.statSync(f).mtimeMs}` : '-');
  const recipe = JSON.stringify({
    clip: stat(p.clip), vo: stat(p.vo),
    d: p.durationSec, pad: p.videoPadSec,
    w: p.viewport.width, h: p.viewport.height, fps: FPS, lead: LEAD,
  });
  const { fresh, commit } = cache({ dir: SCENES, id: p.scene.id, recipe, outFile, force: args.force });
  if (fresh) continue;

  const audioIn = p.vo ? ['-i', p.vo] : ['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo'];
  const leadMs = Math.round(LEAD * 1000);
  const { width: W, height: H } = p.viewport;
  run('ffmpeg', ['-y', '-i', p.clip, ...audioIn,
    '-filter_complex',
    `[0:v]fps=${FPS},scale=${W}:${H}:force_original_aspect_ratio=decrease,`
    + `pad=${W}:${H}:-1:-1:color=black,setsar=1,`
    + `tpad=stop_mode=clone:stop_duration=${p.videoPadSec},format=yuv420p[v];`
    + `[1:a]adelay=${leadMs}|${leadMs},apad,aresample=44100[a]`,
    '-map', '[v]', '-map', '[a]', '-t', String(p.durationSec),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-ac', '2',
    '-movflags', '+faststart', outFile], { stdio: 'inherit' });
  commit();
}

// --- concat, one mp4 per video ------------------------------------------------------------
const music = cfg.music?.file ? path.resolve(args.reconDir, cfg.music.file) : null;
if (music && !fs.existsSync(music)) die(`music file not found: ${music}`);
const gain = cfg.music?.gain ?? 0.1;

for (const video of selected) {
  const mine = plans.filter((p) => p.video.id === video.id);
  if (!mine.length) continue;

  const list = path.join(SCENES, `${video.id}.list.txt`);
  fs.writeFileSync(list, mine.map((p) => `file '${p.scene.id}.mp4'`).join('\n') + '\n');
  const outFile = path.join(DEMO, `${video.id}.mp4`);
  const total = mine.reduce((n, p) => n + p.durationSec, 0);

  if (music) {
    // Static gain, not sidechain ducking: the voiceover is loudnorm'd to a fixed level, so a
    // fixed bed sits underneath it fine.
    run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', list,
      '-stream_loop', '-1', '-i', music,
      '-filter_complex',
      `[1:a]volume=${gain},afade=t=out:st=${Math.max(0, total - 2).toFixed(2)}:d=2[m];`
      + '[0:a][m]amix=inputs=2:duration=first:normalize=0[a]',
      '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
      '-movflags', '+faststart', outFile], { stdio: 'inherit' });
  } else {
    run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', list,
      '-c', 'copy', '-movflags', '+faststart', outFile], { stdio: 'inherit' });
  }
  console.log(`✓ ${outFile} — ${durationOf(outFile).toFixed(1)}s`);
}

console.log('\nNow watch them. The scripts cannot tell you the pacing is flat.');
