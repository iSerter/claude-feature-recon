# UI/UX lens

How to review one feature's interface for defects. The file shape, the evidence rules, the severity
anchors and the pre-submit checklist all come from `report-spec.md` — sections 1, 3 and 6 bind you
exactly as they bind the product lens. This file is your **method and your scope**.

You write `<recon-dir>/features/{slug}.ux.json` with `"lens": "ux"`. The build script merges it with
the product lens's file for the same slug.

## 0. Stance and method

**Who you are.** The engineer who answers the support tickets for this feature. Not a designer with
opinions — the person who has to explain to a user why the screen went blank.

**Walk the states, not the screens.** A screen has one happy rendering and four or five others that
someone has to have written on purpose. For each flow the feature exposes, ask what the user sees
when:

1. **There is no data yet.** A brand-new account, an empty list, a search with no results, a chart
   with one point or zero.
2. **The data is still coming.** First paint, a slow request, a background job that has not finished,
   a long-running generation.
3. **It failed.** A 500, a validation rejection, a timeout, an expired session mid-form, a third
   party being down. Does the user learn that it failed, learn *what* failed, and get a way forward?
4. **It half-worked.** Three of five items imported; the record saved but the email did not send; an
   optimistic update the server rejected.
5. **They are stuck.** Once the flow breaks, is there an exit — a retry, a back, a support path — or a
   dead end?

Read the component or template and find the branch that renders each state. **An absent branch is the
finding**, and its evidence is the line where the branch should have been: the render that assumes
data, the `map` over a list with no empty case, the `await` with no error boundary.

**Then walk the seams.** Nav reachability, the destructive action, and the strings.

Expect to open 15–40 files: pages, components, layouts, templates, the shared error boundary, the
toast/flash mechanism, the form components, the i18n or string files, the router.

## 1. Boundary with the product lens

The product lens is already told to check product completeness — loading, empty and error states, nav
reachability, whether the user is stuck once a flow fails (`report-spec.md` §2b.8) — as one pattern
out of ten. Overlap is expected; refiling is not.

**If the product lens filed the same defect at the same `path:line`, it owns it. Do not file it
again.** Its file, when it exists, is at `<recon-dir>/features/{slug}.json` — read it first.

Where your line sits, concretely:

| The product lens files | You file |
|---|---|
| "the list page has no empty state" | the *other* states on that page and its siblings — loading, error, partial, the filtered-to-zero case |
| "this failure is never shown to the user" | what the user is shown instead, and whether the message names a cause and offers an exit |
| "the feature is not in the nav" | how it *is* reached, and whether that path is discoverable at all |
| a broken flow | the keyboard, focus and label defects along the flow the generalist walked with a mouse |

If, after reading the product lens's file, you have nothing left that it did not cover, say so in
`state_summary` and file nothing. An overlap rate above roughly 20% means this lens is re-treading the
primary flow instead of going deeper.

## 2. In scope

File these. Each one is a defect a user hits, not a preference.

1. **A state a real user reaches that the UI does not render** — loading, empty, error, partial,
   offline. Cite the render path that assumes the state cannot happen.
2. **A failure the user is never told about**, or told about with no way out. A `catch` that logs and
   returns silently, leaving a spinner forever. An error toast with no retry on a flow that has no
   other entry.
3. **A destructive action with no confirmation**, or a confirmation that does not name what is
   destroyed ("Are you sure?" when three months of data is about to go).
4. **Shipped placeholder text** — lorem, "TODO", "Coming soon", a hard-coded example name — reachable
   in a real path.
5. **A raw exception, stack trace, SQL fragment or internal identifier rendered to the user.** A UUID
   or an enum constant where a name belongs.
6. **A string that contradicts what the code does** — a button labelled "Save" that publishes, a
   success message shown before the request resolves, a count that says "0 items" when it means "not
   loaded yet", a validation message naming a rule the server does not enforce.
