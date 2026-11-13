# Design: Aemora

Aemora uses the SiteNest "Butter" design system (https://github.com/prabhu-cg/SiteNest/blob/main/DESIGN.md): white paper on a pale butter desk, butter hairlines, and one amber accent. Tokens live in `src/styles/tokens.css`. The tool uses app density (14px); the landing page uses its marketing values.

## Principles
- **One amber voice.** Amber is a fill that marks what is actionable or selected: the primary button, the logo, the active tab underline, a selected row. It is never text.
- **Fill, not text.** Text that carries the accent is `accent-text` (ochre #826400), which is also the focus colour. Text on an amber fill is charcoal (`on-accent`), never white.
- **Newsreader for headlines, DM Sans for everything else.** h1 and h2 (and `.font-display`) are Newsreader 500 at -0.02em. Labels, titles and buttons are DM Sans 600. Bold and extra-bold utilities both resolve to 600.
- **Paper and desk.** White (`bg`/`surface`) is paper: cards, panels, inputs. Pale butter (`desk`) is the desk: sidebar, landing bands. `sand` is the stronger butter wash for hover and secondary tints.
- **Flat pages.** Depth comes from ground and 1px hairline. Shadows are only for things that read as pictures of the product (app windows, panels, the preview dialog). No gradients, no glow.
- **Shape.** Every button is a full pill: text buttons, icon buttons, close buttons, menu items, toggles and chips. Inputs 12px, compact controls 8px, panels and landing cards 20px. Full-width list rows and dropzones are not buttons in this sense and keep their rounded rectangles.
- **Selection is butter, not grey.** A selected tab, nav item, list item, property row or segment uses `accent-tint` with `accent-text` or `ink-strong` text. Hover uses `sand`. Grey fills (`ink-strong` at low opacity) are not used.
- **Light or dark, nothing else.** There is no system option. Light is the default; a previously stored "system" choice is carried over once as the device preference.
- **Honest about what is simulated.** The preview is labelled as a simulation. Sample data is labelled.
- **Motion explains state.** Panels slide in from the right (320ms, decelerating) and leave faster (200ms). Reduced motion becomes a fade.

## Colour
| Token | Light | Dark | Use |
|---|---|---|---|
| `bg` / `surface` | #ffffff | #141312 / #1c1b19 | page, cards |
| `desk` | #fcfaf3 | #181716 | sidebar, landing bands |
| `sand` | #f8f4e4 | #262420 | hover and secondary tints |
| `ink` / `ink-strong` / `ink-muted` | #4d4a4d / #353335 / #6b6b6b | #e6e2da / #faf8f2 / #a8a399 | text |
| `accent` / `accent-hover` | #e8b923 / #d4a615 | #e8b923 / #f0c94a | fills only |
| `accent-text` | #826400 | #f0c94a | accent-coloured text, focus |
| `accent-tint` | #faf4df | #2a2410 | soft badges, selected rows |
| `on-accent` | #353335 | #353335 | text on amber |
| `hairline` / `hairline-strong` | #ece5cc / #dccfa6 | #2e2b26 / #433e35 | dividers and decorative borders |
| `control-border` | #8a7f6e | #7d7569 | outlines of text fields, selects, textareas (3:1 or better) |

Status colours (success, warning, danger, info) each have a `-soft` tint for backgrounds. Every text pairing is checked against WCAG AA 4.5:1, and field outlines against 3:1, by `src/styles/contrast.test.ts`, which reads this file's real values.

Departure from SiteNest: its input outline (`hairline-strong`, #dccfa6) is 1.5:1 on white, so Aemora keeps a warm taupe `control-border` for fields to meet WCAG 1.4.11. Dark mode is derived from the warm charcoal ramp (`night` #141312, `night-card` #1c1b19), since SiteNest does not define the rest of it.

## Components
- **Buttons:** pill, 44px (md), 36px (sm), 52px (lg), DM Sans 600, 2% press scale. Primary is amber with charcoal text; outline is white with a strong hairline; ghost is transparent with a butter hover. Destructive actions are an outline with red text, never a solid red block.
- **Inputs:** 44px in forms, 12px radius, white ground, `control-border` outline, amber focus colour via `accent-text`.
- **Segmented control** (for example Component / Dialog in the preview): a full-pill track with a 1px `hairline` border, `desk` ground and 4px padding. The selected segment is a pill with `accent-tint` and `accent-text`, DM Sans 600. Unselected segments are `ink-muted` and darken on hover. No grey fill, no shadow, no underline.
- **Tabs:** underlined, the selected tab has an amber underline and `accent-text`.
- **Menus and popovers:** 12px radius, `hairline-strong` border, items are pills. A menu opens directly under its trigger, right-aligned to it.

## Implementation notes
- Entrance animations (`.rise`, `.rise-late`) use `animation-fill-mode: backwards`, not `both`. A transform animation that keeps filling makes its element the containing block for `position: fixed` descendants, and menus then open away from their icon.
- The landing page's laptop screenshots are captures of the tool on the sample project (Card, AEM fields tab) at 2240x1400, in light and dark. Retake both whenever the chrome changes.

## The AEM preview skin
Inside `.aem-skin` the tokens are re-pointed to an imitation of AEM's Touch UI dialogs: blue accent, 32px controls, 4px corners, grey tab strip. It is an imitation for the simulated preview, not Adobe's CSS, and it stays light in dark mode, like AEM. It is deliberately not part of the brand theme.

## Rules that are enforced
- One filled primary button per view.
- Every button is a pill.
- Selected states use `accent-tint`, never grey.
- No gradient fills or gradient text; no decorative glow; no amber full-width sections.
- Amber is never used as text; use `accent-text`.
- No `data:` fonts, no inline scripts, no third-party requests (see `vercel.json`). Fonts are self-hosted from `@fontsource-variable`.
