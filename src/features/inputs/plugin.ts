import { z } from 'zod'
import { parseComponentJson, describeZodError } from './json'
import { InputError, type ImportResult } from './types'
import { JsonComponentSchema } from './jsonSchema'

/**
 * Interface for the future companion Figma plugin (documented in docs/figma-plugin-interface.md).
 * The web app never depends on the plugin: the same payload can be pasted or uploaded as a file.
 */
export const PLUGIN_SCHEMA = 'aemora.plugin/v1'

export const PluginPayloadSchema = z.object({
  schema: z.literal(PLUGIN_SCHEMA),
  pluginVersion: z.string().max(40).optional(),
  fileKey: z.string().max(80).optional(),
  fileName: z.string().max(200).optional(),
  components: z.array(JsonComponentSchema).min(1).max(100),
})
export type PluginPayload = z.infer<typeof PluginPayloadSchema>

export const PLUGIN_MESSAGE_TYPE = 'aemora:components'

export function parsePluginPayload(payload: unknown): ImportResult {
  const parsed = PluginPayloadSchema.safeParse(payload)
  if (!parsed.success) throw new InputError('The data from the Figma plugin is not in the expected format.', describeZodError(parsed.error))
  const res = parseComponentJson(JSON.stringify({ schema: 'aemora.components/v1', components: parsed.data.components }), 'figma-plugin')
  res.source = {
    kind: 'figma-plugin',
    label: [parsed.data.fileName, parsed.data.pluginVersion && `plugin ${parsed.data.pluginVersion}`].filter(Boolean).join(' · ') || undefined,
    importedAt: new Date().toISOString(),
  }
  return res
}

export function parsePluginText(text: string): ImportResult {
  let data: unknown
  try { data = JSON.parse(text) } catch { throw new InputError('This is not valid JSON.') }
  return parsePluginPayload(data)
}

/**
 * Only messages from the window that opened Aemora (the plugin's launcher) are considered,
 * and the payload is validated like any other input. Nothing is imported until the user reviews it.
 */
export function readPluginMessage(event: Pick<MessageEvent, 'data' | 'source'>, opener: Window | null): ImportResult | null {
  if (!opener || event.source !== opener) return null
  const d = event.data as { type?: unknown; payload?: unknown } | null
  if (!d || d.type !== PLUGIN_MESSAGE_TYPE) return null
  return parsePluginPayload(d.payload)
}
