# Spec: `designmd.components/v1` (DesignMD plugin output)

Status: draft for review. Written in the Aemora repo, to be implemented in the DesignMD Figma plugin (`Figma-plugins/DesignMD`), then consumed by Aemora through an adapter.

## Why
DesignMD already exports tokens (`tokens.json`, CSS, SCSS, Tailwind) and per-component Markdown. It has no machine-readable description of components. A tool that wants to generate code, a design-system site or an AI prompt from a component has to parse Markdown tables, and the layers, styles and states are missing from them.

This spec adds one new output, `components.json`, that is:
- **tool-neutral.** Nothing in it is specific to Aemora, AEM or any framework.
- **versioned and schema-checked.** A JSON Schema is published and tested.
- **deterministic.** The same file produces the same bytes. No AI, no network.
- **honest.** Anything inferred is marked as inferred, and anything cut off is flagged.

`tokens.json` remains the one standard token export and the source of full token data. `components.json` describes components and refers to tokens by id and CSS name. The only existing output that goes away is `css-tokens.json` (see "Outputs to remove").

## Envelope
```json
{
  "schema": "designmd.components/v1",
  "metadata": { "fileName": "...", "fileKey": "...", "scope": "file", "generatedAt": "ISO-8601", "pluginVersion": "1.1.0" },
  "index": { "componentCount": 0, "components": [ { "id": "1:2", "name": "Button / primary" } ] },
  "tokens": { "VariableID:1:2": { "cssName": "--color-primary-500", "type": "color", "value": { "hex": "#1252f7", "alpha": 1 } } },
  "components": [],
  "warnings": []
}
```
- `tokens` is a lookup of only the variables and styles the components actually use. Each entry has its `cssName`, type and resolved default-mode value, so `components.json` is self-contained. Full token data, modes and aliases stay in `tokens.json`, and a token's `$extensions.figma` entry there carries the same id.
- `components` extends `ComponentDoc` with the fields below.
- Keys are written in a fixed order and arrays in a stable order (by page, then name), so diffs are small.

## Component
Existing `ComponentDoc` fields are kept: `id`, `key`, `name`, `description`, `isComponentSet`, `pageName`, `variants`, `states`, `sizes`, `relatedComponentNames`, `boundVariableIds`, `styleIds`, `layout`. These are added:

| Field | Type | Notes |
|---|---|---|
| `properties[].key` | string | The raw Figma key, for example `icon#3287:0`. |
| `properties[].name` | string | Cleaned name, for example `icon`. Today the `#id:id` suffix leaks into the name. |
| `properties[].defaultResolved` | `{ id, name }` | For `INSTANCE_SWAP`, the name of the default component. Today only the node id is given. |
| `properties[].preferredValues` | array | Figma's preferred instances, when set. |
| `defaultVariantId` | string | The variant the `tree` was read from. |
| `tree` | `Layer` | The full layer tree of the default variant. |
| `variantDiffs` | `VariantDiff[]` | Differences of every other variant from the default. |
| `treeTruncated` | boolean | True when the layer or depth budget was hit. |

