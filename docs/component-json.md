# Component JSON (`aemora.components/v1`)

The structured format for the JSON import and for clipboard JSON. The machine-readable schema is generated from the same Zod definition the app validates with: `public/schemas/aemora-components-v1.json` (`npm run schema` regenerates it).

```json
{
  "schema": "aemora.components/v1",
  "components": [
    {
      "name": "Button",
      "type": "button",
      "description": "Primary call to action.",
      "properties": [
        { "name": "Label", "type": "string", "required": true, "default": "Learn more" },
        { "name": "Size", "type": "enum", "values": ["small", "medium", "large"], "default": "medium" }
      ],
      "children": [{ "name": "Icon", "approach": "expose-properties", "expose": ["iconReference"] }]
    }
  ]
}
```

## Components
| Field | Required | Notes |
|---|---|---|
| `name` | yes | Up to 120 characters. |
| `type` | no | `button`, `card`, `text`, `image`, `container`, `custom`. Detected from the name and properties when omitted or unsupported (with a warning). |
| `description` | no | |
| `properties` | no | Up to 300. |
| `children` | no | `approach` is `expose-properties` (default) or `reference-component`. `expose` lists child property keys shown in the parent dialog. |
| `meta` | no | Carried through untouched. |

## Properties
| Field | Required | Notes |
|---|---|---|
| `name` | yes | Display name. The machine key is derived from it: "Icon position" becomes `iconPosition`. |
| `type` | no | `string`, `text`, `richtext`, `number`, `boolean`, `enum`, `image`, `link`, `color`, `date`, `list`, `tags`, `hidden`. Common aliases such as `select`, `textarea`, `url`, `bool` are accepted. Inferred from the name when omitted. |
| `label` | no | Authoring label. Defaults to `name`. |
| `required` | no | Default `false`. |
| `default` | no | String, number, boolean or `null`. |
| `values` | no | Allowed values, for `enum`. |
| `description` | no | |
| `group` | no | Tab or section name. |

## Nothing is silently dropped
- A `type` Aemora does not support is replaced by a name-based guess and listed under the component's unsupported items.
- Any extra field on a property or component (for example `cropRatio`) is kept in the unsupported list with the reason.
- Both produce warnings in the import review.

## Limits
Input up to 2 MB, 100 components, 300 properties per component. Keys named `__proto__`, `constructor` and `prototype` are removed while parsing.
