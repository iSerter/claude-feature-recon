// The interaction vocabulary, auth, viewports and the on-screen cursor.
//
// This module is the contract between `test-user-flows` and `create-demo-videos`: both drive
// the browser through exactly this code, so a flow that the suite verified is the same flow
// the camera films. Adding a step kind here adds it to both skills at once — which is the
// point. Duplicating it is how the two would silently drift apart.

import fs from 'node:fs';

// ---------------------------------------------------------------------------------------
// Cursor overlay
// ---------------------------------------------------------------------------------------
// Playwright moves a real pointer but paints nothing, so a recording shows things reacting to
// an invisible hand. This draws the dot and a click pulse. Injected as an init script so it
// survives navigation; capture-phase listeners so a page that stops propagation can't blind it.

export const CURSOR = `(() => {
  const install = () => {
    if (document.getElementById('__recon_cursor')) return;
    const style = document.createElement('style');
    style.textContent = \`
      #__recon_cursor, #__recon_pulse {
        position: fixed; left: -60px; top: -60px; width: 22px; height: 22px;
        border-radius: 50%; pointer-events: none; margin: -11px 0 0 -11px;
      }
      #__recon_cursor {
        background: rgba(232,106,74,.9); z-index: 2147483647;
        box-shadow: 0 0 0 3px rgba(255,255,255,.9), 0 2px 12px rgba(0,0,0,.35);
      }
      #__recon_pulse {
        border: 3px solid rgba(232,106,74,.8); z-index: 2147483646; opacity: 0;
      }
      #__recon_pulse.on { animation: __recon_p .45s ease-out; }
      @keyframes __recon_p {
        from { transform: scale(1); opacity: .9; }
        to   { transform: scale(3.2); opacity: 0; }
      }
    \`;
    document.head.appendChild(style);
    for (const id of ['__recon_pulse', '__recon_cursor']) {
      const el = document.createElement('div');
      el.id = id;
      document.body.appendChild(el);
    }
    const dot = document.getElementById('__recon_cursor');
    const pulse = document.getElementById('__recon_pulse');
    addEventListener('mousemove', (e) => {
      for (const el of [dot, pulse]) { el.style.left = e.clientX + 'px'; el.style.top = e.clientY + 'px'; }
    }, true);
    addEventListener('mousedown', () => {
      pulse.classList.remove('on');
      void pulse.offsetWidth;
      pulse.classList.add('on');
    }, true);
  };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', install);
  else install();
})();`;

// ---------------------------------------------------------------------------------------
// Viewports
// ---------------------------------------------------------------------------------------

export const DEFAULT_VIEWPORTS = {
  desktop: { width: 1920, height: 1080 },
  mobile: { width: 360, height: 780 },
};

/**
 * A flow's `viewport` is either a key into the recipe's `viewports` map or a literal
 * `{width,height}`. An unknown key is a recipe error, not something to guess around.
 */
export function resolveViewport(cfg, want) {
  if (want && typeof want === 'object') return want;
  const table = { ...DEFAULT_VIEWPORTS, ...(cfg.viewports ?? {}) };
  if (!want) return table.desktop;
  const found = table[want];
  if (!found) {
    throw new Error(`unknown viewport '${want}' — define it under "viewports" in the recipe`);
  }
  return found;
}

// ---------------------------------------------------------------------------------------
// Interactions
// ---------------------------------------------------------------------------------------

const STEPS = 36;

const at = (page, step) => page.locator(step.selector).nth(step.nth ?? 0);

async function boxOf(page, selector, nth = 0, timeout = 15000) {
  const el = page.locator(selector).nth(nth);
  // Wait explicitly rather than letting boundingBox() fall back to Playwright's own 30s
  // default: a stale selector is the most common recipe error, and it should fail in the
  // time the recipe asked for, naming the selector.
  try {
    await el.waitFor({ state: 'visible', timeout });
  } catch {
    throw new Error(`selector not found or not visible within ${timeout}ms: ${selector}`);
  }
  await el.scrollIntoViewIfNeeded({ timeout }).catch(() => {});
  const box = await el.boundingBox();
  if (!box) throw new Error(`selector has no box (zero-sized or detached): ${selector}`);
  return box;
}

const centre = (b) => [b.x + b.width / 2, b.y + b.height / 2];

/** Human-readable one-liner for a step, used in error messages and the dry-run timeline. */
export function describe(step) {
  const bits = [step.kind];
  if (step.selector) bits.push(step.selector + (step.nth ? `[${step.nth}]` : ''));
  if (step.path) bits.push(step.path);
  if (step.text !== undefined) bits.push(JSON.stringify(step.text));
  if (step.urlContains) bits.push(`url~${step.urlContains}`);
  if (step.key) bits.push(step.key);
  if (step.ms !== undefined) bits.push(`${step.ms}ms`);
  if (step.dy !== undefined) bits.push(`dy=${step.dy}`);
  return bits.join(' ');
}

