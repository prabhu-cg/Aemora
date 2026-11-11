# Spec for the DesignMD plugin: what Aemora needs to match Figma exactly

Status: requirements for the DesignMD plugin (`Figma-plugins/DesignMD`), written from Aemora's side. Everything here is additive within `designmd.components/v1`. This replaces the earlier proposal in this file.

## Why this exists
Aemora turns a component's layers into HTL and CSS. The result has to look and behave like the Figma component, in every variant. Aemora can only be as exact as the export. These are the ways the export falls short today, found by checking the Rayna UI file (495 components, 2,581 variants) with Aemora's fidelity check (Preview tab, "Check against the design").

Measured with plugin 1.2.1 and the current Aemora:

| Compared | Held |
|---|---|
| Size of each layer | 98.7% |
| Colour of each layer | 98.8% |
| Order of items in each row or column | 96.6% |
| Layer is drawn when the design shows it | 97.8% |
| Components where every comparison holds | 440 of 495 |

These numbers say less than they look like. The check compares what the export says with what Aemora draws. It cannot find what the export does not say. The requirements below are those gaps.

## Status after plugin 1.3.0 (checked 2026-11-11 against the Rayna export)
Plugin 1.3.0 delivers most of this spec, and Aemora reads it:

| Requirement | In 1.3.0 | Aemora |
|---|---|---|
| 1. `box` per layer, per variant | Yes (every layer, and in changes) | Used to place layers and to check positions (fidelity check, "Position") |
| 2. `added[].index` | Yes | Used. It counts the layers the variant keeps, not the ones it removes |
| 3. `reordered` | Yes (on every diff) | Used for the `order` rules in the CSS |
| 4. `layerId` on changes | Yes | Used to find the layer by id. `AMBIGUOUS_SIBLINGS` is not seen in the Rayna export, so name paths still decide for `removed` and `added` |
| 5. Gradient stops | Yes (`stops`, `angle`) | Drawn |
| 6. `maxLines`, `truncation`, `leadingTrim` | Yes | Written as CSS |
| 7. `metadata.fonts` | Yes | Not used yet |
| 8. Pictures (`includeImages`, `assets/images/*.png`, `fills[].image`) | Yes | **Not drawn yet** |
| 9. Spacing and size tokens | No | Parked (`tokens-in-markup.md`) |

With 1.3.0, the fidelity check finds position differences it could not see before (about 6% of layers). They are being worked through; the ones found so far were in Aemora (variant resets of gap and padding, the place of added layers, group offsets), not in the export.

## What the export already gives (do not change)
Layer tree per default variant, `variantDiffs` per other variant, `size`, `layout` (including `reverseZIndex`), `placement` (`sizingH`, `sizingV`, `grow`, `align`, `positioning`), `position` for layers placed by coordinates, `rotation`, `clipsContent`, `vector` shapes, fills and strokes with tokens, `text` (including `autoResize`, `alignVertical`), `instanceOf` with `properties`, `propertyRefs`, `sizeLimits`, `cornerSmoothing`, `constraints`. Aemora reads all of these except where the table at the end says otherwise.

## Requirements
Priority 1 is what is needed to verify and to stop guessing. Priority 2 improves the result. Priority 3 is optional.

### 1. (Priority 1) The box of every layer, in every variant
The one change that lets Aemora prove a variant is right, with numbers.

On every layer of the default tree and in every `variantDiffs[].layers[].changes` where it differs from the default:
```json
"box": { "x": 12, "y": 8, "width": 37, "height": 20 }
```
- `x`, `y`: position of the layer's own layout box relative to the root of **that variant**, in px. From the layer's absolute transform minus the root's. For a rotated layer this is where its unrotated box sits (the same origin `rotation` turns about).
- `width`, `height`: the layer's own width and height (the same as `size`; repeated so a box is one value).
- Hidden layers (`visible: false`) are included, so a consumer can tell "hidden" from "missing".
- A variant's change set includes `box` for every layer whose box differs from the default. Layers whose box is the same are left out, as with every other attribute.

Why: the bugs found so far (a pointer on the wrong side, an icon in the wrong place, a layer pushed out by an overlap, items in the wrong order) are all about where things are. Sizes alone did not show them.

Cost: numbers read from nodes the plugin already visits. No image export, no extra Figma calls.

### 2. (Priority 1) Say where a variant puts the layers it adds
`variantDiffs[].added[]` must carry `index`: the position of the layer among its siblings **in that variant**. It is optional in the schema today and is not written. Without it Aemora guesses (it puts the new layer where a removed sibling was), which is right for the banner Alert and wrong whenever a layer is added without one going.

### 3. (Priority 1) Say when a variant reorders layers
A variant can put the same layers in a different order. The tooltip's pointer is first in the default and last when the pointer is on the right or bottom. A diff holds attribute changes by name path, so this is not in the export at all, and Aemora can only guess from option names.

Add to a variant diff, for each parent whose children are in a different order from the default:
```json
"reordered": [ { "parentPath": "Tool tip", "order": ["Tool tip/Container", "Tool tip/pointer"] } ]
```
`order` lists the paths of **all** children of that parent, first to last, as drawn in the variant (hidden layers included).

### 4. (Priority 1) Identify layers across variants without relying on names
Layers are matched across variants by name path (`Media Icons/Country/Vector[2]`). When two variants have different numbers of layers with the same name, the index points at different layers, and the diff changes the wrong one. This is where most of the 55 failing Rayna components fail: flags and icons made of several layers named `Vector`.

- Each entry in `layers[]` gets `layerId`: the id of the layer it changes **in the default variant**. The plugin knows this at the moment it builds the diff.
- Where same-named siblings differ in number between a variant and the default, so a match is a guess, emit the warning `AMBIGUOUS_SIBLINGS` (component id, variant id, parent path) instead of silently choosing.
- A layer that exists only in a variant is in `added` (no `layerId`), as today.

