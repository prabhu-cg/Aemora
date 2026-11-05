import type { ComponentDef, ComponentType, Property, PropertyType } from './schema'
import { PROPERTY_TYPES } from './schema'
import { makeProperty } from './factory'

/** "Icon position" -> "iconPosition". Always a valid JCR-friendly identifier. */
export function toKey(name: string): string {
  const words = name
    .replace(/#[\w:]+$/, '') // Figma property suffix, e.g. "Label#12:0"
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
  if (!words.length) return 'property'
  const key = words.map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase())).join('')
  return /^[a-z]/.test(key) ? key : `p${key[0].toUpperCase()}${key.slice(1)}`
}

export function toLabel(name: string): string {
  const clean = name.replace(/#[\w:]+$/, '').trim()
  return clean || 'Property'
}

const ALIASES: Record<string, PropertyType> = {
  string: 'string', textfield: 'string', 'short-text': 'string',
  text: 'text', textarea: 'text', 'long-text': 'text', multiline: 'text',
  richtext: 'richtext', rte: 'richtext', 'rich-text': 'richtext', html: 'richtext',
  number: 'number', numeric: 'number', int: 'number', integer: 'number', float: 'number',
  boolean: 'boolean', bool: 'boolean', checkbox: 'boolean', switch: 'boolean', toggle: 'boolean',
  enum: 'enum', select: 'enum', variant: 'enum', dropdown: 'enum', options: 'enum',
  image: 'image', asset: 'image', img: 'image', picture: 'image', file: 'image',
  link: 'link', url: 'link', href: 'link', path: 'link', pathfield: 'link',
  color: 'color', colour: 'color',
  date: 'date', datetime: 'date',
  list: 'list', array: 'list', multifield: 'list', repeater: 'list',
  tags: 'tags', tag: 'tags',
  hidden: 'hidden',
}

/** Returns the canonical type for a declared type word, or null when unsupported. */
export function normalizeTypeAlias(raw: string): PropertyType | null {
  const k = raw.trim().toLowerCase()
  if ((PROPERTY_TYPES as readonly string[]).includes(k)) return k as PropertyType
  return ALIASES[k] ?? null
}

const RULES: [RegExp, PropertyType][] = [
  [/rich\s*text|body\s*copy|\brte\b/i, 'richtext'],
  [/\b(is|has|show|hide|enable|disable|open|optional|visible|checked|disabled|required|new\s*tab)\b|^(show|hide|enable|disable|is|has)[A-Z ]/i, 'boolean'],
  [/\b(url|href|link|cta\s*link|path)\b/i, 'link'],
  [/\b(image|img|photo|picture|thumbnail|asset|src|icon\s*(ref|reference|src|path))\b/i, 'image'],
  [/colou?r/i, 'color'],
  [/\bdate\b|\btime\b/i, 'date'],
  [/\btags?\b/i, 'tags'],
  [/\b(items|list|links|slides|cards|entries)\b/i, 'list'],
  [/\b(count|number|columns|rows|max|min|index|limit|duration|delay|width|height)\b/i, 'number'],
  [/\b(size|variant|state|style|align(ment)?|position|theme|level|layout|type|kind|direction|orientation|background|width\s*variant)\b/i, 'enum'],
  [/\b(description|body|content|message|copy|summary|paragraph)\b/i, 'text'],
  [/\b(label|title|heading|headline|text|name|caption|alt|aria|eyebrow|subtitle|cta)\b/i, 'string'],
]

/** Name-based type inference. Pure and deterministic. */
export function inferPropertyType(name: string, sample?: unknown): PropertyType {
  if (typeof sample === 'boolean') return 'boolean'
  if (typeof sample === 'number') return 'number'
  const spaced = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ')
  for (const [re, t] of RULES) if (re.test(spaced)) return t
  return 'string'
}

const COMPONENT_RULES: [RegExp, ComponentType][] = [
  [/\b(button|btn|cta)\b/i, 'button'],
  [/\b(card|teaser|tile)\b/i, 'card'],
  [/\b(image|img|picture|media|photo)\b/i, 'image'],
  [/\b(text|title|heading|paragraph|copy|headline)\b/i, 'text'],
  [/\b(container|section|grid|layout|stack|wrapper|row|column|band|region)\b/i, 'container'],
]

/** Classify by component name first, then by property signature. */
export function classifyComponent(name: string, propertyNames: string[] = []): ComponentType {
  const spaced = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_/-]+/g, ' ')
  for (const [re, t] of COMPONENT_RULES) if (re.test(spaced)) return t
  const keys = propertyNames.map((p) => toKey(p).toLowerCase())
  const has = (s: string) => keys.some((k) => k.includes(s))
  if (has('label') && (has('link') || has('url') || has('variant'))) return 'button'
  if (has('image') && (has('heading') || has('title')) && (has('cta') || has('description'))) return 'card'
  if (has('alt') && has('image')) return 'image'
  if (has('child') || has('spacing') || has('gap')) return 'container'
  return 'custom'
}

