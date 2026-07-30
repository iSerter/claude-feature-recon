#!/usr/bin/env node
// Generate the per-scene voiceover with Gemini TTS.
//
//   node tts.mjs docs/recon
//   node tts.mjs docs/recon --only 02-billing-invoices
//   node tts.mjs docs/recon --force
//
// Writes <recon-dir>/videos/voiceover/<sceneId>.mp3 and voiceover/durations.json. Cached by
// sha256(narration + voice + model + style), so re-runs cost nothing.
//
// With no API key this exits 0 having written nothing: the narration text is already in
// demo-videos.json, and build.mjs renders silent video from the same recipe. A missing key
// should cost you the audio, not the deliverable.
//
// See the `gemini-tts` skill for the API contract behind this.

import fs from 'node:fs';
import path from 'node:path';

import { parseArgs, run, cache, durationOf, writeJson } from '../../lib/common.mjs';
import { requireNode, requireFfmpeg, ttsKey, TTS_KEY_HINT } from '../../lib/preflight.mjs';
import { loadDemo } from '../../lib/recipes.mjs';

requireNode(20);

const args = parseArgs();
const { cfg, videos } = loadDemo(args.reconDir);

const OUT = path.join(args.reconDir, 'videos', 'voiceover');
const MODEL = cfg.ttsModel ?? 'gemini-3.1-flash-tts-preview';
const VOICE = cfg.voice ?? 'Kore';
const STYLE = cfg.voiceStyle ?? 'Read in a warm, clear, confident product-demo voice, unhurried:';

const scenes = videos
  .filter((v) => !args.video || v.id === args.video)
  .flatMap((v) => (v.scenes ?? []).filter((s) => !args.only || s.id === args.only))
  .filter((s) => (s.narration ?? '').trim());

const KEY = ttsKey();
if (!KEY) {
  console.log(TTS_KEY_HINT);
  console.log(`${scenes.length} scenes have narration written and will render silent.`);
  console.log('Re-run this script once the key is set; nothing else needs redoing.');
  process.exit(0);
}

requireFfmpeg();
fs.mkdirSync(OUT, { recursive: true });

/** Raw PCM (s16le, 24 kHz, mono) wrapped in a 44-byte WAV header. No container comes back. */
function wavHeader(bytes, rate = 24000) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + bytes, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(bytes, 40);
  return h;
}

async function synthesize(text, voice) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: 'POST',
      headers: { 'x-goog-api-key': KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${STYLE} ${text}` }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
        },
      }),
    },
  );
  if (!res.ok) throw new Error(`Gemini TTS ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const json = await res.json();
  const b64 = json?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!b64) throw new Error(`no audio in response: ${JSON.stringify(json).slice(0, 400)}`);
  return Buffer.from(b64, 'base64');
}

let generated = 0;
let cached = 0;

for (const scene of scenes) {
  const voice = scene.voice ?? VOICE;
  const mp3 = path.join(OUT, `${scene.id}.mp3`);
  const recipe = `${scene.narration}|${voice}|${MODEL}|${STYLE}`;
  const { fresh, commit } = cache({ dir: OUT, id: scene.id, recipe, outFile: mp3, force: args.force });

  if (fresh) {
    cached++;
    continue;
  }

  const pcm = await synthesize(scene.narration, voice);
  const wav = path.join(OUT, `${scene.id}.wav`);
  fs.writeFileSync(wav, Buffer.concat([wavHeader(pcm.length), pcm]));
  // loudnorm so every line sits at the same level; a fixed music bed then works without ducking.
  run('ffmpeg', ['-y', '-i', wav, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
    '-ar', '44100', '-codec:a', 'libmp3lame', '-q:a', '2', mp3]);
  fs.rmSync(wav);
  commit();
  generated++;
  console.log(`✓ ${scene.id}  (${voice})`);
}

// Rebuild over *every* narrated scene, not just the selected ones, so --only does not drop
// the other entries.
const allNarrated = videos.flatMap((v) => (v.scenes ?? []).filter((s) => (s.narration ?? '').trim()));
const durations = {};
let spoken = 0;
for (const scene of allNarrated) {
  const mp3 = path.join(OUT, `${scene.id}.mp3`);
  if (!fs.existsSync(mp3)) continue;
  durations[scene.id] = Number(durationOf(mp3).toFixed(3));
  spoken += durations[scene.id];
}
writeJson(path.join(OUT, 'durations.json'), durations);

console.log(`\n${generated} generated, ${cached} cached — ${spoken.toFixed(1)}s spoken → ${OUT}`);
