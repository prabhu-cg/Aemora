// Standalone (zod only). Reads the parts of designmd.components/v1 that Aemora uses; everything else is carried through untouched.
import { z } from 'zod'

export const DESIGNMD_SCHEMA = 'designmd.components/v1'

const scalar = z.union([z.string(), z.number(), z.boolean(), z.null()])

export const DmPropertySchema = z.looseObject({
  key: z.string().default(''),
  name: z.string().min(1).max(200),
  type: z.string().max(40),
  defaultValue: scalar.optional(),
  variantOptions: z.array(z.string()).optional(),
  defaultResolved: z.looseObject({ id: z.string().optional(), name: z.string().optional() }).optional(),
})

export const DmComponentSchema = z.looseObject({
  id: z.string().min(1),
  key: z.string().optional(),
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  isComponentSet: z.boolean().optional(),
  pageName: z.string().optional(),
  properties: z.array(DmPropertySchema).default([]),
  states: z.array(z.string()).default([]),
  sizes: z.array(z.string()).default([]),
  variants: z.array(z.unknown()).default([]),
  layout: z.unknown().optional(),
  defaultVariantId: z.string().optional(),
  tree: z.unknown().optional(),
  variantDiffs: z.array(z.unknown()).default([]),
  treeTruncated: z.boolean().optional(),
})

export const DmWarningSchema = z.looseObject({
  code: z.string().optional(),
  message: z.string().default(''),
  componentId: z.string().optional(),
  layerId: z.string().optional(),
})

export const DmEnvelopeSchema = z.looseObject({
  schema: z.literal(DESIGNMD_SCHEMA),
  metadata: z.looseObject({ fileName: z.string().optional(), pluginVersion: z.string().optional() }).optional(),
  index: z.looseObject({ componentCount: z.number().optional() }).optional(),
  tokens: z.record(z.string(), z.unknown()).default({}),
  components: z.array(z.unknown()),
  warnings: z.array(DmWarningSchema).default([]),
})

export type DmProperty = z.infer<typeof DmPropertySchema>
export type DmComponent = z.infer<typeof DmComponentSchema>
export type DmWarning = z.infer<typeof DmWarningSchema>

/** A layer of the default variant's tree. Only the fields Aemora reads are typed. */
export interface DmLayer {
  id: string
  name: string
  type: string
  role?: string
  roleSource?: 'property' | 'type' | 'name' | 'none'
  visible?: boolean
  text?: { characters?: string }
  propertyRefs?: Record<string, string>
  children?: DmLayer[]
}