### Layer
```json
{
  "id": "1:23",
  "name": "Label",
  "type": "TEXT",
  "role": "label",
  "roleSource": "type",
  "visible": true,
  "size": { "width": 37, "height": 20 },
  "layout": { "mode": "HORIZONTAL", "gap": 10, "padding": { "top": 8, "right": 16, "bottom": 8, "left": 16 },
              "primaryAlign": "CENTER", "counterAlign": "CENTER", "sizingH": "HUG", "sizingV": "HUG", "wrap": false },
  "radius": 8,
  "opacity": 1,
  "fills": [ { "type": "SOLID", "hex": "#1252f7", "alpha": 1, "token": { "variableId": "VariableID:1:2", "cssName": "--color-primary-500" } } ],
  "strokes": { "paints": [], "weight": 0, "align": "INSIDE" },
  "effects": [],
  "text": { "characters": "Learn more", "styleId": "S:abc", "fontFamily": "Inter", "fontWeight": 600, "fontSize": 14,
            "lineHeight": { "value": 20, "unit": "px" }, "letterSpacing": { "value": 0, "unit": "px" },
            "textCase": "ORIGINAL", "textDecoration": "NONE", "align": "LEFT" },
  "instanceOf": { "componentId": "3253:139749", "componentName": "icon/arrow-right" },
  "propertyRefs": { "characters": "label#12:0", "visible": "show-icon#12:1", "mainComponent": "icon#3287:0" },
  "children": []
}
```
Rules:
- `type` is the Figma node type (`FRAME`, `TEXT`, `INSTANCE`, `RECTANGLE`, `VECTOR`, `ELLIPSE`, `GROUP`, and so on).
- Every field except `id`, `name`, `type` and `visible` is optional and omitted when it does not apply. `layout` appears only for auto-layout frames, `text` only for text nodes, and `instanceOf` only for instances.
- Radius is a number for uniform corners, or `{ "tl", "tr", "br", "bl" }` when they differ (today mixed corners are dropped).
- Values are plain numbers in px and plain strings. No Figma symbols, no `figma.mixed`. Mixed text styles become an array of runs under `text.runs`, and `text.mixed: true` is set.
- Fills and strokes carry `token` when bound to a variable or style. A gradient or image paint keeps its type and a short description. Image bytes are never exported.
- `propertyRefs` maps a layer attribute to the component property that drives it (`characters`, `visible`, `mainComponent`). This is what tells a generator that "this text is the Label field".

### Roles
`role` is one of: `root`, `container`, `heading`, `text`, `label`, `icon`, `image`, `button`, `link`, `input`, `divider`, `slot`, `unknown`.

`roleSource` says how it was decided, in this priority order:
1. `property`: a component property drives it (a TEXT property gives `label` or `text`, an INSTANCE_SWAP gives `icon` or `slot`).
2. `type`: the node type (an image fill gives `image`, a line gives `divider`).
3. `name`: a layer-name heuristic (`heading`, `title`, `icon`, `cta`).
4. `none`: `role` is `unknown`.

Roles are hints, never facts. A consumer is expected to treat `roleSource: "name"` as lower confidence.

### VariantDiff
Variants share a layer structure, but Figma node ids differ per variant, so diffs match layers by **name path** from the root (for example `Button/Label`).
```json
{
  "variantId": "5:10",
  "variantProperties": { "size": "sm", "state": "hover", "icon-style": "none" },
  "layers": [
    { "path": "Button", "changes": { "fills": [ ... ] } },
    { "path": "Button/Label", "changes": { "visible": false } }
  ],
  "added": [],
  "removed": []
}
```
- `changes` holds only the attributes that differ from the default variant, using the same shapes as `Layer`.
- A layer present in the variant and not in the default is in `added` (as a full `Layer` with its `parentPath`). A layer missing from the variant is in `removed` as a path.
- If two siblings share a name, the path gets an index suffix (`Button/Icon[1]`), and a warning is added.

## Machine-readability rules
These apply to every field in `components.json`. They are the contract that makes the file safe for code generators and AI tools, and each one gets a test.

