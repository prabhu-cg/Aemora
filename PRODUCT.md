# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Specified by the user's brief: React, TypeScript, Vite, Tailwind CSS, Dexie (IndexedDB), Zod, dnd-kit, Monaco (or equivalent) XML editor. One Vite app with two surfaces: marketing landing at `/` and the tool at `/app` (hash routing so it works on static hosts). Static deploy only, on Vercel. Repo: https://github.com/prabhu-cg/Aemora.git (commit per chunk to main).

## Users

UX/UI and product designers, design-system designers, AEM developers, front-end developers working with AEM, and design-to-development teams. Job: turn a design component's properties (Button, Card, Text, Image, Container) into a valid AEM Cloud Service authoring dialog without hand-writing Granite UI XML.

## Product Purpose

Aemora is a browser-based tool that converts design component information into editable, valid AEM Cloud Service (Touch UI / Granite UI) dialog XML. Flow: input design, identify components and properties, map to AEM fields, review and edit, preview the dialog, generate XML, validate, export. Success: a designer or developer takes a supported component definition, maps its properties, and gets a complete dialog XML file usable as the starting point of a real AEM component.

## Positioning

Deterministic, not generative: the same input always yields the same XML, with no AI and no backend. Runs entirely in the browser; project data stays local. It maps design properties to real Granite UI resource types and shows a simulated authoring preview and three clearly separated validation layers (XML syntax, internal generator, AEM compatibility).

## Operating Context

Inputs: Figma REST API (personal access token held in memory for the session only), a future Figma plugin via a documented JSON interface, JSON import against a documented schema, screenshot upload (PNG/JPG/WebP) with manual annotation, and clipboard text/JSON. All feed one canonical internal component model. Outputs: dialog XML, project JSON export/import, local backup and restore. Persistence via IndexedDB.

## Capabilities and Constraints

- AEM field types supported: Textfield, Textarea, Numberfield, Checkbox, Switch, Select, Multifield, Pathfield, Fileupload, Colorfield, Hidden, Tagfield, Datepicker, Richtext.
- No custom JavaScript, clientlibs, custom Granite widgets, Classic UI dialogs, or unsupported Granite components in generated dialog XML. One exception, by the user's decision: when a dialog uses "show only when" fields, the export ZIP also carries a small show/hide clientlib (a fixed, dependency-free script) that acts on the standard Granite markers.
- Preview is a simulated authoring preview, not a running AEM instance. Never claim AEM runtime validation unless tested on a real AEM environment (not yet done).
- Screenshots do not provide reliable Figma metadata; no OCR or AI.
- Figma tokens never persisted, exported, or logged.
- V1 scope only: no shared component definitions or cross-instance sync (V2).
- Hosting: Vercel (production at https://aemora.vercel.app), deployed from `main` through the Git integration.

## Brand Commitments

Name: Aemora. The visual identity is the SiteNest "Butter" system (https://github.com/prabhu-cg/SiteNest/blob/main/DESIGN.md), applied to both the marketing site and the tool. Tokens live in `src/styles/tokens.css`; the rules are in `DESIGN.md`.

- **Colour:** white paper on a pale butter desk (#FCFAF3), butter hairlines, one amber accent (#E8B923). Amber is a fill, never text; accent text is ochre (#826400), and text on amber is charcoal (#353335), never white. Body text is #4D4A4D.
- **Type:** Newsreader for headlines (h1, h2), DM Sans for everything else; both self-hosted.
- **Shape:** every button is a full pill; inputs 12px; landing cards and panels 20px.
- **Selection:** a selected tab, row, list item or segment takes the butter tint with ochre or charcoal text. Never a grey fill.
- **Themes:** light and dark only, light by default; no "system" option. Dark is a warm charcoal ramp (#141312), never neutral grey.
- **Logo:** the Aemora mark with an amber stroke and a charcoal letterform (it follows the theme in dark mode).
- The simulated AEM dialog preview keeps Adobe-style blue on purpose; it imitates AEM, not the brand.

## Evidence on Hand

No customers, testimonials, statistics, pricing, or AEM-environment test results exist. Landing page must not fabricate any. The landing page's laptop screenshots (`src/marketing/assets/app-light.webp`, `app-dark.webp`) are real captures of the tool on the built-in sample project, and must be retaken whenever the visible chrome changes.

## Product Principles

1. Deterministic and inspectable: every output traces back to a visible mapping the user can edit.
2. Honest about limits: simulated preview, unverified runtime compatibility, and unsupported properties are surfaced, never hidden or silently dropped.
3. Local-first and private: no backend, no account, credentials in memory only.
4. Real Granite UI, no invention: only supported resource types and node structures.
5. Familiar IDE-style workflow: two-panel editing, right-side drawers, few modals.

## Accessibility & Inclusion

Not specified by the user. Baseline target: keyboard-operable editor (including drag-and-drop alternatives), visible focus, WCAG AA contrast, reduced-motion respected. Formal standard to be confirmed.
