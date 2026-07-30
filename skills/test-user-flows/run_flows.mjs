#!/usr/bin/env node
// Replay every recipe in user-flows.json against the live app and record what happened.
//
//   node run_flows.mjs docs/recon
//   node run_flows.mjs docs/recon --only 02-billing-refund-desktop
//   node run_flows.mjs docs/recon --feature billing --headed --retries 1
//
// Reads <recon-dir>/user-flows.json plus <recon-dir>/flows/*.json, writes
// <recon-dir>/e2e-test-results.json and <recon-dir>/e2e-artifacts/<flowId>/. A failing flow
// is captured and the run continues — this never halts the suite, because the second failure
// is often the one that explains the first.
//
// It reports what happened; it does not decide what it means. That is recon-test-engineer's
// job, and it is why no bug ever appears in this file's output.

import fs from 'node:fs';
import path from 'node:path';

import { parseArgs, readJson, writeJson, die, gitCommit } from '../../lib/common.mjs';
import { requireNode, loadChromium } from '../../lib/preflight.mjs';
import { loadRecipes, selectFlows } from '../../lib/recipes.mjs';
import {
  ensureAuth, attachDiagnostics, resolveViewport, runInteraction,
  interactionContext, describe, CURSOR,
} from '../../lib/flows.mjs';

requireNode(20);

const args = parseArgs();
const { cfg, rawCfg, flows: all } = loadRecipes(args.reconDir);

// --check: validate the recipes without opening a browser. Catches the mistakes that would
// otherwise be discovered several minutes into a run, including the one no generic JSON
// check can see — a flow with no assertion, which always passes and proves nothing.
if (args.check) {
  const problems = [];
  const withProject = readJson(path.join(args.reconDir, 'project.json'));
  const slugs = new Set((withProject?.features ?? []).map((f) => f.slug));

  for (const f of all) {
    const steps = f.interactions ?? [];
    if (!steps.some((s) => s.kind === 'expect')) {
      problems.push(`${f.id}: no expect step — this flow cannot fail, so it verifies nothing`);
    }
    const owners = f.features ?? (f.feature ? [f.feature] : []);
    if (!owners.length) {
      problems.push(`${f.id}: no feature — its results cannot be filed against anything`);
    }
    for (const slug of owners) {
      if (slugs.size && !slugs.has(slug)) {
        problems.push(`${f.id}: feature '${slug}' is not in project.json`);
      }
    }
    if (!f.path) problems.push(`${f.id}: no path — nowhere to start`);
  }

  const literal = ['email', 'password'].filter(
    (k) => rawCfg?.auth?.[k] && !/^\$\{[A-Z0-9_]+\}$/i.test(String(rawCfg.auth[k])));
  for (const k of literal) {
    console.error(`WARN: auth.${k} is a literal. This directory is meant to be committed — `
      + 'use ${RECON_APP_USER} / ${RECON_APP_PASS} instead.');
  }

  for (const p of problems) console.error(`BAD: ${p}`);
  if (problems.length) {
    console.error(`\n${problems.length} problem(s) in ${all.length} flows.`);
    process.exit(1);
  }
  console.log(`OK ${all.length} flows across ${new Set(all.map((f) => f.feature ?? 'cross-feature')).size} groups parse and assert something.`);
  process.exit(0);
}

const flows = selectFlows(all, args);
if (!flows.length) {
  die(`no flow matched${args.only ? ` --only ${args.only}` : ''}`
    + `${args.feature ? ` --feature ${args.feature}` : ''}.`);
}

const ARTIFACTS = path.join(args.reconDir, 'e2e-artifacts');
const AUTH = path.join(args.reconDir, '.auth.json');
const ctxOpts = interactionContext(cfg);
const retries = Number.isFinite(args.retries) ? Math.max(0, args.retries) : 0;

/**
 * One attempt at one flow.
 *
 * The failed step's *kind* decides the status, and the distinction is the whole point:
 *   - an `expect` failed  -> `failed`, the app did not do what it should
 *   - anything else failed -> `blocked`, the recipe never got far enough to test anything
 * A missing selector on a `click` is a stale recipe or missing data. Filing that as a bug
 * sends someone to debug a feature that was never exercised.
 */
async function attempt(browser, flow) {
  const dir = path.join(ARTIFACTS, flow.id);
  fs.mkdirSync(dir, { recursive: true });

  const context = await browser.newContext({
    viewport: resolveViewport(cfg, flow.viewport),
    storageState: fs.existsSync(AUTH) ? AUTH : undefined,
    recordVideo: { dir },
  });
  await context.addInitScript(CURSOR);
  await context.tracing.start({ screenshots: true, snapshots: true });

  const page = await context.newPage();
  const diag = attachDiagnostics(page);
  const started = Date.now();
  let failure = null;

  try {
    await page.goto(new URL(flow.path ?? '/', cfg.baseUrl).href, { waitUntil: 'networkidle' });
    await page.waitForTimeout(ctxOpts.pace(flow.leadInMs ?? 300));

    const steps = flow.interactions ?? [];
    for (let i = 0; i < steps.length; i++) {
      try {
        await runInteraction(page, steps[i], ctxOpts);
      } catch (err) {
        failure = {
          index: i,
          interaction: steps[i],
          reason: String(err.message ?? err).split('\n')[0].slice(0, 400),
          url: page.url(),
          status: steps[i].kind === 'expect' ? 'failed' : 'blocked',
        };
        break;
      }
    }
  } catch (err) {
    failure = {
      index: -1,
      interaction: { kind: 'goto', path: flow.path ?? '/' },
      reason: `could not open ${flow.path ?? '/'}: ${String(err.message ?? err).split('\n')[0]}`,
      url: page.url(),
      status: 'blocked',
    };
  }

  const duration_ms = Date.now() - started;
  const diagnostics = diag.snapshot();

  if (failure) {
    await page.screenshot({ path: path.join(dir, 'failure.png'), fullPage: true }).catch(() => {});
  }
  await context.tracing.stop({ path: path.join(dir, 'trace.zip') }).catch(() => {});

  const video = page.video();
  await context.close();               // flushes the video file

  let videoPath = null;
  try {
    videoPath = video ? await video.path() : null;
  } catch { /* no video recorded */ }

  return { failure, duration_ms, diagnostics, dir, videoPath };
}