/**
 * Assertions. This is the one kind mago-kit's walkthrough recipes did not need and a test
 * recipe cannot do without — a flow of hovers and scrolls has no way to fail, so it proves
 * nothing. `identify-user-flows` requires at least one of these per flow.
 */
async function runExpect(page, step, ctx) {
  const timeout = step.timeout ?? ctx.defaultTimeoutMs;
  const negated = step.not === true;

  if (step.urlContains) {
    try {
      await page.waitForFunction(
        ([needle, no]) => (window.location.href.includes(needle) ? !no : no),
        [step.urlContains, negated],
        { timeout },
      );
    } catch {
      throw new Error(
        `expected url ${negated ? 'not ' : ''}to contain '${step.urlContains}' but it is '${page.url()}'`,
      );
    }
    return;
  }

  if (!step.selector) throw new Error('expect needs a selector or urlContains');
  const el = at(page, step);

  if (step.text !== undefined) {
    try {
      await el.filter({ hasText: step.text }).first()
        .waitFor({ state: negated ? 'detached' : 'visible', timeout });
    } catch {
      const actual = await el.textContent().catch(() => null);
      throw new Error(
        `expected '${step.selector}' ${negated ? 'not ' : ''}to contain '${step.text}'`
        + ` but its text is ${actual === null ? 'unreadable' : JSON.stringify(actual.trim())}`,
      );
    }
    return;
  }

  const state = step.state ?? (negated ? 'hidden' : 'visible');
  try {
    await el.waitFor({ state, timeout });
  } catch {
    throw new Error(`expected '${step.selector}' to be ${state} within ${timeout}ms`);
  }
}

/**
 * Run one step. Single steps rather than a whole list so the caller can record which index
 * failed — that index is what `e2e-test-results.json` reports and what makes a failure
 * actionable instead of "the flow broke somewhere".
 */
export async function runInteraction(page, step, ctx) {
  const pace = ctx.pace;
  switch (step.kind) {
    case 'wait':
      await page.waitForTimeout(pace(step.ms ?? 800));
      break;

    case 'goto':
      await page.goto(new URL(step.path, ctx.baseUrl).href, { waitUntil: 'networkidle' });
      await page.waitForTimeout(pace(500));
      break;

    case 'hover':
    case 'move': {
      const box = await boxOf(page, step.selector, step.nth ?? 0, ctx.defaultTimeoutMs);
      await page.mouse.move(...centre(box), { steps: STEPS });
      break;
    }

    case 'click': {
      const box = await boxOf(page, step.selector, step.nth ?? 0, ctx.defaultTimeoutMs);
      await page.mouse.move(...centre(box), { steps: STEPS });
      await page.waitForTimeout(pace(180));
      await page.mouse.down();
      await page.waitForTimeout(70);          // long enough for the pulse to register
      await page.mouse.up();
      break;
    }

    case 'type':
      await at(page, step).pressSequentially(step.text ?? '', { delay: pace(55) });
      break;

    case 'press':
      await page.keyboard.press(step.key);
      break;

    case 'select':
      await at(page, step).selectOption(step.value);
      break;

    case 'scroll':
      // In chunks, so the page eases rather than teleports.
      for (let i = 0; i < 6; i++) {
        await page.mouse.wheel(0, (step.dy ?? 600) / 6);
        await page.waitForTimeout(40);
      }
      break;

    case 'drag': {
      const from = await boxOf(page, step.from, 0, ctx.defaultTimeoutMs);
      const to = await boxOf(page, step.to, 0, ctx.defaultTimeoutMs);
      await page.mouse.move(...centre(from), { steps: STEPS });
      await page.mouse.down();
      await page.mouse.move(...centre(to), { steps: STEPS * 2 });
      await page.waitForTimeout(pace(200));
      await page.mouse.up();
      break;
    }

    case 'waitFor':
      await at(page, step).waitFor({
        state: step.state ?? 'visible',
        timeout: step.timeout ?? ctx.defaultTimeoutMs,
      });
      break;

    case 'expect':
      await runExpect(page, step, ctx);
      break;

    default:
      throw new Error(`unknown interaction: ${step.kind}`);
  }
}

