# Task: Implement Opt-In AARRR Pirate Metrics (`--lens aarrr`) Specialist Lens

## Objective
Add an opt-in **AARRR Lifecycle & Funnel Metrics (`--lens aarrr`)** review lens to `claude-feature-recon` as a first-class peer to `security`, `ux`, and `plg`.

When invoked (e.g., `/feature-recon --lens aarrr` or `/feature-recon --lens plg,aarrr`), the plugin must dispatch a dedicated read-only AARRR subagent per feature, write a lens-scoped JSON state file following the exact schema contract used by existing specialist lenses, merge and stamp findings under the `aarrr` identifier, render full filter/badge/SVG chart support in the zero-dependency HTML report, and allow `/feature-tasks` to turn `aarrr` bugs, gaps, and opportunities into prioritized implementation tasks.

---

## Core Design Philosophy: Code-Anchored Lifecycle & Telemetry Recon
`feature-recon` requires `path:line` evidence behind every claim. The `aarrr` subagent is NOT a generic marketing consultant—it is a **Growth Telemetry & Lifecycle Systems Engineer**. 

For every feature it inspects, it must:
1. **Review** how that feature participates in one or more stages of the AARRR customer lifecycle (*Acquisition, Activation, Retention, Referral, Revenue*).
2. **Report** broken tracking calls, dropped attribution parameters, unmeasured funnel transitions, leaky lifecycle states, and billing/retention blind spots (`bugs` and `gaps` with `path:line` citations).
3. **Suggest** concrete, code-level funnel improvements, instrumentation schemas, lifecycle triggers, and conversion experiments (`opportunities` with `path:line` citations and `priority × effort` sizing).

---

## The 5-Stage AARRR Code Audit Rubric (Embed in Subagent Prompt)
Instruct the `aarrr` subagent to audit each feature across Dave McClure's five Pirate Metrics stages (incorporating modern retention-first SaaS/app benchmarks from Sean Ellis, Lenny Rachitsky, and Alistair Croll & Benjamin Yoskovitz's *Lean Analytics*):

### 1. Acquisition (Traffic Attribution, SEO Surface & Entry Plumbing)
* **Attribution Persistence:** Do landing routes, auth/OAuth redirects, and signup handlers capture and persist `utm_source`, `utm_medium`, `utm_campaign`, `referrer`, and affiliate/invite query params into user/session records, or are they stripped on redirect?
* **Discoverability & Metadata:** Do public-facing routes render dynamic title/meta tags, canonical URLs, `sitemap.xml` / `robots.txt` entries, structured data (JSON-LD), and OpenGraph/social preview tags?
* **Entry Telemetry:** Are top-of-funnel landing views and CTA clicks instrumented cleanly before auth boundaries?

### 2. Activation (Onboarding Funnel, "Aha!" Moment & Time-to-Value)
* **Activation Milestone Tracking:** Does the codebase explicitly define and track the feature's core "Aha! moment" (first core action completed, first asset generated, setup checklist finished) in the database (`activated_at` / onboarding state) and analytics SDK?
* **Drop-Off Visibility:** In multi-step flows (wizards, setup forms, imports), can an engineer tell from existing events *which exact step* users abandon, or is only final submission logged?
* **Identity Stitching:** When an anonymous visitor becomes an authenticated user, does the analytics client alias/identify the session (`posthog.identify`, `analytics.alias`, etc.) so pre-signup Acquisition data links to post-signup Activation?

### 3. Retention (Habit Triggers, Cadence & Churn Prevention)
* **Lifecycle Return Triggers:** Are there cron jobs, queues, webhooks, push notifications, or transactional email hooks (`path:line`) bringing inactive or streak-at-risk users back into the product?
* **Engagement State & Cohort Signals:** Does the data model track `last_active_at`, streak states, usage frequency, or feature adoption depth needed to compute D1/D7/D30 retention and spot silent churn before subscription cancellation?
* **Cancellation / Offboarding Flows:** If account deletion or downgrade routes exist, do they capture structured churn reasons or offer pause/downgrade salvage paths?