1. **JSON only, no prose to parse.** Every value is a typed JSON value. Text meant for humans (`description`, `warnings[].message`) is kept separate from values a tool acts on, and a warning also has a stable `code` (for example `TREE_TRUNCATED`) so tools don't match on message text.
2. **Numbers are numbers, units are explicit.** No `"16px"` strings. Lengths are plain numbers in px. Anything that can have another unit uses `{ "value", "unit" }` (line height, letter spacing). Colors are `{ "hex": "#rrggbb", "alpha": 0..1, "r", "g", "b" }`, never 8-digit hex strings, so alpha is never ambiguous.
3. **One type per field.** A field is never a number in one place and a string in another, and never an object-or-array. Where Figma gives either (a shadow can be one or many), the output is always an array.
4. **Closed enums.** Every enum (`type`, `role`, `layout.mode`, `unit`, `warning code`) is listed in the schema with a description. New values are additive within `v1`, so consumers must handle an unknown value.
5. **Absent versus null.** A missing field means "not applicable". `null` means "applies, but no value" (for example a default of `null`). Empty arrays are always written, so `[]` means "none".
6. **Everything has a stable id and cross-references use ids.** Tokens, styles, components and layers carry an `id`. References (`token.variableId`, `instanceOf.componentId`, `styleId`, `propertyRefs`) point at ids, never at names. Names are for display. Every referenced id must exist in the file, or the reference is replaced by its resolved value and a warning with a code is added (this is what the plugin already does for hidden variables). A test checks this.
7. **Provenance on everything.** Each component, variable, style and layer keeps its Figma id (and `key` where Figma gives one), so a tool can map a result back to the design. Inferred values carry `source` (see Roles), and anything the plugin derived rather than read says so.
8. **Resolved and raw values together.** A bound value shows both the resolved value for the default mode and the token reference, so a tool can use the number directly or keep the token. Per-mode values stay in `tokens.json`.
9. **Deterministic bytes.** Fixed key order, stable array order, `\n` line endings, no timestamps except `metadata.generatedAt`, and a `metadata.contentHash` (SHA-256 of the file with `generatedAt` and `contentHash` blanked) so tools can cache and detect changes.
10. **Self-describing.** The file begins with `"$schema": "<url of designmd-components-v1.json>"` and `"schema": "designmd.components/v1"`. The JSON Schema has a `description` on every property, `examples`, and `additionalProperties` rules written down. The same schema validates the examples in the repo in CI.
11. **Big files stay usable.** Above the size threshold the plugin splits into `components.json` (envelope, index and tokens) plus one `components/<name>.json` per component, so an AI tool can load one component at a time. There is no separate streaming format in v1.
12. **An index for tools.** `components.json` starts with `metadata` and a short `index` (counts, and an id and name list per component). A tool can decide what to fetch before reading the large parts.

Existing token files are unchanged, so `tokens.json` keeps its W3C format with unit strings such as `"0px"`. The rules above apply only to the new output.

Optional, not required for v1: a small CLI or script (`npx designmd-validate file.json`) that validates a file against the schema and checks rule 6. It also gives AI-tool authors a way to test their output.

## Options and limits
- New export option `Component structure (components.json)`, off by default like the other token outputs. Sub-options: `Include text content` (default on) and `Include variant diffs` (default on).
- Reuse the existing scan budget (500 layers, 10 levels) per component, and set `treeTruncated` plus a warning when it is hit.
- Variant diffs are skipped when a set has more than 128 variants, with a warning, to keep the output size bounded.
- Show total size in the Files tab. Above about 20 MB, warn and offer to split components into `components/<name>.json` files, with `components.json` holding an index.

## Versioning and compatibility
- Within `v1`, additions are allowed (new optional fields, new roles). Removing or renaming a field, or changing a type, requires `v2`.
- Consumers must ignore fields they don't know.
- Publish `schemas/designmd-components-v1.json` in the repo and as a release asset. Generate it from the TypeScript types (for example with `ts-json-schema-generator`), and check in CI that it is up to date.

## Privacy
Nothing leaves the plugin. The file contains text content, layer names and design values from the user's Figma file, so the UI must say so next to the option, and `Include text content` must be able to turn it off.

## Tests (acceptance)
- Unit tests for the new extraction against the existing fake Figma API: nested frames, instances, text with mixed styles, mixed corners, hidden layers, bound variables and styles, duplicate sibling names.
- Golden file: a fixture component set (for example `Button / primary` from the sample) produces a stable `components.json`. Re-running gives identical output.
- Schema test: every generated file validates against the published schema.
- Truncation test: a deep or huge component sets `treeTruncated` and a warning, and does not throw.
- UI test: the option appears, is remembered, and its output shows up in the Files tab.
- A real-file check on a large community file (for example the Rayna UI file) for time and output size.

