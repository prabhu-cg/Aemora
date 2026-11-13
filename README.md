# Aemora

**Generate. Build. Scale.**

Aemora turns a design component into a complete **AEM as a Cloud Service** authoring dialog (mapped to Granite UI fields, arranged in tabs and sections, previewed, and written out as XML) and into the **HTL, CSS and Sling Model** that match it. It is deterministic (the same input always gives the same XML), runs entirely in the browser, and has no backend, no account, and no AI.

Live: https://aemora.vercel.app

> **Not yet tested on a running AEM instance.** The XML follows Granite UI and Coral conventions and passes Aemora's structural checks, and the markup is checked against the design, but nobody has deployed any of it to a Cloud Service environment yet. Follow [docs/verifying-on-aem.md](docs/verifying-on-aem.md) before relying on it.
>
> What each AEM choice rests on, and how much of it was actually confirmed against Adobe, Apache Sling and the HTL specification, is in [docs/references.md](docs/references.md).

## What it does

1. **Bring in a design:**
   - **DesignMD:** the export of the DesignMD Figma plugin (`designmd.components/v1`, [spec](docs/designmd-components-v1.md)), as one file or a whole export folder. It carries the properties and the full layer structure: layout, colors, text styles, every variant and state. Components used inside others are filled in from the same file.
   - **Figma API:** a file, or one component by link. It reads the properties, variants and states, and the layers too (layout, colors, gradients, strokes, positions, drawn icons). Optional preview pictures. See [docs](docs/figma-plugin-interface.md).
   - **Screenshot:** annotate an image by hand. This gives a dialog but no markup, because there are no layers to read.
   - **Hidden for now (the code stays):** component JSON ([format](docs/component-json.md), [schema](public/schemas/aemora-components-v1.json)), clipboard text ([format](docs/clipboard-format.md)) and the planned Aemora Figma plugin. Set `INPUT_TAB_FLAGS.text` in `src/features/inputs/ui/InputPanel.tsx` to show JSON and Clipboard again, and `SHOW_PLUGIN_TAB` for the plugin.
