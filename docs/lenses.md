# Review lenses

Every lens reviews one feature and writes its own file; the builder merges them into one feature in
the report, keeping the product lens's maturity rating and stamping each finding with the lens that
filed it. Re-running one lens leaves the others alone.

| Lens | Flag | Looks for | Cap per feature |
|---|---|---|---|
| Product engineer | default | Does this work for a real user, and what will page someone at 3am | 10 bugs, 8 gaps, 6 opps |
| Security | `--lens security` | The guard rather than the flow: authz depth, tenancy, injection at a named sink, SSRF, secrets, what leaks | 6 bugs, 5 gaps, 3 opps |
| UI/UX | `--lens ux` | The states nobody wrote: empty, loading, error, partial; destructive actions, keyboard and label defects (`a11y`) | 6 bugs, 5 gaps, 3 opps |
| Live browser | `/test-user-flows` | What actually happens when a real browser walks the flow | 6 bugs, 5 gaps, 3 opps |

**The product lens is the default and the specialists are opt-in, because the cost is
multiplicative:** three lenses across sixteen features is 48 subagents. Above ~20 agents the sweep
states the number and asks before spawning.

Each specialist's file says what is *not* a finding for it — CVE-scanner noise and unreachable
theory for security, visual preference and copy rewriting for UI/UX — and each is told that the
product lens owns any defect it already filed at the same `path:line`, so the second pass goes
deeper instead of refiling.