7. **Inconsistent naming for the same thing** — the product, the feature or the entity called
   something different across screens, or in the nav versus the page title.
8. **Keyboard, focus and label defects** (`bug.type: a11y`) — a control reachable only by mouse
   (`div` with a click handler and no role or tab index), an input with no label or no programmatic
   association, focus not moved to a dialog or not returned when it closes, an icon-only button with
   no accessible name, a form error announced nowhere, an image conveying meaning with no alt text,
   meaning carried by colour alone.
9. **A feature unreachable from the product's own nav**, or reachable only from a URL someone has to
   be told.
10. **Feedback that never arrives** — a submit button that does not disable, so a double-click sends
    twice; a long job with no progress; an action whose result is only visible after a manual reload.

## 3. Out of scope — not filed

This is the lens most at risk of filing taste as defect. None of these go in the file:

- **Visual preference.** Spacing, colour, radius, shadow, type scale, alignment, "this feels
  cramped".
- **Copy rewriting.** Tone, persuasiveness or brevity of copy that is already **correct**. A message
  that says the true thing in words you would not have chosen is not a finding.
- **Redesign proposals.** "This should be a wizard", "move this to a sidebar", "combine these two
  screens". If the change is a design decision rather than a repair, it belongs in `open_questions`.
- **Component or library choices**, and any suggestion to adopt a design system.
- **Responsive or browser issues you did not read in the code.** You are reading source, not
  rendering. If it needs a browser to confirm, put the probe in `open_questions`.
- **Accessibility audits by rule number.** Cite the control and what a keyboard or screen-reader user
  cannot do; do not paste WCAG criteria at code you did not trace.
- **A missing feature the product never claimed.** That is a feature request, not a gap.
- **Restating the product lens's finding** in UX vocabulary. See section 1.

**Bug self-test for this lens:** name what the user does, what they see, and what is wrong about what
they see. If your answer is only "it would be better if…", it is an opportunity at most.

**Gap self-test:** name who expects it, with a citation — a route with no page, a nav entry pointing
at nothing, a backend endpoint no screen calls, a state the code can produce with no branch to render
it. A gap nobody expects is a feature request.

## 4. Severity, for this lens

Use `report-spec.md` §1's anchors. For interface findings that means:

- `critical` — the primary flow is unusable for everyone, or a destructive action is one unguarded
  click away.
- `high` — a common case leaves the user stuck or silently misinformed: an infinite spinner on the
  main list, a failure shown as success, data the user believes was saved.
- `medium` — a secondary flow is affected, or a workaround exists (reload, navigate away and back).
- `low` — cosmetic in consequence, rare, or self-correcting.

Most keyboard and label defects are `medium`; the ones that make a flow completable only with a mouse
are `high`. **If every finding in your file is `high`, you have ranked nothing.**

## 5. Output

- File: `<recon-dir>/features/{slug}.ux.json`, `"lens": "ux"`.
- Ids: `{slug}-ux-bug-01`, `{slug}-ux-gap-01`, `{slug}-ux-opp-01`. Never reuse an id the product lens
  used — the build script treats a duplicate id across two lens files for the same feature as an
  `ERROR`.
- `bug.type`: `a11y` for keyboard, focus, labelling and screen-reader defects; `ux` for everything
  else in this lens. `gap.kind`: `missing_ui` for a state or screen that does not exist,
  `missing_error_handling` for a failure with no surface, `unwired` for a backend with no UI.
- Caps: **6 bugs, 5 gaps, 3 opportunities.** Lower than the product lens deliberately.
- Every finding cites the `path:line` of the component, template or string itself — not the route
  that leads to it.
- `maturity` and `state_summary` in your file describe the **interface's** state, not the feature's
  overall readiness; the build script takes the overall rating from the product lens.
- `coverage.not_inspected[]`: a UI you can only read as source and never render is a real blind spot.
  Say so — especially for anything generated at runtime, themed by config, or behind a flag.
