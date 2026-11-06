import { z } from 'zod'

export const FIELD_TYPE_IDS = [
  'textfield', 'textarea', 'numberfield', 'checkbox', 'switch', 'select', 'multifield',
  'pathfield', 'fileupload', 'colorfield', 'hidden', 'tagfield', 'datepicker', 'richtext',
] as const
export type FieldTypeId = (typeof FIELD_TYPE_IDS)[number]

const scalar = z.union([z.string(), z.number(), z.boolean()])

export const SubfieldSchema = z.object({
  id: z.string().min(1),
  key: z.string().max(80),
  label: z.string().max(120),
  fieldType: z.enum(['textfield', 'textarea', 'numberfield', 'checkbox', 'pathfield', 'select', 'hidden']),
  /** For select subfields: the allowed values. */
  allowedValues: z.array(z.string().max(200)).max(100).default([]),
})
export type Subfield = z.infer<typeof SubfieldSchema>

export const MultifieldSchema = z.object({
  composite: z.boolean().default(false),
  itemFieldType: z.enum(['textfield', 'textarea', 'numberfield', 'pathfield']).default('textfield'),
  subfields: z.array(SubfieldSchema).max(30).default([]),
})
export type MultifieldConfig = z.infer<typeof MultifieldSchema>

/**
 * A stored mapping holds only what the user decided. Anything absent is derived by the
 * engine from the property, so renaming a property keeps its field in step.
 */
export const MappingSchema = z.object({
  id: z.string().min(1),
  componentId: z.string().min(1),
  propertyId: z.string().min(1),
  fieldType: z.enum(FIELD_TYPE_IDS),
  /** True when the user picked the field type instead of accepting the suggestion. */
  manual: z.boolean().default(false),
  overrides: z.object({
    label: z.string().max(120).optional(),
    name: z.string().max(200).optional(),
    defaultValue: scalar.nullable().optional(),
    required: z.boolean().optional(),
    description: z.string().max(1000).optional(),
    allowedValues: z.array(z.string().max(200)).max(200).optional(),
    group: z.string().max(80).optional(),
    /**
     * Show this field only when another one is checked (a checkbox or switch), or has a given value (a select).
     * Written as Granite UI's show/hide convention; a script in the AEM project does the showing and hiding.
     */
    showWhen: z.object({ propertyId: z.string().min(1), value: z.string().max(200).optional() }).optional(),
  }).default({}),
  constraints: z.record(z.string(), scalar).default({}),
  multifield: MultifieldSchema.optional(),
})
export type Mapping = z.infer<typeof MappingSchema>
export type MappingOverrides = Mapping['overrides']
