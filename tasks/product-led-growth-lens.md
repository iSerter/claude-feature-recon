# Task: Implement Opt-In Product-Led Growth (`--lens plg`) Specialist Lens

## Objective
Add an opt-in **Product-Led Growth (`--lens plg`)** review lens to `claude-feature-recon` as a first-class peer to the existing `--lens security` and `--lens ux` specialists.

When invoked (e.g., `/feature-recon --lens plg` or `/feature-recon --lens ux,plg`), the plugin must dispatch a dedicated PLG subagent per feature, write a lens-scoped JSON state file following the exact schema contract used by `security` and `ux`, merge those findings into the unified report stamped with the `plg` lens identifier, render full filter/badge/color support in the offline SVG HTML dashboard, and ensure `/feature-tasks` can convert `plg` bugs, gaps, and opportunities into actionable, evidence-cited task files.

---

## Core Design Constraint: Code-Anchored Recon, Never Generic Marketing Advice
`feature-recon` exists to show its work with `path:line` citations behind every claim ("An inventory of what exists is not the deliverable"). 

The `plg` subagent MUST NOT output generic growth-hacking platitudes ("run TikTok ads", "start a newsletter", "add a referral program"). Every single bug, gap, and opportunity filed by `--lens plg` must point to **specific routes, middleware guards, UI components, database models, export/rendering pipelines, or analytics calls in the codebase** (`path:line`) where growth potential is leaked, gated too early, or left unmeasured.

---

## Domain Knowledge Base for the `plg` Subagent Prompt
Embed the following operator frameworks and theoretical models directly into the `plg` agent's review rubric so its code analysis reflects modern Product-Led Growth engineering:

1. **Self-Sustaining Growth Loops vs. Linear Funnels (Reforge — Brian Balfour, Casey Winters, Kevin Kwok; Andrew Chen, *The Cold Start Problem*):**
   * Inspect features as closed compounding systems (`Input -> Action -> Output -> Reinvestment`) rather than one-way funnels.
   * Audit whether user-generated outputs stay trapped in private authenticated views ("Dead-End Artifacts") or generate external acquisition surfaces via **Personal Capital** (utility improves when shared/collaborated), **Social Capital / Billboarding** (status, milestone, or watermarked artifact exports), **User-Generated/Programmatic SEO** (public indexable templates/pages), or **Contextual Give-Get** mechanics.
   * Apply Balfour's **Product-Channel Fit** (*Four Fits Framework*): check if export formats, aspect ratios, URL structures, and OpenGraph/social metadata match how target channels actually distribute content.

2. **Low-Friction Acquisition & Compressing Time-to-Value (Wes Bush, *Product-Led Growth*; Ramli John, *Product-Led Onboarding*; Elena Verna's PLG & AI Growth Playbook; BJ Fogg's $B = MAP$):**
   * Audit where auth walls, email verification, credit card gates, or multi-step intake forms sit relative to the feature's core "Aha! moment."
   * Flag premature friction where *Ability* (ease of experiencing value) is artificially tanked before value delivery. Identify code paths where core feature logic could safely power an **ungated interactive preview, reverse trial, cloneable starter template, or zero-login sidecar micro-tool** ("Engineering as Marketing") before asking the user to sign up
