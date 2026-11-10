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

## DesignMD plugin (`designmd.components/v1`)
The DesignMD Figma plugin exports `components.json` (`designmd.components/v1`, spec in `docs/designmd-components-v1.md`). Import it in the **DesignMD** tab of "Bring in a design":
1. Choose `components.json`. Above 20 MB the plugin splits the export: `components.json` becomes an index and each component has its own file in a `components` folder. Then use **Choose export folder** and pick the whole export folder. Aemora reads every component file in it, and skips the index and anything that is not a DesignMD component. You can also select the files yourself, with or without the index.
2. Pick the components to bring in (search, "Select shown"). Up to 50 per import.
3. Review. Warnings say what was inferred, skipped or cut off. Nothing is added until you confirm.

What is mapped:
| DesignMD | Aemora |
|---|---|
| `TEXT` property | text field (string, text, rich text or link, by name) |
| `BOOLEAN` property | checkbox |
| `INSTANCE_SWAP` property | text field for the icon name or path |
| `VARIANT` property | select field with the variant options |
| `state` variant (hover, focus, disabled) | not a field; kept in the design data for the CSS |
| unbound text layers | suggested fields, marked "(suggested)" |

The layer tree, layout, styles, variant differences and the tokens a component uses are kept in the component's `meta.design` for the markup generators. A `.json` file that is a DesignMD export is also recognised in the JSON tab, which points to the DesignMD tab.

### Nested components
By default DesignMD does not read what is inside a nested component (an avatar in a card, a button in a banner). The layer arrives as an empty `INSTANCE` with `instanceOf`. When the file that holds the card also holds that component, Aemora fills the empty layer in at import, from the referenced variant, and the import review says which ones.

- This is the library version. Anything changed in that use of the component, such as a different label, is not applied. For exact contents, export from DesignMD with **Include layers inside nested instances** on. Layers that already carry their insides are never touched.
- Icons are not filled in. The export holds a vector's size and colour but not its path, so there is nothing to draw. They stay as labelled boxes until DesignMD can export the shapes.
- Filling is limited to 3 levels deep and 400 extra layers per component, and never follows a component into itself.
