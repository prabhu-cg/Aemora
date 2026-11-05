# Aemora

**Generate. Build. Scale.**

Aemora turns a design component's properties into a complete **AEM as a Cloud Service** authoring dialog: mapped to Granite UI fields, arranged in tabs and sections, previewed, and written out as XML. It is deterministic (the same input always gives the same XML), runs entirely in the browser, and has no backend, no account, and no AI.

Live: https://aemora.vercel.app

> **Not yet tested on a running AEM instance.** The XML follows Granite UI and Coral conventions and passes Aemora's structural checks, but nobody has deployed it to a Cloud Service environment yet. Follow [docs/verifying-on-aem.md](docs/verifying-on-aem.md) before relying on it.

## What it does

1. **Bring in a design:** component JSON ([format](docs/component-json.md), [schema](public/schemas/aemora-components-v1.json)), clipboard text ([format](docs/clipboard-format.md)), the Figma REST API (with optional preview pictures), or a screenshot you annotate by hand. A Figma plugin interface is defined ([docs](docs/figma-plugin-interface.md)) but the plugin is not built, and its tab is hidden.
2. **Review the properties:** rename, retype, defaults, allowed values, grouping. Anything Aemora cannot map is kept and flagged, never dropped.
3. **Map to AEM fields:** a fixed rule table suggests one of 14 Granite field types for each property. Every suggestion can be changed.
4. **Arrange the dialog:** tabs, sections, drag and drop, fields left out without being deleted.
5. **Preview:** an interactive, AEM-style simulation of the dialog. It is a simulation, not AEM.
6. **XML:** complete dialog XML, an editor, and three separate checks (syntax, Aemora's own model, static AEM structure).
7. **Export and back up:** one XML file, a ZIP laid out like an AEM project, the project JSON, restore points kept in the browser, backup files.

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
  inputs/      adapters (json, clipboard, figma, plugin, screenshot) -> one component model
  components/  the canonical model, detection, inspector UI
  mapping/     field catalogue, deterministic engine, field node builder, validation
  dialog/      tabs, sections, layout operations
  preview/     the simulated dialog
  xml/         node tree, serializer, three validation layers, editor
  export/      per-component export and the ZIP bundle
  backup/      restore points
  projects/    versioned project schema, IndexedDB storage, import and export
  sample/      the built-in read-only project
src/marketing/ landing page
```

The mapping engine, XML generator and validators are separate, pure modules with no UI in them.

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

Nearly 600 automated tests: the mapping engine, node tree and XML, all three validators, every input adapter (Figma against recorded responses), import/export round trips, restore points, the interface for every view, keyboard behaviour, colour contrast computed from the real design tokens, automated accessibility checks (axe) on every screen, and security guards. The ZIP export was also checked with the system `unzip` and every generated dialog with `xmllint`.

What automation cannot tell you: whether the dialogs work in AEM (see above), whether the live Figma API accepts requests from your browser exactly as the tests assume, and how the tool feels with a screen reader.

## Design

Tokens and tone are inherited from the Yedara design system: warm white and sand grounds, hairline rules, one orange accent, Manrope. See [DESIGN.md](DESIGN.md) and [PRODUCT.md](PRODUCT.md).
