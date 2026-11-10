import { z } from 'zod'
import { AssetSchema, ComponentSchema } from '../components/schema'
import { MappingSchema } from '../mapping/schema'
import { DialogStoreSchema } from '../dialog/schema'
import { DEFAULT_MARKUP_OPTIONS } from '../markup/types'

/** Bump when the stored/exported project shape changes; add a migration in migrate.ts. */
export const SCHEMA_VERSION = 1

export const INPUT_KINDS = ['none', 'figma-rest', 'figma-plugin', 'json', 'screenshot', 'clipboard'] as const

export const InputSourceSchema = z.object({
  kind: z.enum(INPUT_KINDS).default('none'),
  label: z.string().max(300).optional(),
  importedAt: z.string().optional(),
})

// components and assets are typed (chunk 2). The rest are tightened in later chunks
// (validation results are derived, not stored) and carried through intact until then.
const loose = z.record(z.string(), z.unknown())

export const GeneratedXmlSchema = z.object({
  /** The XML text, including hand edits. */
  xml: z.string().max(2_000_000),
  /** What Aemora generated at the moment of the first hand edit, to tell when the design has moved on since. */
  base: z.string().max(2_000_000).default(''),
  generatedAt: z.string(),
  edited: z.boolean().default(false),
  format: z.enum(['standalone', 'inline']).default('standalone'),
})
export type GeneratedXml = z.infer<typeof GeneratedXmlSchema>

/** Names the generated markup uses. Chosen once per project. */
export const MarkupSettingsSchema = z.object({
  cssPrefix: z.string().max(40).default(DEFAULT_MARKUP_OPTIONS.cssPrefix),
  javaPackage: z.string().max(200).default(DEFAULT_MARKUP_OPTIONS.javaPackage),
  group: z.string().max(120).default(DEFAULT_MARKUP_OPTIONS.group),
})
export type MarkupSettings = z.infer<typeof MarkupSettingsSchema>

/** Hand-edited markup files of one component, by file kind. Written only when someone edits a file. */
export const StoredMarkupSchema = z.object({
  files: z.record(z.string(), z.object({
    content: z.string().max(2_000_000),
    /** What Aemora generated at the first hand edit, to tell when the design has moved on since. */
    base: z.string().max(2_000_000).default(''),
    edited: z.boolean().default(false),
    generatedAt: z.string(),
  })).default({}),
})
export type StoredMarkup = z.infer<typeof StoredMarkupSchema>

export const ProjectSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: z.string().min(1).max(100),
  name: z.string().trim().min(1, 'Project name is required').max(120),
  description: z.string().max(2000).default(''),
  aemComponentName: z.string().max(120).default(''),
  inputSource: InputSourceSchema.default({ kind: 'none' }),
  components: z.array(ComponentSchema).default([]),
  assets: z.array(AssetSchema).max(40).default([]),
  mappings: z.array(MappingSchema).default([]),
  dialog: DialogStoreSchema.default({ components: {} }),
  /** One entry per component, written only when someone edits the XML by hand. Otherwise the XML is derived. */
  generatedXml: z.preprocess((v) => (v == null || Array.isArray(v) ? {} : v), z.record(z.string(), GeneratedXmlSchema)).default({}),
  markupSettings: MarkupSettingsSchema.default({ cssPrefix: DEFAULT_MARKUP_OPTIONS.cssPrefix, javaPackage: DEFAULT_MARKUP_OPTIONS.javaPackage, group: DEFAULT_MARKUP_OPTIONS.group }),
  /** HTL, CSS, Sling Model and component XML edits, per component. Otherwise the markup is derived. */
  markup: z.record(z.string(), StoredMarkupSchema).default({}),
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
