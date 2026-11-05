# Clipboard text format

Paste JSON (see `component-json.md`) or this structured text:

```
Component: Button [button]
Primary call to action
- Label: text, required, default=Learn more
- Size: enum(small|medium|large), default=medium
- Opens in new tab: boolean
- Icon position: none | left | right
```

- `Component: Name [type]`. The `[type]` is optional.
- The first plain line after a component line is its description.
- A property is `- Name: type, required, default=value, note`. The type may be a type word, `enum(a|b|c)`, or `a | b | c`.
- With no type, the type is detected from the name and an info warning says so.
- Any line the parser cannot interpret is listed as **uncertain** in the review so you can add it by hand. Nothing is discarded.