type Template = Pick<Property, 'key' | 'label' | 'type'> & Partial<Property>

/** Standard properties the V1 component types usually expose. Offered as suggestions, never auto-added. */
export const TEMPLATES: Record<Exclude<ComponentType, 'custom'>, Template[]> = {
  button: [
    { key: 'label', label: 'Label', type: 'string', required: true },
    { key: 'size', label: 'Size', type: 'enum', allowedValues: ['small', 'medium', 'large'], defaultValue: 'medium' },
    { key: 'variant', label: 'Variant', type: 'enum', allowedValues: ['primary', 'secondary', 'tertiary'], defaultValue: 'primary' },
    { key: 'state', label: 'State', type: 'enum', allowedValues: ['default', 'disabled'], defaultValue: 'default' },
    { key: 'iconPosition', label: 'Icon position', type: 'enum', allowedValues: ['none', 'left', 'right'], defaultValue: 'none' },
    { key: 'iconReference', label: 'Icon reference', type: 'image' },
    { key: 'accessibilityLabel', label: 'Accessibility label', type: 'string' },
    { key: 'link', label: 'Link', type: 'link' },
  ],
  card: [
    { key: 'heading', label: 'Heading', type: 'string', required: true },
    { key: 'description', label: 'Description', type: 'text' },
    { key: 'image', label: 'Image', type: 'image' },
    { key: 'ctaLabel', label: 'CTA label', type: 'string' },
    { key: 'ctaLink', label: 'CTA link', type: 'link' },
    { key: 'backgroundVariant', label: 'Background variant', type: 'enum', allowedValues: ['default', 'subtle', 'accent'], defaultValue: 'default' },
    { key: 'alignment', label: 'Alignment', type: 'enum', allowedValues: ['left', 'center'], defaultValue: 'left' },
    { key: 'showDescription', label: 'Show description', type: 'boolean', defaultValue: true },
  ],
  text: [
    { key: 'text', label: 'Text', type: 'text', required: true },
    { key: 'headingLevel', label: 'Heading level', type: 'enum', allowedValues: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p'], defaultValue: 'p' },
    { key: 'richText', label: 'Rich text', type: 'boolean', defaultValue: false },
    { key: 'alignment', label: 'Alignment', type: 'enum', allowedValues: ['left', 'center', 'right'], defaultValue: 'left' },
  ],
  image: [
    { key: 'asset', label: 'Image', type: 'image', required: true },
    { key: 'altText', label: 'Alt text', type: 'string' },
    { key: 'decorative', label: 'Decorative image', type: 'boolean', defaultValue: false },
    { key: 'displayVariant', label: 'Display variant', type: 'enum', allowedValues: ['default', 'rounded', 'cover'], defaultValue: 'default' },
  ],
  container: [
    { key: 'layout', label: 'Layout', type: 'enum', allowedValues: ['stack', 'row', 'grid'], defaultValue: 'stack' },
    { key: 'spacing', label: 'Spacing', type: 'enum', allowedValues: ['none', 'small', 'medium', 'large'], defaultValue: 'medium' },
    { key: 'alignment', label: 'Alignment', type: 'enum', allowedValues: ['start', 'center', 'end'], defaultValue: 'start' },
  ],
}

/** Template properties the component does not have yet, flagged `suggested`. */
export function suggestMissingProperties(c: ComponentDef): Property[] {
  if (c.type === 'custom') return []
  const have = new Set(c.properties.map((p) => p.key.toLowerCase()))
  return TEMPLATES[c.type]
    .filter((t) => !have.has(t.key.toLowerCase()))
    .map((t) => makeProperty({ ...t, origin: { kind: 'template', suggested: true } }))
}
