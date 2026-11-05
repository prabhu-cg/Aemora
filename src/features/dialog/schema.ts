import { z } from 'zod'

/** A field in the dialog is a reference to a property by its stable id, never a copy. */
export const FieldItemSchema = z.object({ kind: z.literal('field'), id: z.string().min(1) })

export const SectionSchema = z.object({
  kind: z.literal('section'),
  id: z.string().min(1),
  title: z.string().max(120),
  fieldIds: z.array(z.string().min(1)).max(300),
})
export type Section = z.infer<typeof SectionSchema>

export const TabItemSchema = z.discriminatedUnion('kind', [FieldItemSchema, SectionSchema])
export type TabItem = z.infer<typeof TabItemSchema>

export const TabSchema = z.object({
  id: z.string().min(1),
  title: z.string().max(120),
  items: z.array(TabItemSchema).max(400),
})
export type Tab = z.infer<typeof TabSchema>

export const ComponentDialogSchema = z.object({
  /** Shown as the dialog title in AEM. */
  title: z.string().max(200),
  tabs: z.array(TabSchema).min(1).max(30),
  /** Properties deliberately left out of the dialog. Kept so nothing disappears silently. */
  excluded: z.array(z.string().min(1)).default([]),
})
export type ComponentDialog = z.infer<typeof ComponentDialogSchema>

/** One entry per component, created the first time the user edits that component's dialog. */
export const DialogStoreSchema = z.object({
  components: z.record(z.string(), ComponentDialogSchema).default({}),
})
export type DialogStore = z.infer<typeof DialogStoreSchema>
