# Design tokens in the generated markup (parked)

Status: **parked**, 2026-11-11. Nothing here is built. This records the proposal and the questions that need an answer before work starts.

## The want
The generated CSS should refer to the design's tokens (colours, text styles, shadows, and later spacing, radius and sizes) instead of raw values, so that a theme can change them in one place.

## What happens today
- **Colours:** when a fill or stroke is bound to a token, the CSS writes `var(--grey-700, #344054)`. Nothing defines `--grey-700`: Aemora does not ship a tokens file, so the raw fallback is what renders.
- **Text styles and shadows:** the DesignMD export carries them as tokens (`typography`, `shadow`), but the CSS ignores the token and writes raw `font-size`, `font-weight`, `line-height`, `box-shadow`.
- **Spacing, radius, sizes:** always raw numbers. The export has no reference for them.
- **Rayna UI is mostly unbound in Figma itself.** In the 500-component export only 96 of 2,891 fills (3%), 2 of 446 strokes, 76 of 571 text layers and 8 effects point at a token, and its `tokens.json` has no spacing variables (`spacing` is empty). Aemora cannot use a token the file never bound.
- The export's `tokens` (colour 42, typography 8, shadow 5 for Rayna) and `tokens.css` already hold names and values. `tokens.css` writes a text style as separate variables, for example `--paragraph-small-semibold-font-size`.

## Proposal
Everything on the DesignMD route is Aemora-side work except item 5.

1. **Ship the tokens with the component.** Write a `tokens.css` (only the tokens the exported components use, as `:root { --grey-700: #344054; }`) into the ZIP export, so the `var()` references resolve.
2. **Use tokens wherever the design binds one.** Fills and strokes, text styles (`font-size: var(--paragraph-small-semibold-font-size)` and the matching family, weight, line height, letter spacing), and shadows.
3. **A setting for fallbacks.** Default: keep `var(--x, #raw)`, so a component still renders without the tokens file. Option: no fallbacks, for fully token-driven output.
4. **Opt-in "match by value" for unbound values.** Where a raw colour exactly equals a token's value, use that token. It is marked as matched by value in the notes, because two tokens can share a value and only the designer knows the intent. Off by default.
5. **Spacing, radius and sizes** need the plugin: item 9 of `designmd-exact-fidelity.md` (a token reference next to each number: `layout.token.gap`, padding sides, radius, width/height). Aemora would then write `gap: var(--space-2, 8px)`. It only helps designs that define spacing variables, which Rayna does not.

## Figma API route
More limited, and what follows is from knowledge of the Figma API, not tested here:
- A node says which **style** a fill, text or effect uses, and the file response has the style names, so token names can be derived from styles (kebab-cased name). Values come from the node itself.
- A node only gives the **id of a bound variable**. Names and values of variables need the Variables API, which Figma limits to Enterprise plans. Without that, variable-based spacing, radius and colour tokens are not available on this route.
- So on this route: styles for colours, text and effects, plus the value matching of item 4. Spacing, radius and size tokens only with Enterprise access.

## Questions to answer before starting
1. **Fallbacks:** should `var(--x, #raw)` stay the default, with "no fallbacks" as an option? Or should output be token-only by default? (Token-only breaks a component on any page that does not load `tokens.css`.)
2. **Match by value:** is it worth having, given that Rayna is mostly unbound? Or should unbound values stay raw and be reported (so the designer binds them in Figma)?
3. **Figma plan:** is the Figma account on an Enterprise plan? It decides whether the API route can read variables.
4. **Where tokens live in AEM:** should `tokens.css` ship inside each component's clientlib, or once per project (one shared file that every component refers to)? A shared file is the usual design-system setup; per-component is simpler to drop in.
5. **Naming:** keep the plugin's token names (`--grey-700`) as they are, or add a project prefix (`--aem-grey-700`) to avoid clashing with a site's own variables?
6. **Other design systems:** do you have one with real spacing variables to test with? Without one, item 5 cannot be checked.

## Suggested order when it is picked up
1. Ship `tokens.css`, use tokens for colours, text styles and shadows, add the fallback setting (DesignMD route).
2. Style-based tokens on the API route.
3. Match by value, if wanted.
4. Spacing, radius and sizes once the plugin exports them.

## Related
- `docs/designmd-exact-fidelity.md`: plugin spec; item 9 is spacing and size tokens.
- `docs/designmd-components-v1.md`: the export format, including `tokens`.
