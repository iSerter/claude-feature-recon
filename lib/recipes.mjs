// Load the user-flow recipes for a recon directory.
//
//   <recon-dir>/user-flows.json     shared config + cross_feature_flows[]
//   <recon-dir>/flows/{slug}.json   one file per feature, agent-written
//
// Nothing here is generated from anything else, so there is no stale copy and no wrong file
// to edit: a stale selector is fixed in the feature's own file, and that is the file that
// runs. Cross-feature flows live in the config file for the same reason `cross_cutting[]`
// lives in project.json — a flow spanning three features has no single feature to own it.

import fs from 'node:fs';
import path from 'node:path';

import { readJson, resolveEnv, die } from './common.mjs';

/**
 * Run order, and why it is this order:
 *   1. cross-feature flows — usually signup/onboarding, which set up state the rest assume
 *   2. per-feature files, in project.json's feature order (alphabetical with no report)
 *   3. within a file, array order — the agent that wrote it chose that sequence
 *
 * Deterministic without any global numbering scheme, which matters because the per-feature
 * files are written in parallel and cannot coordinate id prefixes.
 */
export function loadRecipes(reconDir, { requireFlows = true } = {}) {
  const configFile = path.join(reconDir, 'user-flows.json');
  const raw = readJson(configFile);
  if (!raw) {
    die(`no user-flows.json in ${reconDir}\nRun /identify-user-flows first.`);
  }

  const missingEnv = [];
  const cfg = resolveEnv(raw, missingEnv);
  if (missingEnv.length) {
    die('these environment variables are referenced by user-flows.json but are not set: '
      + `${[...new Set(missingEnv)].join(', ')}\n`
      + `Export them and re-run, e.g.  export ${missingEnv[0]}='...'`);
  }

  const flowsDir = path.join(reconDir, 'flows');
  const files = fs.existsSync(flowsDir)
    ? fs.readdirSync(flowsDir).filter((f) => f.endsWith('.json')).sort()
    : [];

  // project.json is the product's own view of feature order; follow it when it exists.
  const project = readJson(path.join(reconDir, 'project.json'));
  const order = (project?.features ?? []).map((f) => f.slug);
  const rank = (slug) => {
    const i = order.indexOf(slug);
    return i === -1 ? order.length : i;
  };

  const perFeature = files
    .map((file) => {
      const full = path.join(flowsDir, file);
      const doc = readJson(full);
      const slug = doc?.feature ?? path.basename(file, '.json');
      const flows = (doc?.user_flows ?? []).map((f) => ({ feature: slug, ...f }));
      return { slug, file: full, flows };
    })
    .sort((a, b) => rank(a.slug) - rank(b.slug) || a.slug.localeCompare(b.slug));

  const flows = [
    ...(cfg.cross_feature_flows ?? []).map((f) => ({ feature: null, ...f })),
    ...perFeature.flatMap((g) => g.flows),
  ];

  if (requireFlows && !flows.length) {
    die(`no flows found.\n  ${configFile} has no cross_feature_flows, and ${flowsDir} is `
      + (files.length ? 'empty of flows.' : 'missing.')
      + '\nRun /identify-user-flows first.');
  }

  const seen = new Map();
  for (const f of flows) {
    if (!f.id) die(`every flow needs an id (feature: ${f.feature ?? 'cross-feature'}).`);
    if (seen.has(f.id)) {
      die(`duplicate flow id '${f.id}' — it appears in both ${seen.get(f.id)} and `
        + `${f.feature ?? 'cross_feature_flows'}. Ids are how every result and finding refers `
        + 'back to a flow, so they have to be unique across the whole recon directory.');
    }
    seen.set(f.id, f.feature ?? 'cross_feature_flows');
  }

  // rawCfg is the config before `${VAR}` expansion — the only way to tell a literal password
  // apart from one that came out of the environment.
  return { cfg, rawCfg: raw, flows, files: perFeature.map((g) => g.file), configFile };
}

/** `--only` / `--feature` narrowing, shared by the runner and the recorder. */
export function selectFlows(flows, { only, feature } = {}) {
  return flows.filter((f) =>
    (!only || f.id === only) && (!feature || f.feature === feature));
}

/**
 * Load `demo-videos.json`, layered over the flow config.
 *
 * `demo-videos.json` deliberately does *not* carry `baseUrl`, `auth` or `viewports` — those
 * come from `user-flows.json`, so a changed login selector is still one edit. It holds only
 * what is specific to filming: voice, pacing, music, and the scenes themselves.
 */
export function loadDemo(reconDir, { requireVideos = true } = {}) {
  const { cfg: flowCfg } = loadRecipes(reconDir, { requireFlows: false });
  const file = path.join(reconDir, 'demo-videos.json');
  const raw = readJson(file);
  if (!raw) {
    die(`no demo-videos.json in ${reconDir}\nRun /create-demo-videos to write one first.`);
  }

  const missingEnv = [];
  const demo = resolveEnv(raw, missingEnv);
  if (missingEnv.length) {
    die('these environment variables are referenced by demo-videos.json but are not set: '
      + `${[...new Set(missingEnv)].join(', ')}`);
  }

  const videos = demo.videos ?? [];
  if (requireVideos && !videos.length) die(`${file} has no videos.`);

  const seen = new Set();
  for (const v of videos) {
    if (!v.id) die('every video needs an id.');
    for (const s of v.scenes ?? []) {
      if (!s.id) die(`every scene needs an id (video ${v.id}).`);
      if (seen.has(s.id)) die(`duplicate scene id: ${s.id} — scene ids are filenames.`);
      seen.add(s.id);
    }
  }

  // Flow config underneath, demo config on top: the demo file may raise paceFactor for the
  // camera without changing what the test suite runs.
  return { cfg: { ...flowCfg, ...demo }, demo, videos, file };
}