/** Everything a step needs that does not come from the step itself. */
export function interactionContext(cfg) {
  const factor = cfg.paceFactor ?? 1;
  return {
    baseUrl: cfg.baseUrl ?? 'http://localhost',
    defaultTimeoutMs: cfg.defaultTimeoutMs ?? 15000,
    pace: (ms) => Math.round(ms * factor),
  };
}

/** An `expect` is an assertion, not a camera move — demo scenes drop them. */
export const withoutAssertions = (steps = []) => steps.filter((s) => s.kind !== 'expect');

// ---------------------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------------------

/**
 * Log in once and persist storage state.
 *
 * Unlike the skill this was ported from, a cached state file is *verified* before it is
 * trusted: an expired session otherwise produces a full run of login-redirect screens with
 * no error anywhere, which is the worst possible failure mode for both a test and a video.
 */
export async function ensureAuth(browser, cfg, authFile) {
  const auth = cfg.auth ?? { kind: 'none' };
  if (auth.kind === 'none' || !auth.loginPath) return null;

  if (fs.existsSync(authFile) && await authStillValid(browser, cfg, authFile)) return authFile;
  if (fs.existsSync(authFile)) {
    console.log('· stored session is no longer valid — logging in again');
    fs.rmSync(authFile);
  }

  if (!auth.email || !auth.password) {
    throw new Error('auth needs email + password. Set them in the recipe, or via the '
      + 'environment if it uses ${RECON_APP_USER} / ${RECON_APP_PASS}.');
  }
  if (/\$\{[A-Z0-9_]+\}/i.test(`${auth.email}${auth.password}`)) {
    throw new Error(`auth credentials still contain an unresolved \${VAR}: `
      + `${auth.email} / ${'*'.repeat(8)}. Export the variable before running.`);
  }

  const ctx = await browser.newContext({ viewport: resolveViewport(cfg, cfg.authViewport) });
  const page = await ctx.newPage();
  try {
    await page.goto(new URL(auth.loginPath, cfg.baseUrl).href, { waitUntil: 'networkidle' });
    await page.fill(auth.emailSelector ?? '#email', auth.email);
    await page.fill(auth.passwordSelector ?? '#password', auth.password);
    await Promise.all([
      page.waitForLoadState('networkidle'),
      page.click(auth.submitSelector ?? 'button[type=submit]'),
    ]);
    if (new URL(page.url()).pathname.startsWith(auth.loginPath)) {
      throw new Error('login failed — still on the login page. Check the credentials and that '
        + 'the app is actually up.');
    }
    await ctx.storageState({ path: authFile });
    console.log('✓ logged in → ' + authFile);
  } finally {
    await ctx.close();
  }
  return authFile;
}

/** Hit the post-login landing page with the stored cookies and see whether we stay there. */
async function authStillValid(browser, cfg, authFile) {
  const auth = cfg.auth ?? {};
  const probePath = auth.successPath ?? '/';
  const ctx = await browser.newContext({ storageState: authFile, viewport: { width: 1280, height: 800 } });
  try {
    const page = await ctx.newPage();
    await page.goto(new URL(probePath, cfg.baseUrl).href, { waitUntil: 'networkidle' });
    return !new URL(page.url()).pathname.startsWith(auth.loginPath);
  } catch {
    return false;
  } finally {
    await ctx.close();
  }
}

// ---------------------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------------------

/**
 * Console errors and failed requests, collected passively. A flow can pass every assertion
 * while the console fills with exceptions; that is worth reporting even when nothing failed.
 */
export function attachDiagnostics(page) {
  const consoleErrors = [];
  const networkFailures = [];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const loc = msg.location();
    const where = loc?.url ? `  @ ${loc.url}:${loc.lineNumber ?? 0}` : '';
    consoleErrors.push(msg.text() + where);
  });
  page.on('pageerror', (err) => consoleErrors.push(`${err.name}: ${err.message}`));
  page.on('response', (res) => {
    if (res.status() < 400) return;
    networkFailures.push({ url: res.url(), status: res.status(), method: res.request().method() });
  });
  page.on('requestfailed', (req) => {
    networkFailures.push({
      url: req.url(),
      status: null,
      method: req.method(),
      error: req.failure()?.errorText ?? 'request failed',
    });
  });
  return {
    consoleErrors,
    networkFailures,
    // Deduped, and capped: one broken asset on a page can produce hundreds of identical lines.
    snapshot() {
      const uniq = (arr, key) => {
        const seen = new Set();
        return arr.filter((x) => {
          const k = key(x);
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        }).slice(0, 20);
      };
      return {
        console_errors: uniq(consoleErrors, (e) => e),
        network_failures: uniq(networkFailures, (f) => `${f.method} ${f.url} ${f.status}`),
      };
    },
  };
}
