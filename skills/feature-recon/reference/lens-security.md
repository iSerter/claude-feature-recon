# Security lens

How to review one feature for security defects. The file shape, the evidence rules, the severity
anchors and the pre-submit checklist all come from `report-spec.md` — sections 1, 3 and 6 bind you
exactly as they bind the product lens. This file is your **method and your scope**.

You write `<recon-dir>/features/{slug}.security.json` with `"lens": "security"`. The build script
merges it with the product lens's file for the same slug.

## 0. Stance and method

**Who you are.** An application security engineer reviewing one feature before it meets hostile
users. Not a scanner. Not a compliance checklist.

**Read the guard, not the flow.** The product lens already walked the happy path. You walk the
boundary. Four questions, in this order:

1. **What is worth taking here?** Name the assets this feature touches: other tenants' rows, money,
   credentials, tokens, files, an outbound request that can be pointed anywhere, a queue that
   executes what it is handed.
2. **Where does untrusted input enter?** Every route, webhook, upload, queue payload, imported file,
   third-party callback and admin form belonging to this feature. Untrusted includes anything an
   authenticated but unprivileged user sends.
3. **What is supposed to stop them?** Find the actual mechanism — the middleware, the policy class,
   the scope on the query, the signature check. Open it and read it. A guard you assumed exists is
   the single most common false negative in this lens.
4. **How does the guard fail?** Absent, misordered, applied to the wrong object, checking
   authentication where authorization is needed, checking the parent but not the child, or trivially
   satisfiable.

**Sibling divergence is your highest-yield technique too.** Four routes apply the policy, the fifth
does not. Every mutation is wrapped by the guard except the bulk endpoint. Diff the feature's
entrypoints against each other before anything else — the sibling that gets it right is your evidence
the omission was unintentional, not a deliberate exception.

**Trace to the sink.** A finding is worth filing when you can name the entry point *and* the sink,
and there is nothing in between. "This value is not validated" is not a finding until you say what it
reaches.

## 1. Boundary with the product lens

The product lens is already told to check authorization and tenancy (`report-spec.md` §2b.4) and
input validation (§2b.3). Overlap is expected; refiling is not.

**If the product lens filed the same defect at the same `path:line`, it owns it. Do not file it
again.** Its file, when it exists, is at `<recon-dir>/features/{slug}.json` — read it first.

Where your line sits, concretely:

| The product lens files | You file |
|---|---|
| "this object is fetched by id with no ownership scope" | the *other four* call sites of the same unscoped finder, and whether the scope can be bypassed on the ones that have it |
| "this input is not validated" | the sink it reaches — the query, the shell, the path, the template — and what a crafted value does there |
| "this endpoint has no rate limit" | the specific credential-guessing or enumeration it enables, with the response difference that makes it observable |
| a missing check on the primary flow | the same check missing on the export, the bulk action, the webhook, the admin path, the API token path |

If, after reading the product lens's file, you have nothing left that it did not cover, say so in
`state_summary` and file nothing. **A thin honest file beats a padded one**, and an overlap rate above
roughly 20% means this lens is re-treading the primary flow instead of going deeper.

## 2. Where to look

Adapt to the stack — the categories are the requirement.

1. **Authorization depth** — object-level checks on every path that reaches the object, not just the
   canonical one: list, show, update, delete, export, bulk, nested resource, search, autocomplete.
   Does a check on the parent imply a check on the child? Does the id come from the request body?
2. **Tenancy** — every query that should be scoped and is not. Global scopes that a raw query, a
   `withoutGlobalScope`, a join, an aggregate or a report builder escapes. Cross-tenant ids in
   cached keys, filenames, signed URLs, exported files.
3. **Authentication and session** — token lifetime and revocation, password reset and invite flows
   (single-use? expiring? bound to the account?), 2FA bypass on a secondary path, session fixation,
   "remember me" tokens, impersonation left reachable.
4. **Injection at a named sink** — SQL through string interpolation or an unescaped raw query;
   command execution; path traversal into a filesystem read/write; template injection; deserialization
   of user-controlled data; header and log injection. Name the sink and the line.
5. **Outbound requests (SSRF)** — a URL the user supplies that the server fetches: webhooks,
   avatar-from-URL, importers, link previews, PDF renderers loading remote assets. Internal
   metadata endpoints and redirect-following are what turn this from theory to compromise.
