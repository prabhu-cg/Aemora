# Aemora

Browser-based generator that turns design component properties into AEM Cloud Service (Touch UI / Granite UI) authoring dialog XML. Deterministic, no AI, no backend.

## Develop

```bash
npm install
npm run dev        # http://127.0.0.1:5173
npm test           # vitest
npm run typecheck
npm run build
```

Routes (hash-based, static-host friendly): `/#/` landing, `/#/app` tool.

Design tokens follow the Yedara system (see PRODUCT.md and `src/styles/tokens.css`).

Generated output has not been tested against a real AEM Cloud Service environment.