## Whole-file scans must not crash
The Scope option includes the whole file, and that is the default case for a design-system file such as the Rayna UI community file (550+ components). This is a requirement for every new feature in this spec, not a later optimisation.
- **Budgets.** Extraction of layers and variant diffs runs inside the existing batching and yielding helpers. A time budget and a memory budget per component are enforced, and a component that exceeds them is written with `treeTruncated: true` and a warning, never skipped silently and never fatal.
- **Isolation.** Every component is extracted inside its own try/catch. A failure produces a `COMPONENT_FAILED` warning with the component name and id, and the scan continues.
- **Progress and cancel.** The UI shows progress (done of total) during the scan and the generate step, and offers Cancel. Cancelling returns the partial result with a warning, not an error.
- **Messages between plugin code and UI.** Large payloads are sent in chunks, because a single huge `postMessage` can fail or freeze the UI. Generation of files and ZIPs runs in the UI side, in batches that yield.
- **Output size.** If the output passes the size threshold, split into per-component files automatically (see rule 11). The Files tab previews only the first lines of large files, as it does now.
- **Partial success.** If one output fails to generate, the others are still offered, and the failure is shown with its reason.
- **Tests.**
  - A synthetic file with 1,000 components, deep nesting and 100 variants per set, run against the fake Figma API, completes within a fixed time and memory limit.
  - A failing component, a throwing property getter and a cancelled scan each give a partial result with warnings.
  - A manual run on the Rayna UI file, with times and output sizes recorded in the README, before release.
- I have not run the current plugin on that file. The README claims 10,000+ variables and 5,000+ components stay responsive, and that should be checked, not assumed.

## Plugin work order
1. Types and JSON Schema (`src/shared/`), with example files in `examples/`.
2. Layer extraction in `src/plugin/extraction/` (a new `layers.ts`), including bindings and property refs.
3. Role inference as a pure function in `src/plugin/transform/` (own tests).
4. Variant diffs.
5. Generator `src/plugin/generators/designSystemJson.ts`, registered in `generators/index.ts` and the export options.
6. UI option, README and docs, `examples/`, and a changelog entry.
7. Remove `css-tokens.json` and `tailwind.tokens.js` (code, tests, UI cards, README).
8. Run the whole-file checks above on the Rayna file and record the results.
9. Also fix the property-name suffix and the raw node id for instance swaps in the existing Markdown.

## Aemora adapter (later, in this repo)
Aemora reads `designmd.components/v1` and maps it like this:

| DesignMD | Aemora |
|---|---|
| `components[]` | components |
| `properties` of type `TEXT` | `string` field, default from the property |
| `properties` of type `BOOLEAN` | `boolean` field |
| `properties` of type `INSTANCE_SWAP` | `image` or icon reference field |
| `properties` of type `VARIANT` | `enum` field (authors choose size, style, icon position). The chosen value becomes a modifier class in the markup. A list of more than 200 options is cut at 200 with a warning. |
| `state` variant made of interaction words (default, hover, focused, disabled) | CSS (`:hover`, `:focus-visible`, `:disabled`), no dialog field |
| `TEXT` layers with no property behind them | suggested string fields, marked as suggested |
| `tree`, `role`, `layout` | HTL structure and CSS |
| `token.cssName` | CSS custom properties |

## Decisions
- **Text content is on by default.** It can be turned off, and the UI says what it includes.
- **File name: `components.json`**, schema `designmd.components/v1`. It describes components only, plus the tokens they use.
- **Aemora keeps its own `aemora.components/v1` input** next to this one, and gets an adapter for `designmd.components/v1`.
- **The plugin stays neutral.** It does not emit an Aemora-specific format.

## Outputs to remove
DesignMD is not yet published, so removing outputs now costs no one anything. After the release it would be a breaking change.
- **Remove `css-tokens.json`.** It repeats `tokens.json` (the same tokens with CSS names and per-mode values) and `tokens.css`. `tokens.json` already carries `cssName` and modes. If the per-mode values are not yet complete in `tokens.json`, add them there first.
- **Remove `tailwind.tokens.js`.** It is derived from the same tokens and only points at the CSS variables in `tokens.css`, so it adds a framework-specific file without adding information. It also targets Tailwind's JS preset style, while newer Tailwind versions configure themes in CSS. Anything that reads `tokens.json` or `tokens.css` can produce it. Document in the README how to use `tokens.css` with Tailwind instead.
- Keep `design.md`, `components/*.md`, `tokens.json`, `tokens.css` and `_tokens.scss`. Each serves a different reader (people, tools, CSS, Sass). `_tokens.scss` is the least used, but it is small and has no overlap. Revisit it after release if nobody uses it.
- Result: Documentation (`design.md`, `components/*.md`), Tokens and code (`tokens.json`, `tokens.css`, `_tokens.scss`), and Components (`components.json`).