6. **File handling** — upload type and size enforcement (server-side, not just the accept attribute),
   where uploads are stored and whether that path is publicly served or executable, filename handling,
   archive extraction.
7. **Secrets and configuration** — credentials or tokens committed in source, defaults that are
   insecure when an env var is unset, debug/verbose modes reachable in production, permissive CORS,
   a signing key with a fallback default, an internal endpoint with no auth because "it is internal".
8. **Crypto and identifiers** — a non-cryptographic random for a token or a reset code, a predictable
   or sequential id used as a capability, an unsigned or unverified webhook payload, a comparison of
   secrets that is not constant-time where it matters, a hash where a KDF belongs.
9. **What leaks** — an error, a stack trace, a validation message or a timing difference that reveals
   another tenant's data or whether an account exists; sensitive values written to logs; PII in a
   third-party payload; an id enumeration that confirms existence.
10. **Trusting the client** — a price, role, tenant id, quota or state transition taken from the
    request instead of from the server's own record. Mass assignment that reaches a privileged
    column.

## 3. Severity, for this lens

Use `report-spec.md` §1's anchors — do not invent a parallel scale, and do not file everything as
`critical`. Concretely, for security findings:

- `critical` — an unprivileged or unauthenticated request reads or writes data it does not own, or
  executes code. Auth bypass. Cross-tenant read or write.
- `high` — requires a plausible precondition (a valid account of the wrong role, a guessable id, a
  known email) and then yields real data or a privileged action.
- `medium` — needs an unlikely precondition, yields limited information, or a defence-in-depth layer
  is missing while another still holds.
- `low` — hardening. No path to impact that you can name.

**If every finding in your file is `critical`, you have ranked nothing** and the reader has to redo
your work.

## 4. What is not a security finding

Padding here is worse than elsewhere: a security file that cries wolf gets the whole report
disbelieved. None of these go in the file:

- **Scanner noise.** A dependency CVE with no reachable call from this feature; a version number you
  did not correlate with an actual code path; a header that is missing but that nothing here relies on.
- **Theoretical issues with no entry point.** If you cannot name the route, job or payload that
  reaches it, it is not reachable — say so in `open_questions` instead.
- **Generic advice.** "Add a WAF", "rotate keys", "enable MFA", "sanitise all inputs", "use
  prepared statements everywhere". Untethered to a line, it is not a finding.
- **A defence that exists one layer up.** Check whether the framework, the middleware or the ORM
  already handles it before filing. An ORM that parameterises by default is not an injection finding.
- **Restating the product lens's finding** in security vocabulary. See section 1.
- **Compliance gaps** (SOC 2, GDPR text, audit logging as policy) unless the missing control has a
  concrete abuse path in this feature.
- **Anything you would have to run, fuzz or attack to confirm.** This is a static review. If it needs
  a live probe, file it as an `open_question` naming the probe. Name it precisely: `/identify-user-flows`
  reads these and can turn a probe that only needs a *normal user doing a normal thing* into a flow
  the `e2e` lens runs for real. It will not fuzz or attack anything, so a probe that requires either
  stays an open question.

**Bug self-test for this lens:** name the actor, the request they send, and what they get that they
should not. If you cannot fill all three, it is not a security bug — downgrade it to an opportunity
(hardening) or drop it.

**Gap self-test:** a missing control is a gap only when something in the code expects it — a sibling
that has it, a policy class with no caller, a config flag that is read nowhere. Cite that in
`expected_by`.

## 5. Output

- File: `<recon-dir>/features/{slug}.security.json`, `"lens": "security"`.
- Ids: `{slug}-sec-bug-01`, `{slug}-sec-gap-01`, `{slug}-sec-opp-01`. Never reuse an id the product
  lens used — the build script treats a duplicate id across two lens files for the same feature as an
  `ERROR`.
- `bug.type` is `security` for anything with an abuse path; use `data_integrity` when the damage is
  corruption rather than access, and `a11y`/`ux` never.
- Caps: **6 bugs, 5 gaps, 3 opportunities.** Lower than the product lens deliberately. Three lenses
  at full caps is a report nobody reads.
- `maturity` and `state_summary` in your file describe the feature's **security posture**, not its
  overall readiness — the build script takes the overall rating from the product lens, so be blunt
  here without worrying that you are contradicting it.
- `coverage.not_inspected[]` earns its keep in this lens: the infrastructure config you cannot see,
  the WAF or gateway rules that may already mitigate something, the runtime you cannot probe.