/** Keep artifacts only where they help. A passing flow leaves nothing behind. */
function tidy(dir, videoPath, keep) {
  if (keep) {
    if (videoPath && fs.existsSync(videoPath)) {
      fs.renameSync(videoPath, path.join(dir, 'run.webm'));
    }
    return;
  }
  fs.rmSync(dir, { recursive: true, force: true });
}

const rel = (p) => path.relative(args.reconDir, p);

async function runFlow(browser, flow) {
  let outcome = await attempt(browser, flow);
  let flaky = false;

  for (let n = 0; outcome.failure && n < retries; n++) {
    console.log(`  retrying ${flow.id} (${n + 1}/${retries})`);
    fs.rmSync(outcome.dir, { recursive: true, force: true });
    const again = await attempt(browser, flow);
    if (!again.failure) flaky = true;          // passed on retry: a race somewhere, not a clean pass
    outcome = again;
  }

  const status = outcome.failure ? outcome.failure.status : 'passed';
  tidy(outcome.dir, outcome.videoPath, status !== 'passed');

  const result = {
    user_flow_id: flow.id,
    feature: flow.feature ?? null,
    // A cross-feature flow has no single owner, so its result is reported against every
    // feature it touches — the triage pass for any one of them needs to see it.
    ...(flow.features ? { features: flow.features } : {}),
    viewport: typeof flow.viewport === 'string' ? flow.viewport : 'custom',
    status,
    duration_ms: outcome.duration_ms,
    ...(flaky ? { flaky: true } : {}),
    ...(outcome.failure
      ? {
        failed_at: {
          index: outcome.failure.index,
          interaction: outcome.failure.interaction,
          reason: outcome.failure.reason,
          url: outcome.failure.url,
        },
      }
      : {}),
    console_errors: outcome.diagnostics.console_errors,
    network_failures: outcome.diagnostics.network_failures,
    artifacts: status === 'passed' ? {} : {
      failure_screenshot: rel(path.join(outcome.dir, 'failure.png')),
      trace: rel(path.join(outcome.dir, 'trace.zip')),
      ...(outcome.videoPath ? { video: rel(path.join(outcome.dir, 'run.webm')) } : {}),
    },
  };

  const mark = { passed: '✓', failed: '✗', blocked: '⊘' }[status];
  const why = outcome.failure
    ? `  step ${outcome.failure.index}: ${describe(outcome.failure.interaction)} — ${outcome.failure.reason}`
    : '';
  console.log(`${mark} ${flow.id}  ${(outcome.duration_ms / 1000).toFixed(1)}s`
    + `${flaky ? '  (passed on retry — flaky)' : ''}${why ? `\n${why}` : ''}`);

  return result;
}

// ---------------------------------------------------------------------------------------

const chromium = await loadChromium();
const startedAt = new Date().toISOString();
const t0 = Date.now();
const browser = await chromium.launch({ headless: !args.headed });
const browserVersion = `chromium ${browser.version()}`;
const results = [];

try {
  await ensureAuth(browser, cfg, AUTH);
  for (const flow of flows) results.push(await runFlow(browser, flow));
} catch (err) {
  // Auth is the one thing that fails the whole run: with no session every flow would just
  // record the login page, which looks like twelve unrelated bugs.
  console.error(`\nrun aborted: ${err.message}`);
  await browser.close();
  process.exit(1);
} finally {
  await browser.close().catch(() => {});
}

const tally = (s) => results.filter((r) => r.status === s).length;
const out = {
  schema_version: '1.0',
  name: cfg.name ?? path.basename(path.resolve(args.reconDir, '..')),
  baseUrl: cfg.baseUrl,
  run: {
    started_at: startedAt,
    duration_ms: Date.now() - t0,
    git_commit: gitCommit(),
    browser: browserVersion,
    flows_total: results.length,
    passed: tally('passed'),
    failed: tally('failed'),
    blocked: tally('blocked'),
    skipped: all.length - results.length,
  },
  user_flow_results: results,
};

// A --only or --feature run must not delete the results it did not re-run.
const resultsFile = path.join(args.reconDir, 'e2e-test-results.json');
if (args.only || args.feature) {
  const previous = readJson(resultsFile);
  if (previous?.user_flow_results) {
    const fresh = new Set(results.map((r) => r.user_flow_id));
    out.user_flow_results = [
      ...previous.user_flow_results.filter((r) => !fresh.has(r.user_flow_id)),
      ...results,
    ].sort((a, b) => a.user_flow_id.localeCompare(b.user_flow_id));
    const t = (s) => out.user_flow_results.filter((r) => r.status === s).length;
    Object.assign(out.run, {
      flows_total: out.user_flow_results.length,
      passed: t('passed'), failed: t('failed'), blocked: t('blocked'),
      skipped: all.length - out.user_flow_results.length,
    });
  }
}

writeJson(resultsFile, out);

const { passed, failed, blocked } = out.run;
console.log(`\n${out.run.flows_total} flows — ${passed} passed, ${failed} failed, ${blocked} blocked`);
console.log(`→ ${resultsFile}`);
if (failed || blocked) console.log(`  artifacts in ${ARTIFACTS}/`);
