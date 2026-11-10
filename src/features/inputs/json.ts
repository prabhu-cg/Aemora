import type { ZodError } from 'zod'
import { convertJsonComponent } from './convert'
import { JsonComponentsSchema } from './jsonSchema'
import { InputError, MAX_INPUT_CHARS, safeReviver, type ImportResult, type Warning } from './types'
import type { Origin } from '../components/schema'
import { DESIGNMD_SCHEMA } from './designmd/schema'

/** "components.0.properties.2.type" -> "components[0].properties[2].type" */
export function formatPath(path: PropertyKey[]): string {
  return path.reduce<string>((acc, seg) => (typeof seg === 'number' ? `${acc}[${seg}]` : acc ? `${acc}.${String(seg)}` : String(seg)), '')
}

export function describeZodError(err: ZodError, limit = 8): string[] {
  const out = err.issues.slice(0, limit).map((i) => {
    const where = formatPath(i.path)
    const msg = i.code === 'invalid_type' && /undefined/.test(i.message) ? 'is required' : i.message
    return where ? `${where}: ${msg}` : msg
  })
  if (err.issues.length > limit) out.push(`…and ${err.issues.length - limit} more`)
  return out
}

/** Accepts the documented envelope, a bare component, or an array of components. */
export function parseComponentJson(text: string, kind: Extract<Origin['kind'], 'json' | 'clipboard' | 'figma-plugin'> = 'json'): ImportResult {
  if (text.length > MAX_INPUT_CHARS) throw new InputError('That input is larger than 2 MB. Split it into smaller files.')
  if (!text.trim()) throw new InputError('Nothing to import. Paste component JSON or choose a file.')
  let data: unknown
  try {
    data = JSON.parse(text, safeReviver)
  } catch (e) {
    throw new InputError(`This is not valid JSON: ${e instanceof Error ? e.message : 'parse error'}.`, [])
  }

  const warnings: Warning[] = []
  const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
  if (Array.isArray(data)) {
    data = { schema: 'aemora.components/v1', components: data }
    warnings.push({ level: 'info', message: 'Input was a bare list of components. Wrapped it in the aemora.components/v1 envelope.' })
  } else if (isObj(data) && !('schema' in data) && 'name' in data) {
    data = { schema: 'aemora.components/v1', components: [data] }
    warnings.push({ level: 'info', message: 'Input was a single component. Wrapped it in the aemora.components/v1 envelope.' })
  }

  if (isObj(data) && data.schema === DESIGNMD_SCHEMA) {
    throw new InputError('This is a DesignMD components file. Use the DesignMD tab to choose it, so you can pick which components to import.')
  }

  const parsed = JsonComponentsSchema.safeParse(data)
  if (!parsed.success) {
    const issues = describeZodError(parsed.error)
    const missingSchema = isObj(data) && data.schema !== 'aemora.components/v1'
    throw new InputError(
      missingSchema
        ? 'This JSON is not in the Aemora component format. It needs "schema": "aemora.components/v1" and a "components" list.'
        : 'The component JSON has problems. Fix them and try again.',
      issues,
    )
  }

  const components = parsed.data.components.map((c) => convertJsonComponent(c, kind, warnings))
  return {
    components,
    warnings,
    uncertain: [],
    source: { kind: kind === 'json' ? 'json' : kind === 'clipboard' ? 'clipboard' : 'figma-plugin', importedAt: new Date().toISOString() },
    assets: [],
  }
}
