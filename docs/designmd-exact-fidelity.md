# Making generated components match Figma exactly

Status: proposal. Part 1 is about what DesignMD must export. Part 2 is what Aemora does with it.

## Where things stand
Measured in Chrome on the 500-component Rayna export, comparing the size of every layer with the size Figma recorded: **97.5% of layers match, 462 of 495 components match on every layer.** Layer presence, layout, spacing, fills, text styles, per-variant looks and interaction states are reproduced from the export.

What is still wrong cannot be fixed in Aemora, because the export does not contain it:

| Missing from the export | Effect | Share of the Rayna export |
|---|---|---|
| Shapes of vectors, icons, logos, illustrations | Shown as grey boxes | 930 of 3,667 layers (25%) |
| Position (x, y) of children in frames without auto layout, and of "absolute" children | Children are stacked instead of placed | 54 of 500 components |
| Pictures (image fills) | Shown as a box | every component with a photo, avatar or thumbnail |
| Gradients (stops, angle), per-side strokes, dashes, blend modes, rotation, clipping | Drawn as a flat fill, a full border, or not at all | smaller, but visible where used |
| Text details: auto-resize, truncation, line limits, italic | Wrong wrapping or length | smaller |
| A picture of what Figma actually draws | No way to check the result against the design | all |

"Exactly" cannot mean identical pixels in every browser: text anti-aliasing and sub-pixel rounding differ. The target is **indistinguishable at 100%, with a measured difference score** that proves it.

## Part 1: what DesignMD should export (all optional, additive within `designmd.components/v1`)

### On every layer
| Field | From the Figma API | Used for |
|---|---|---|
| `position: { x, y }` | `node.x`, `node.y` (relative to the parent) | placing children of free-form frames and groups |
| `layoutPositioning: "AUTO" \| "ABSOLUTE"` | `node.layoutPositioning` | children that ignore the auto layout of their parent |
| `constraints: { horizontal, vertical }` | `node.constraints` | how a placed child follows its parent |
| `rotation` | `node.rotation` | rotated layers |
| `clipsContent` | `node.clipsContent` | `overflow: hidden` |
| `blendMode` | `node.blendMode` | `mix-blend-mode` |
| `minWidth`, `maxWidth`, `minHeight`, `maxHeight` | same names | limits on hugging and filling layers |
| `layoutGrow`, `layoutAlign` | same names | exact fill and stretch behavior |

### Paints and strokes
- Gradients: `{ type, stops: [{ position, hex, alpha }], angle }` (or the transform matrix).
- Images: `{ type: "IMAGE", imageHash, scaleMode, rotation }`, with the pixels in a top-level `assets` map (below).
- Strokes: `sides: { top, right, bottom, left }` weights, `dash: number[]`, `cap`, `join`.

### The shape of anything drawn: `graphic`
For `VECTOR`, `BOOLEAN_OPERATION`, `STAR`, `POLYGON`, `LINE`, and for icon or logo instances: `graphic: { svg: "<svg …>" }` from `node.exportAsync({ format: "SVG_STRING" })`. This is the single biggest step: it turns 25% of layers from grey boxes into the real artwork. Rules: one SVG per layer, `<svg>` only (no scripts, no external references), a size cap per layer with a warning above it, and a switch in the export step ("Include icon and vector shapes").

### Pictures: `assets`
Top-level `assets: { "<hash>": { mime, width, height, data } }` for image fills, PNG or JPEG as base64, behind a switch ("Include images", off by default because of size) with a size cap and a `ASSET_TOO_LARGE` warning.

### Text
`autoResize` (`NONE`, `WIDTH_AND_HEIGHT`, `HEIGHT`, `TRUNCATE`), `maxLines`, `paragraphSpacing`, `paragraphIndent`, `fontStyle` (italic), `fontPostScriptName`.

### Fonts: `metadata.fonts`
`[{ family, style, weight, postScriptName }]` for every font the components use, so a tool knows what to load.

### A reference picture of what Figma draws: `reference`
Per component, per variant: a PNG at 2x from `node.exportAsync({ format: "PNG", constraint: { type: "SCALE", value: 2 } })`, stored next to the JSON (`components/<name>.reference/<variant>.png`) and listed in the index with its hash. Switch: "Include reference pictures". This is what makes "exact" provable instead of claimed.

## Part 2: what Aemora does with it
1. **Place layers by their coordinates** when the parent has no auto layout or the child is absolute (`position: absolute` with `left/top`, constraints respected), plus rotation, clipping, blend mode and min/max sizes.
2. **Draw the real artwork**: inline SVG in the generated HTL and in the preview (sanitized to a small allowed set of SVG elements and attributes), colored through `currentColor` where the design uses one fill so the CSS can recolor it by state.
3. **Gradients, per-side and dashed strokes, images** in the CSS. Images become placeholders by default in the HTL (authors choose pictures in AEM) and the real picture in the preview.
4. **Load the design's fonts** where Aemora can (Inter is already bundled), and say which fonts fall back.
5. **Show Figma next to the result, with a difference score.** The preview shows the reference picture beside the generated one, and a difference overlay with a number (share of pixels that differ). The measuring tool used for this report runs in CI the same way, so a fidelity regression fails the build.

## What this will not do
- Match text rendering and sub-pixel rounding to the pixel. Browsers and Figma differ.
- Reproduce every effect (some blend modes, stacked effects, vector networks) beyond a close approximation. Those are listed in the notes, not hidden.
- Replace the author's own pictures in AEM. Images stay placeholders in the generated markup.

## Suggested order
1. `graphic.svg` and `position`/`layoutPositioning`/`rotation`/`clipsContent` (closes most of the visible gap).
2. `reference` pictures plus the difference score in Aemora (proves it, and finds what is left).
3. Gradients, side strokes, text details, images, fonts.
