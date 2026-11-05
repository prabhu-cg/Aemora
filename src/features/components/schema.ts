import { z } from 'zod'

/** Canonical property types. These are design-level; chunk 4 maps them to AEM Granite fields. */
export const PROPERTY_TYPES = [
  'string', 'text', 'richtext', 'number', 'boolean', 'enum', 'image', 'link', 'color', 'date', 'list', 'tags', 'hidden',
] as const
export type PropertyType = (typeof PROPERTY_TYPES)[number]

export const COMPONENT_TYPES = ['button', 'card', 'text', 'image', 'container', 'custom'] as const
export type ComponentType = (typeof COMPONENT_TYPES)[number]

export const ORIGIN_KINDS = ['json', 'clipboard', 'figma-rest', 'figma-plugin', 'screenshot', 'manual', 'template'] as const

export const OriginSchema = z.object({
  kind: z.enum(ORIGIN_KINDS),
  /** Stable reference into the source, e.g. a Figma node id or a clipboard line. */
  ref: z.string().max(300).optional(),
  /** Screenshot region in percent of the image (0-100). */
  region: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }).optional(),
  assetId: z.string().optional(),
  /** True when detection proposed this property and the user has not confirmed it. */
  suggested: z.boolean().default(false),
})
export type Origin = z.infer<typeof OriginSchema>

export const PropertySchema = z.object({
  id: z.string().min(1),
  /** Machine name; becomes the JCR property name in the dialog. */
  // May be empty while someone is mid-edit; validateComponent reports it.
  key: z.string().max(80),
  label: z.string().max(120),
  type: z.enum(PROPERTY_TYPES),
  required: z.boolean().default(false),
  defaultValue: z.union([z.string(), z.number(), z.boolean()]).nullable().default(null),
  allowedValues: z.array(z.string().max(200)).max(200).default([]),
  description: z.string().max(1000).default(''),
  /** Free-form tab/section name chosen in the inspector (chunk 3). */
  group: z.string().max(80).default(''),
  origin: OriginSchema,
})
export type Property = z.infer<typeof PropertySchema>

/** Anything the input carried that cannot become an AEM field. Never silently dropped. */
export const UnsupportedSchema = z.object({
  id: z.string().min(1),
  name: z.string().max(200),
  rawType: z.string().max(200).default(''),
  rawValue: z.unknown().optional(),
  reason: z.string().max(500),
  origin: OriginSchema,
})
export type Unsupported = z.infer<typeof UnsupportedSchema>

export const ChildLinkSchema = z.object({
  name: z.string().min(1).max(120),
  /** V1: either expose selected child properties in this dialog, or reference an independently authored component. */
  approach: z.enum(['expose-properties', 'reference-component']).default('expose-properties'),
  exposedKeys: z.array(z.string()).default([]),
})
export type ChildLink = z.infer<typeof ChildLinkSchema>

export const ComponentSchema = z.object({
  id: z.string().min(1),
  name: z.string().max(120),
  type: z.enum(COMPONENT_TYPES),
  description: z.string().max(2000).default(''),
  properties: z.array(PropertySchema).max(300).default([]),
  unsupported: z.array(UnsupportedSchema).max(300).default([]),
  children: z.array(ChildLinkSchema).max(100).default([]),
  meta: z.record(z.string(), z.unknown()).default({}),
  /** A picture of the design (a Figma render, or the screenshot that was annotated). Points at an asset in the project. */
  previewAssetId: z.string().max(100).optional(),
  origin: OriginSchema,
})
export type ComponentDef = z.infer<typeof ComponentSchema>

export const AssetSchema = z.object({
  id: z.string().min(1),
  name: z.string().max(200),
  mime: z.enum(['image/png', 'image/jpeg', 'image/webp']),
  bytes: z.number().int().nonnegative(),
  dataUrl: z.string().regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, 'Not a PNG, JPEG or WebP data URL'),
})
export type Asset = z.infer<typeof AssetSchema>
