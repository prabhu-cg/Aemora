// Standalone (zod only) so scripts/gen-schema.ts can import it without a bundler.
import { z } from 'zod'

const scalar = z.union([z.string(), z.number(), z.boolean()])

export const JsonPropertySchema = z.looseObject({
  name: z.string().min(1).max(120).describe('Display name of the property, e.g. "Icon position".'),
  type: z.string().max(40).optional().describe('string, text, richtext, number, boolean, enum, image, link, color, date, list, tags or hidden. Inferred from the name when omitted.'),
  label: z.string().max(120).optional().describe('Authoring label. Defaults to name.'),
  required: z.boolean().optional(),
  default: scalar.nullable().optional(),
  values: z.array(z.string().max(200)).max(200).optional().describe('Allowed values for enum properties.'),
  description: z.string().max(1000).optional(),
  group: z.string().max(80).optional().describe('Tab or section to place the field in.'),
})

export const JsonChildSchema = z.looseObject({
  name: z.string().min(1).max(120),
  approach: z.enum(['expose-properties', 'reference-component']).optional(),
  expose: z.array(z.string()).max(100).optional().describe('Child property keys exposed in the parent dialog.'),
})

export const JsonComponentSchema = z.looseObject({
  name: z.string().min(1).max(120),
  type: z.string().max(40).optional().describe('button, card, text, image, container or custom. Detected from the name when omitted.'),
  description: z.string().max(2000).optional(),
  properties: z.array(JsonPropertySchema).max(300).default([]),
  children: z.array(JsonChildSchema).max(100).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
})

export const JsonComponentsSchema = z.object({
  schema: z.literal('aemora.components/v1'),
  components: z.array(JsonComponentSchema).min(1, 'Add at least one component').max(100),
})

export type JsonComponents = z.infer<typeof JsonComponentsSchema>
export type JsonComponent = z.infer<typeof JsonComponentSchema>
export type JsonProperty = z.infer<typeof JsonPropertySchema>
