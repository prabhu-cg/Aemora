# Design: Aemora

Aemora inherits the Yedara design system rather than inventing one. The tool uses Yedara's app density; the landing page uses its marketing values. Tokens live in `src/styles/tokens.css`.

## Principles
- **Warm neutrals and one orange voice.** White and sand grounds, hairline rules, orange only for actions, the thread, and the final band.
- **Manrope 800 for display and titles**, weight and tight tracking carry hierarchy. Tool text is 14px on a 16px root; the landing page is 16px.
- **Flat pages.** Depth comes from hairlines and tonal bands. Shadows are only for things that read as pictures of the product (app windows, panels, the preview dialog).
- **Honest about what is simulated.** The preview is labelled as a simulation. Sample data is labelled.
- **Motion explains state.** Panels slide in from the right (320ms, decelerating) and leave faster (200ms). Reduced motion becomes a fade.

## Colour
| Token | Light | Dark | Use |
|---|---|---|---|
| `bg` / `surface` | #ffffff | #12100e / #1c1916 | page, cards |
| `sand` | #f4f2ea | #27221e | bands, rails |
| `ink` / `ink-strong` / `ink-muted` | #444444 / #2b2926 / #6f6963 | #e7e2da / #faf7f2 / #a8a097 | text |
| `accent` / `accent-hover` / `accent-text` | #c74504 / #a93a03 / #a93a03 | same / #dd5211 / #ff8a5c | fills; orange text on light grounds always uses `accent-text` |
| `hairline` / `hairline-strong` | #e8ddc8 / #d6c7ab | #302a25 / #453d35 | dividers and decorative borders |
| `control-border` | #8a7f6e | #7d7266 | outlines of text fields, selects, textareas (3:1 or better) |

Status colours (success, warning, danger, info) each have a `-soft` tint for backgrounds. Every text pairing is checked against WCAG AA 4.5:1, and field outlines against 3:1, by `src/styles/contrast.test.ts`, which reads this file's real values.

## The AEM preview skin
Inside `.aem-skin` the tokens are re-pointed to an imitation of AEM's Touch UI dialogs: blue accent, 32px controls, 4px corners, grey tab strip. It is an imitation for the simulated preview, not Adobe's CSS, and it stays light in dark mode, like AEM.

## Rules that are enforced
- One filled primary button per view (apart from the closing band).
- No kicker above a heading; no gradient text; no decorative glow.
- Orange never used as text on light grounds except `accent-text`.
- No `data:` fonts, no inline scripts, no third-party requests (see `vercel.json`).
