# To do: matching Figma exactly

Last updated 2026-11-11, after reading plugin 1.3.0 and adding the position check. Newest first within each group. Numbers are from the Rayna UI export (495 components) with plugin 1.3.0.

## Where things stand
| Fidelity check | Held |
|---|---|
| Size | 98.8% |
| Position (new, from `box`) | 94.0% (716 layers off) |
| Colour | 98.9% |
| Order | 96.4% |
| Layer is drawn | 97.8% |
| Components that pass every comparison | 440 of 495 |

The check lives in the Preview tab ("Check against the design"). It does not see pictures, hover and other states, shadows, blend modes, rotation, or fonts.

## Next, in this order
1. **Draw pictures.** The 1.3.0 export has them: `fills[].image` (hash, file, size) and the files in `assets/images/*.png` (9.4 MB for Rayna; the folder picker already lists them). Needs: read the referenced files for the components being imported, keep them with the component (as data, per project), draw them as backgrounds in the preview, keep placeholders in the generated HTL (authors pick pictures in AEM). The import report still says pictures are "not drawn yet". Check the size limit on what is stored per project.
2. **Footers: a group's vectors are about 38px off** (`Frame 1618868158/Frame 1618868157/Group 1619/Vector[n]`, variant "One"). The group sits in a frame; its offset is not what I assumed. Look at the frame's layout and the group's box.
3. **Pagination list: 40px off** in the variant "arrow - style: outlined, size: small, shape: square" (design x 40, here 80). Looks like an item that the design has hidden or removed and the markup still shows. Same area: Pagination (38 differences).
4. **The remaining "same name" components:** Media Icons/Country (300), Empty State (107), Avatars verified tick (36), file type, Social icons. Layers with the same name in different numbers across variants. `layerId` fixes the layers a variant *changes*, but `removed` and `added[].parentPath` are still name paths. Ask the plugin for ids there too (see below).
5. **Look at the rest of the list the check gives**, biggest first: Navigation (93), Activity Feed Content (86), Tool tip (60, none of them position), Message bubbles (47, mostly the verified tick again), Radar Chart, Metrics Card (26), Avatar Groups (19), Sidebar / menu item, X-axis.
6. **Click through the Preview-tab panel in the real app.** It is built and the check logic is tested through a throwaway page, but the panel itself has no test and I have not seen its layout. Check the table, the variants-drawn line, and a component without layers.

## Plugin side (for the plugin repo)
- `removed` and `added[].parentPath` by layer id, not by name path (needed for item 4).
- Fonts: `metadata.fonts` is in the export; Aemora does not use it yet (load what it can, list the ones that fall back).
- Spacing and size tokens: parked, see `docs/tokens-in-markup.md`. Needs answers from you first.
- Spec and status: `docs/designmd-exact-fidelity.md` (has a status table for 1.3.0).

## Figma API route
- **Run the Preview-tab check on a few Rayna components through the Figma API tab** once the API limit resets, and fix what differs. Everything on that route was written and unit-tested against fake Figma data only: reorder detection, reverse stacking, min/max sizes, vertical text alignment, the same-name warning.
- Still not on that route: pictures, smooth corners, whole-file vector shapes.

## Smaller things
- `effectiveOpacity` (7 layers) is read as known but not applied.
- Smooth (squircle) corners and layout grids are not drawn; the import report says so.
- The pointer-order guess by option name (right/bottom) is still in the CSS for exports with no `reordered`. 1.3.0 exports have it, so the guess does not run for them. Remove it when old exports no longer matter.
- Interaction states (hover, focus, disabled) are not drawn by the check. Add them (draw with the state class, compare to the variant's box and colours).
- Radial gradients are drawn only when the export gives centre and radii (1.3.0 gives none; Rayna has only linear ones).
- The throwaway page used to run the check over a whole export was deleted. If this is needed again (it will be), keep a version in the repo, next to `scratch-harness.html`, so it does not have to be rewritten. It needs the export folder served with CORS headers.

## Parked
- Design tokens in the generated markup (`docs/tokens-in-markup.md`): proposal and six questions for you to answer first.

## How to pick up
1. `git pull`, `npm run dev`.
2. To measure a whole export: serve its folder over http with CORS, open a page that imports each `components/*.json` with `importDesignMd`, runs `generateMarkup` and `checkFidelity` (src/features/fidelity/check.ts), and totals the results. (`scratch-harness.html` has the older size-only measuring functions.)
3. Start with item 1 above.
