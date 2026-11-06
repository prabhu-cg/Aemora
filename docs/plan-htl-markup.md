# Plan: HTL markup, package bar and export

Goal: take the JSON from a Figma plugin and produce an AEM component package (HTL, CSS, Sling Model, dialog) that installs directly in AEM. No AI. Stencil is optional and later.

## Starting point
- `ComponentDef` has properties, children and a free-form `meta` record. It has no layout, style or token data.
- `src/features/export/bundle.ts` builds the dialog XML. The ZIP holds the dialog plus the show/hide clientlib.
- Tabs live in `ComponentWorkspace.tsx`. The XML tab (generate, edit, store) is the pattern to copy for the Markup tab.

## Decision: plain HTL by default, Stencil optional
AEM already renders on the server. HTL plus CSS gives fast first paint, works with the AEM editor overlays, needs no JS runtime, and is easy to read and edit. Stencil is worth it only when components are shared with non-AEM apps or the design system team already ships a Stencil library. If needed, export Stencil source as an option (Phase 4).

## Phase 0: Input contract
Needs a sample of the real plugin JSON.
- Add an optional `design` block per component: layout (direction, gap, padding, alignment), fills, text styles, radius, tokens, and a role per layer (heading, text, image, button or link, slot).
- Update `aemora.plugin/v1`, the JSON schema (`scripts/gen-schema.ts`), `docs/figma-plugin-interface.md` and `src/features/inputs/plugin.ts`.
- Show the detected layout on the review screen.
- Done when: the real plugin JSON imports with no data loss, and sample files with layout are added.

## Phase 1: Markup generators (no UI)
Pure functions with tests, like the XML builder.
- HTL (`<name>.html`): elements by role, `${properties.x}` or Sling Model bindings, `data-sly-test` for show/hide and empty states.
- CSS: BEM-style classes from a project prefix, CSS custom properties for tokens.
- Sling Model: one Java class per component, `@ValueMapValue` fields, configurable package.
- Component `.content.xml`: title, group, basic `cq:editConfig`.
- Done when: golden-file tests pass for the samples and the HTL passes a parse check.

## Phase 2: Markup tab and component preview
- Markup tab with a switch for HTL, CSS, Sling Model and `.content.xml`. Files are editable, flagged "edited", with Regenerate.
- Notes panel: what was inferred or skipped, and which Figma layer produced each element.
- Preview tab toggle, Dialog or Component. Renders the generated HTL and CSS with sample values in a sandboxed iframe, next to the Figma preview image. Needs a small in-browser HTL renderer covering only what the generator emits.
- Tab order: Properties, AEM fields, Dialog, Markup, Preview, XML. Tabs scroll horizontally, with an edge fade, the active tab kept in view, and arrow-key navigation.
- Done when: a component imports, shows its markup and renders close to the design.

## Phase 3: Package bar and export
- Package bar above the tabs: status from all validators, the first blocking problem linking to its tab, and a Download package button.
- Project settings: AEM project name, component group, Java package, CSS prefix.
- ZIP layout: `jcr_root/apps/<project>/components/<name>/` with `.content.xml`, `<name>.html`, `_cq_dialog` and clientlib folders; Sling Models under `core/src/main/java/...`; `filter.xml` and `META-INF/vault` so it installs from Package Manager.
- Export panel options: include HTL and CSS, the Sling Model, and the show/hide clientlib.
- Extend export and ZIP tests; add a section to `docs/verifying-on-aem.md`.
- Done when: the ZIP installs on AEM and the component appears in the editor with a working dialog.

## Phase 4: Hardening
- Accessibility (axe) tests, keyboard behaviour and read-only sample support for the new UI.
- Update README, PRODUCT.md and DESIGN.md.
- Handle nested components, repeated layers and missing roles.
- Optional: Stencil source export as an export-panel switch.

## Order
0 and 1 first. Then 3 for a usable download, then 2 for editing and preview. Phase 4 runs alongside each.
