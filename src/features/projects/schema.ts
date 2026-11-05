import { z } from 'zod'
import { AssetSchema, ComponentSchema } from '../components/schema'
import { MappingSchema } from '../mapping/schema'
import { DialogStoreSchema } from '../dialog/schema'

/** Bump when the stored/exported project shape changes; add a migration in migrate.ts. */
export const SCHEMA_VERSION = 1

export const INPUT_KINDS = ['none', 'figma-rest', 'figma-plugin', 'json', 'screenshot', 'clipboard'] as const

export const InputSourceSchema = z.object({
  kind: z.enum(INPUT_KINDS).default('none'),
  label: z.string().max(300).optional(),
  importedAt: z.string().optional(),
})

// components and assets are typed (chunk 2). The rest are tightened in later chunks
// (dialog: chunk 5, generatedXml and validation: chunk 7) and carried through intact until then.
const loose = z.record(z.string(), z.unknown())

export const ProjectSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: z.string().min(1).max(100),
  name: z.string().trim().min(1, 'Project name is required').max(120),
  description: z.string().max(2000).default(''),
  aemComponentName: z.string().max(120).default(''),
  inputSource: InputSourceSchema.default({ kind: 'none' }),
  components: z.array(ComponentSchema).default([]),
  assets: z.array(AssetSchema).max(20).default([]),
  mappings: z.array(MappingSchema).default([]),
  dialog: DialogStoreSchema.default({ components: {} }),
  generatedXml: z
    .object({ xml: z.string(), generatedAt: z.string(), edited: z.boolean().default(false) })
    .nullable()
    .default(null),
  validation: z.array(loose).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type Project = z.infer<typeof ProjectSchema>

export const ProjectEnvelopeSchema = z.object({
  format: z.literal('aemora.project'),
  schemaVersion: z.number().int(),
  exportedAt: z.string(),
  project: z.unknown(),
})
export const BackupEnvelopeSchema = z.object({
  format: z.literal('aemora.backup'),
  schemaVersion: z.number().int(),
  exportedAt: z.string(),
  projects: z.array(z.unknown()),
})

export const NewProjectInputSchema = z.object({
  name: z.string().trim().min(1, 'Project name is required').max(120, 'Keep the name under 120 characters'),
  description: z.string().max(2000).default(''),
  aemComponentName: z
    .string()
    .trim()
    .max(120)
    .regex(/^[a-z][a-z0-9-]*$|^$/, 'Use lowercase letters, numbers and hyphens, starting with a letter (e.g. card-teaser)')
    .default(''),
})
export type NewProjectInput = z.input<typeof NewProjectInputSchema>