### 5. (Priority 2) Gradients with their stops
A gradient paint is only `{ "type": "GRADIENT_LINEAR", "description": ... }` today, so Aemora draws it flat. Write:
```json
{ "type": "GRADIENT_LINEAR", "visible": true, "opacity": 1,
  "stops": [ { "position": 0, "hex": "#ffffff", "alpha": 1 }, { "position": 1, "hex": "#eb5017", "alpha": 0.2 } ],
  "angle": 135 }
```
- Linear: `angle` is the CSS angle in degrees (0 is up, clockwise), worked out from the paint's `gradientTransform`.
- Radial: `center: { x, y }` and `radii: { x, y }` as fractions of the layer's box.
- `stops[].position` is 0 to 1 along the gradient line. Angular and diamond gradients: keep `type` and say so in a warning.

(Aemora's `layers.ts` already has this shape in `Gradient`, so no mapping is needed on the Aemora side.)

### 6. (Priority 2) Text details that change wrapping
Already there: `autoResize`, `alignVertical`, `paragraphSpacing`. Add:
- `maxLines` (number or null) and `truncation` (`"ENDING"` or `"NONE"`), for text that is cut with an ellipsis.
- `leadingTrim` (`"CAP_HEIGHT"` or `"NONE"`), because it changes the height of a text box.

### 7. (Priority 2) The fonts the design uses
`metadata.fonts`: `[ { "family": "Inter", "style": "Semi Bold", "weight": 600, "italic": false, "postScriptName": "Inter-SemiBold" } ]` for every font used in the exported components, so a tool knows what to load and what falls back.

### 8. (Priority 3) Pictures
`includeImages` exists. When it is on, write `assets: { "<imageHash>": { mime, width, height, data } }` (base64), with a size cap per picture and the warning `ASSET_TOO_LARGE`. Aemora will read this when it is present. It stays off by default because of size.

### 9. (Priority 3) Spacing and size tokens
Where a variable is bound to a gap, a padding side, a radius or a width, write its reference next to the number, the way fills already do:
```json
"layout": { "gap": 8, "padding": {...}, "token": { "gap": { "variableId": "VariableID:1:2", "cssName": "--space-2" } } }
```
Aemora would then write `gap: var(--space-2)` instead of `8px`, so a theme can change spacing. This does not change how a component looks. Rayna defines no spacing variables, so it would not show there, but other design systems do.

## What the plugin should not do
- **No reference pictures (PNG per variant).** Rayna has 2,581 variants. Exporting each is minutes of work and hundreds of MB, and a pixel difference is noisy because browsers do not render text like Figma. The boxes in requirement 1 find the same layout bugs, in numbers.
- Aemora can fetch a picture of a **single variant** itself when someone wants to look: it already has the file key and token, and every variant's node id is in the export. That is an on-demand check in Aemora, not a plugin feature.

## Limits
- Added `box`, `index`, `layerId`, `reordered`, gradients, text details and `metadata.fonts` together should stay under a 30% increase in `components.json` size for the Rayna file, and under a 15% increase in export time. Report the real numbers in the plugin README.
- Interaction states (hover, focus, disabled) are described like any other variant, with their `box` too.
- Whole-file exports keep the rules in `designmd-components-v1.md`: per-component isolation, progress, cancel, split above 20 MB.

## Acceptance
For each of these Rayna components, an export with the changes above, read by Aemora, must give **zero** differences in the fidelity check, in every variant: Tab, Tool tip, Alert, Calendar, Avatars, Media Icons/Country, Misc icon, Pagination, Empty State.

Aemora's check, once `box` is in the export, compares for every layer in every variant:
- `x`, `y`, `width` and `height` of the rendered layer against `box`, within 1.5 px, relative to the root;
- the order of siblings against the variant's children (with `reordered` applied);
- the colour of the top solid fill;
- that a layer the design shows is drawn.

Plugin tests (in its repo):
- a golden export for a component set with a reordering variant (the tooltip), an added layer, and two same-named siblings that differ in count;
- every `box` equals the node's `absoluteTransform` relative to the root, for default and variants;
- `reordered` is present only where the order differs;
- the export validates against the published JSON schema, which gains these fields;
- a whole-file run on Rayna, with the size and time increase recorded.

## What Aemora does on its side
| Plugin gives | Aemora does |
|---|---|
| `box` | Compares position and size of every layer in every variant in the fidelity check, and shows differences by layer and variant. |
| `added[].index`, `reordered` | Uses them, and drops its name-based guesses. A guess is kept only when the export has nothing, and is said in the import report. |
| `layerId` | Matches layers across variants by id instead of by name path. Without it, it keeps name paths and says which components are ambiguous. |
| Gradient `stops` | Draws gradients in the CSS. |
| `maxLines`, `truncation`, `leadingTrim` | Writes the matching CSS. |
| `metadata.fonts` | Loads the fonts it can and lists the ones that fall back. |
| `assets` | Shows pictures in the preview, keeps placeholders in the generated HTL (authors choose pictures in AEM). |
| Token references on spacing | Writes `var(...)` with the literal value as the fallback. |
| Anything unknown | Lists it in the import report as a field it does not read, so a plugin change cannot be silently ignored. |

## Aemora features already done that this builds on
- Fidelity check in the Preview tab (`src/features/fidelity`), and the import report of what is not applied (`src/features/inputs/designmd/coverage.ts`).
- Adapter that renames `vector`, `placement`, `rotation` and infers positions, added-layer places and per-option drawings (`src/features/inputs/designmd/vectors.ts`).
