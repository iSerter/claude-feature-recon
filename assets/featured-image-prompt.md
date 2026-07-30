# Featured image — generation prompt

Key art for `feature-recon`: a three-person cyberpunk recon squad on a **white** background.
The three operators map onto the plugin's three review lenses — product, security, UI/UX.

Companion to the dark original at [`featured-image.png`](featured-image.png).

## Main prompt

```
Cinematic wide-angle hero shot, photorealistic 3D render, high detail: a three-person
cyberpunk tactical recon squad standing in a bright, clean white environment — an
all-white futuristic operations bay, seamless white cyclorama floor and walls, soft
white server racks barely visible as pale grey outlines in the background, high-key
studio lighting, airy and minimal, no shadows on the backdrop.

The squad wears matte white and light-grey armored tactical gear — plate carriers,
knee pads, utility belts, fitted techwear underlayers — trimmed with thin luminous
accent lines in electric blue and crimson red. Sleek, modern, non-military-branded.
Each operator has a small chest name plate.

LEFT operator: kneeling slightly / angled stance, sweeping a hand across a floating
translucent holographic interface of wireframes, empty-state screens and UI component
grids, rendered in pale blue glass with thin blue edges. Chest plate reads "UI/UX".

CENTER operator: the commander, facing camera, calm and authoritative, holding a
horizontal holographic tablet displaying a node-graph of a codebase — connected boxes
and call-flow lines, a few nodes highlighted red. Chest plate reads "PRODUCT".

RIGHT operator: three-quarter turn, forearm raised behind a large translucent riot
shield made of holographic glass, the shield surface showing a lock glyph, an
auth-flow diagram and small red warning markers. Chest plate reads "SECURITY".

Holograms are the only saturated color in the frame: cyan-to-electric-blue for
structure and data, crimson red for alerts and severity — everything else is white,
bone, and pale grey. Volumetric light rays, faint blue and red light bleed onto the
white floor, thin caustic reflections, subtle depth of field, clean rim lighting on
all three figures.

Composition: symmetrical, subjects in the lower two thirds, generous empty white
space above their heads for a title. Shot on a 35mm lens, f/4, eye-level. Sharp,
premium, product-launch key-art quality. 16:9.
```

## Negative prompt

```
dark background, black background, night scene, neon signs, rain, grime, clutter,
gore, weapons pointed at camera, text artifacts, garbled lettering, watermark, logos,
extra limbs, distorted hands, faces cut off, low contrast, muddy colors
```

## Settings

| | |
|---|---|
| Aspect | 16:9 |
| Size | 2752×1536, or 1920×1080 |
| Style refs | *Mirror's Edge* + Apple keynote key art + Rainbow Six Siege operator render |

## In-image text

Generators mangle long strings — put only these in the prompt, add the rest in post.

- Chest plates: `PRODUCT` · `SECURITY` · `UI/UX`
- Optional shoulder patch on all three: `RECON`

## Caption copy

Overlay in the white space above the squad.

**Title lockup**

> **feature-recon**
> Sweep the codebase. Cite every claim.

**Subtitle** — pick one

> A Claude Code plugin that tells you what works, what's broken, what's missing, and what
> isn't tested — with `path:line` for every finding.

> Reconnaissance, not ground truth. Read-only, cited, and it never touches your code.

**Three-column captions**, one under each operator

| Under LEFT | Under CENTER | Under RIGHT |
|---|---|---|
| **UI/UX LENS** — the states nobody wrote: empty, loading, error, partial | **PRODUCT LENS** — trace the real user flow until it breaks | **SECURITY LENS** — authz depth, tenancy, injection at a named sink |

**Footer strip**, small caps, widely spaced

> JSON STATE FILES · OFFLINE HTML DASHBOARD · SEVERITY × EFFORT PLANNING · FINDINGS → TASKS

**Corner badges**, as an alternative to the footer

> `MIT` · `/feature-recon` · `/feature-tasks`

## Variants worth generating

1. **Warmer white** — swap the pale grey server racks for a soft white gradient void. Reads
   better as a GitHub social card, where the image gets cropped to 2:1.
2. **Red-forward** — push crimson to roughly 30% of the hologram color so the critical-bug idea
   lands harder. The blue-only version reads calmer but less urgent.