### 4. Referral (Invite Plumbing, K-Factor Tracking & Advocacy)
* **Referral Mechanics:** If invite, team-seat, share-link, or affiliate code logic exists, trace the full sender-to-recipient handshake (`invite_sent` -> `invite_link_clicked` -> `invite_accepted`).
* **K-Factor Observability:** Does the database schema store `referred_by_user_id` or referral token lineage so viral coefficient ($K$-factor) and referral conversion rate can actually be queried?
* **Advocacy Prompts:** Are high-satisfaction moments (milestone completions, successful exports, streaks) leveraged to prompt reviews, NPS/feedback, or peer invites?

### 5. Revenue (Monetization Gates, Checkout Funnel & LTV Plumbing)
* **Paywall & Upgrade Telemetry:** Are quota limits, feature gates, pricing page views, `paywall_viewed`, and `checkout_started` events instrumented—or does the system only know about revenue once Stripe/RevenueCat/LemonSqueezy fires a webhook?
* **Billing Lifecycle Integrity:** Inspect webhook handlers (`checkout.session.completed`, `invoice.payment_failed`, `customer.subscription.deleted`, trial expirations). Are failed-payment dunning states, grace periods, trial-end nudges, and plan-entitlement syncs handled cleanly without race conditions?
* **Expansion & Pricing Levers:** Identify code-level opportunities for usage-based upsells, contextual upgrade prompts right at quota exhaustion, or annual-plan/tier nudges.

---

## Mapping AARRR Findings + Stage Tagging
Every finding emitted by `--lens aarrr` must conform strictly to `feature-recon`'s existing JSON schema (do NOT break schema compatibility—prefix finding titles with the bracketed stage tag, e.g., `[Activation]`, `[Revenue]`, `[Acquisition]`, unless an optional metadata field is already supported):

* **`bugs` (`severity × effort`):** Broken funnel or telemetry code that already exists—e.g., `[Acquisition]` OAuth callback dropping `?utm_source` before user creation; `[Activation]` analytics `.track()` firing before database commit (logging false activations on validation errors); `[Revenue]` Stripe webhook failing to revoke/grant entitlements on plan change or swallowing `invoice.payment_failed`.
* **`gaps` (`priority × effort`):** Missing funnel observability or lifecycle table stakes—e.g., `[Activation]` 4-step onboarding flow with zero step-level event tracking; `[Acquisition]` anonymous-to-authenticated transition missing `identify()` stitching; `[Retention]` zero `last_active_at` tracking or re-engagement job for dormant accounts; `[Revenue]` hard 403 error on quota limit instead of an instrumented upgrade modal.
* **`opportunities` (`priority × effort`):** Concrete, code-specific AARRR optimization suggestions—e.g., `[Retention]` wiring an existing email/notification service (`path:line`) to trigger a D3 inactive nudge when a user creates a project but never finishes step 2; `[Referral]` adding `referred_by` lineage + reward credit unlock to an existing share token table; `[Revenue]` adding a reverse-trial banner or contextual quota-warning upsell at 80% usage in `path:line`.

---

## Scope Boundary & Anti-Overlap Rules
Instruct the `aarrr` subagent to stay strictly in its lane when run alongside other lenses:
* **vs. Default `product` lens:** Do NOT re-report generic CRUD bugs, null-pointer crashes, or broken business logic unrelated to funnel conversion, lifecycle state, monetization, or telemetry.
* **vs. `ux` lens:** Do NOT re-report CSS layout glitches, missing spinners, or ARIA/accessibility defects. Focus on *funnel drop-off mechanics, conversion friction, and stage measurement*.
* **vs. `security` lens:** Do NOT perform vulnerability/authz auditing (except noting broken webhook signature handling only insofar as billing state desyncs—leave security exploits to `security`).
* **vs. `plg` lens (if present):** `plg` focuses on *self-sustaining viral/artifact loops and ungated product architecture*; `aarrr` focuses on *stage-by-stage funnel conversion, attribution/analytics instrumentation, retention triggers, and billing/monetization plumbing*.

---

## Implementation Plan (Follow Strictly in Order)

### Phase 1: Codebase Reconnaissance (Read Before Writing)
Inspect the repository to verify every file that registers, dispatches, validates, merges, renders, and tests lenses:
1. `agents/` — Read existing reviewer agent markdown files (`product`, `security`, `ux`, and `plg` if already added) to match frontmatter, read-only tool restrictions, two-pass workflow structure, JSON output contract, and `path:line` citation rules.
2. `commands/` & `skills/` — Inspect `/feature-recon` and `/feature-tasks` to see how `--lens` arguments are parsed, dispatched in parallel across features, and prioritized