2. **Review the properties:** rename, retype, defaults, allowed values, grouping. Anything Aemora cannot map is kept and flagged, never dropped. Interaction states (hover, focus, disabled) are not made into fields, because the CSS styles them.
3. **Map to AEM fields:** a fixed rule table suggests one of 14 Granite field types for each property. Every suggestion can be changed. **Show only when** rules, which show a field while a checkbox is checked or a select has a value, are suggested from the design itself (a field made from a layer that a yes/no property switches) or from matching names, and are applied on request. Both ways in behave the same.
4. **Arrange the dialog:** tabs, sections, drag and drop, fields left out without being deleted.
5. **Preview:** the **Component** preview (the default) draws the generated HTL and CSS with sample values you choose, in default, hover, active and disabled, at several zooms and on a dark background. The **Dialog** preview is an interactive, AEM-style simulation of the dialog. Both are simulations, not AEM. A field left out of the dialog has no sample control in the Component preview.
6. **Markup:** HTL, CSS, a Sling Model and the component definition, generated from the design's layers. Options become modifier classes, layers that only exist in some looks or states are in the markup and shown by the CSS, and a guess is made only where the export does not say, and then it is listed in the notes. The Preview tab has a check that draws every option and compares each layer with the design. Hand edits are kept and flagged when the design changes. See [docs/plan-htl-markup.md](docs/plan-htl-markup.md) and, for what the plugin needs to export to make the match exact, [docs/designmd-exact-fidelity.md](docs/designmd-exact-fidelity.md).
7. **XML:** complete dialog XML, an editor, and three separate checks (syntax, Aemora's own model, static AEM structure).
8. **Export and back up:** one XML file, a ZIP laid out like an AEM project, the project JSON, restore points kept in the browser, backup files.

A read-only **sample project** (`/#/app/sample`) shows a finished one.

## Develop

Needs Node 22 or newer.

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # vitest, jsdom
npm run lint
npm run typecheck
npm run build        # static site in dist/
npm run serve:dist   # serve dist/ with the production security headers, http://localhost:4173
npm run schema       # regenerate public/schemas/aemora-components-v1.json
```

Stack: React, TypeScript, Vite, Tailwind CSS, Dexie (IndexedDB), Zod, dnd-kit, React Router (hash routes). No XML library: the serializer is small and tested, and parsing and checks use the browser's built-in XML parser.

## Layout of the code

```
src/features/
  inputs/      adapters (designmd, figma, screenshot; json, clipboard and plugin are hidden) -> one component model
  components/  the canonical model, detection, inspector UI
  mapping/     field catalogue, deterministic engine, field node builder, validation
  dialog/      tabs, sections, layout operations
  markup/      layers -> structure (options, looks, states) -> HTL, CSS, Sling Model, component XML
  preview/     the simulated dialog and the component preview (HTL rendered with sample values)
  xml/         node tree, serializer, three validation layers, editor
  export/      per-component export and the ZIP bundle
  backup/      restore points
  projects/    versioned project schema, IndexedDB storage, import and export
  sample/      the built-in read-only project
src/marketing/ landing page
```

The mapping engine, XML generator, markup generator and validators are separate, pure modules with no UI in them.

## Deploy

Aemora is a static site. There is no server, no database and no environment variable. Build output is `dist/`, and every address is a hash route (`/#/app`), so no rewrite rules are needed.

**Vercel** (what the live site uses): import the repository. `vercel.json` sets the framework, output folder and security headers. Production deployments from `main` are public at the project's short address. Per-deployment URLs sit behind Vercel's login unless Deployment Protection is relaxed in the project settings.

**Cloudflare Pages:** build command `npm run build`, output directory `dist`. Cloudflare ignores `vercel.json`, so add the headers from it in a `_headers` file (copy the values from `vercel.json`).

**GitHub Pages:** build with `npm run build` and publish `dist/`. Assets use relative paths, so a project site at `/<repo>/` works. GitHub Pages cannot set headers, so the Content-Security-Policy does not apply there. The app works without it; it is defence in depth.

### Security headers

`vercel.json` sets a strict Content-Security-Policy: scripts only from the site itself (no inline, no `eval`), network access only to the site, `api.figma.com` and Figma's image storage, no framing, no plugins. `npm run serve:dist` applies the same headers locally, and `CSP_REPORT=1 npm run serve:dist` prints any violation the browser reports, which is how the policy was checked against the running app. Tests in `src/security.test.ts` keep the policy, `index.html` and the source from drifting apart.

## Privacy

Everything runs in your browser. Projects are stored in IndexedDB on your machine. There is no analytics. The only network calls are the ones you ask for: reading a Figma file (and rendering previews) sends your Figma token to `api.figma.com`. The token is held in memory for the session, never written to storage, a project, an export or a log.

## Testing

More than 800 automated tests: the mapping engine, node tree and XML, all three validators, the markup generators (with golden files, and a check that every variant and state of the real Rayna UI components shows the layers Figma has), every input adapter (Figma against recorded responses and hand-built node data), import/export round trips, restore points, the interface for every view, keyboard behaviour, colour contrast computed from the real design tokens, automated accessibility checks (axe) on every screen, and security guards. The ZIP export was also checked with the system `unzip` and every generated dialog with `xmllint`.

What automation cannot tell you: whether the dialogs and markup work in AEM (see above), how closely the CSS matches Figma pixel for pixel (the checks compare which layers show, and the styles come from the design's data), whether the live Figma API accepts requests from your browser exactly as the tests assume, and how the tool feels with a screen reader.

## Design

Tokens and tone come from the SiteNest design system: white paper on a pale butter desk, butter hairlines, one amber accent, Newsreader and DM Sans. See [DESIGN.md](DESIGN.md) and [PRODUCT.md](PRODUCT.md).
