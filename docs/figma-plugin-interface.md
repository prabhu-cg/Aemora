# Figma plugin interface (`aemora.plugin/v1`)

A companion plugin is not part of V1, and Aemora never requires it. This is the contract it will follow. The same payload can already be pasted or uploaded in the **Figma plugin** input.

```json
{
  "schema": "aemora.plugin/v1",
  "pluginVersion": "0.1.0",
  "fileKey": "AbC123...",
  "fileName": "Design System",
  "components": [ /* same objects as aemora.components/v1 components */ ]
}
```

## Delivery
1. **Paste or file:** the user copies the payload from the plugin and pastes or uploads it. Works everywhere.
2. **postMessage:** the plugin opens Aemora with `window.open` and sends
   `{ "type": "aemora:components", "payload": { ... } }` to the opened window.
   Aemora only accepts messages from the window that opened it, validates the payload exactly like pasted input, and imports nothing until the user reviews it.

The plugin should send component names, variant and property definitions, text layers, visibility and dimensions. It should not send access tokens or file content beyond that.
