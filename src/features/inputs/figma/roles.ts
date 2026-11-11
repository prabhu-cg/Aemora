import type { Layer } from '../../markup/layers'

/**
 * Role of each layer: what it is for (a label, an icon, a divider ...). A pure function of the tree, the same rules the
 * DesignMD plugin applies, so both ways in give the same markup. Roles are hints. `roleSource` says what decided it:
 * a component property, the layer's type or paint, or its name (the least sure).
 */
const ICON_MAX_SIZE = 64
const LABEL_MAX_CHARS = 40
const VECTOR_TYPES = new Set(['VECTOR', 'BOOLEAN_OPERATION', 'STAR', 'POLYGON', 'ELLIPSE'])
const CONTAINER_TYPES = new Set(['FRAME', 'GROUP', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE', 'SECTION'])

const NAME_RULES: [string, RegExp][] = [
  ['heading', /\b(heading|headline|title|h[1-6])\b/i],
  ['button', /\b(button|btn|cta)\b/i],
  ['link', /\b(link|anchor)\b/i],
  ['input', /\b(input|field|textfield|textarea)\b/i],
  ['divider', /\b(divider|separator|hr|rule)\b/i],
  ['icon', /\b(icon|glyph|chevron|caret|arrow)\b/i],
  ['image', /\b(image|img|photo|picture|avatar|thumbnail|illustration)\b/i],
  ['slot', /\b(slot|placeholder)\b/i],
  ['label', /\b(label|caption)\b/i],
]
const words = (name: string) => name.replace(/[_\-/.]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2')
const matchName = (raw: string) => NAME_RULES.find(([, re]) => re.test(words(raw)))?.[0]
const small = (l: Layer) => !!l.size && l.size.width <= ICON_MAX_SIZE && l.size.height <= ICON_MAX_SIZE

function infer(l: Layer, isRoot: boolean): { role: string; roleSource: string } {
  if (isRoot) return { role: 'root', roleSource: 'type' }
  const refs = l.propertyRefs
  if (refs?.characters) {
    const chars = l.text?.characters
    return { role: chars === undefined || (chars.length <= LABEL_MAX_CHARS && !chars.includes('\n')) ? 'label' : 'text', roleSource: 'property' }
  }
  if (refs?.mainComponent) return { role: small(l) ? 'icon' : 'slot', roleSource: 'property' }
  if (l.fills?.some((p) => p.visible !== false && p.type === 'IMAGE')) return { role: 'image', roleSource: 'type' }
  if (l.type === 'LINE') return { role: 'divider', roleSource: 'type' }
  if (l.type === 'RECTANGLE' && !(l.children ?? []).length && l.size && Math.min(l.size.width, l.size.height) <= 2 && Math.max(l.size.width, l.size.height) > 8) return { role: 'divider', roleSource: 'type' }
  if (VECTOR_TYPES.has(l.type) && small(l)) return { role: 'icon', roleSource: 'type' }
  const byName = matchName(l.name) ?? (l.instanceOf?.componentName ? matchName(l.instanceOf.componentName) : undefined)
  if (byName) return { role: byName, roleSource: 'name' }
  if (l.type === 'TEXT') return { role: 'text', roleSource: 'type' }
  if (CONTAINER_TYPES.has(l.type) && (l.children ?? []).length) return { role: 'container', roleSource: 'type' }
  return { role: 'unknown', roleSource: 'none' }
}

/** Sets `role` and `roleSource` on every layer of the tree, in place. */
export function assignRoles(l: Layer, isRoot = true): void {
  const r = infer(l, isRoot)
  l.role = r.role
  l.roleSource = r.roleSource
  for (const c of l.children ?? []) assignRoles(c, false)
}
