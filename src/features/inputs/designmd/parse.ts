import { describeZodError } from '../json'
import { InputError, safeReviver, type ImportResult, type Warning } from '../types'
import type { ComponentDef } from '../../components/schema'
import { convertDesignMdComponent, walkLayers } from './convert'
import type { Library } from './resolve'
import { prepareLayers } from './vectors'
import { DESIGNMD_SCHEMA, DmComponentSchema, DmEnvelopeSchema, type DmLayer, type DmWarning } from './schema'

/** A DesignMD file can hold a whole design system (tens of MB), so it is read as a file, not pasted. */
export const MAX_DESIGNMD_CHARS = 64 * 1024 * 1024
/** Components added in one go. The picker keeps the review screen and the project manageable. */
export const MAX_DESIGNMD_IMPORT = 50

export interface CatalogEntry {
  id: string
  name: string
  page: string
  variants: number
  layers: number
  properties: number
}

export interface DesignMdCatalog {
  /** Component or variant id -> the component it belongs to and the variant it is. Used to fill in nested components. */
  byAnyId: Map<string, { compId: string; variantId: string }>
  fileName?: string
  pluginVersion?: string
  entries: CatalogEntry[]
  components: Map<string, unknown>
  tokens: Record<string, unknown>
  warnings: DmWarning[]
}

/** The file is the index of a split export. Its components are in the files of the "components" folder next to it. */
export class DesignMdIndexError extends InputError {}

/** Alphabetical, ignoring case, with numbers in their natural order: "Item 2" before "Item 10". */
const byName = (a: CatalogEntry, b: CatalogEntry) =>
  a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }) || a.page.localeCompare(b.page, undefined, { numeric: true, sensitivity: 'base' }) || a.id.localeCompare(b.id)

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** True for text that looks like a DesignMD components file, so other inputs can point people here. */
export function looksLikeDesignMd(data: unknown): boolean {
  return isObj(data) && data.schema === DESIGNMD_SCHEMA
}

export function parseDesignMdText(text: string): DesignMdCatalog {
  if (text.length > MAX_DESIGNMD_CHARS) throw new InputError('That file is larger than 64 MB. Export fewer components, or import the files from the components folder.')
  if (!text.trim()) throw new InputError('Nothing to import. Choose the components.json file from DesignMD.')
  let data: unknown
  try { data = JSON.parse(text, safeReviver) } catch (e) {
    throw new InputError(`This is not valid JSON: ${e instanceof Error ? e.message : 'parse error'}.`)
  }
  if (!looksLikeDesignMd(data)) {
    throw new InputError(isObj(data) && typeof data.schema === 'string'
      ? `This file has the schema "${data.schema}". This tab reads "${DESIGNMD_SCHEMA}" from the DesignMD plugin.`
      : `This is not a DesignMD components file. It needs "schema": "${DESIGNMD_SCHEMA}". Select "components.json" in the plugin's export step.`)
  }
  const env = DmEnvelopeSchema.safeParse(data)
  if (!env.success) throw new InputError('The DesignMD file has problems and could not be read.', describeZodError(env.error))
  const file = env.data
  if (file.components.length === 0) {
    if (file.index?.componentCount) {
      throw new DesignMdIndexError('This components.json is only the index of a large export. The components are in separate files in the "components" folder next to it. Choose the whole export folder, or select those files (you can select several).')
    }
    throw new InputError('This file has no components.')
  }

  const components = new Map<string, unknown>()
  const byAnyId = new Map<string, { compId: string; variantId: string }>()
  const entries: CatalogEntry[] = []
  for (const c of file.components) {
    if (!isObj(c) || typeof c.id !== 'string' || typeof c.name !== 'string') continue
    if (components.has(c.id)) continue
    components.set(c.id, c)
    const defaultVariant = typeof c.defaultVariantId === 'string' ? c.defaultVariantId : c.id
    byAnyId.set(c.id, { compId: c.id, variantId: defaultVariant })
    for (const v of Array.isArray(c.variants) ? c.variants : []) if (isObj(v) && typeof v.id === 'string') byAnyId.set(v.id, { compId: c.id, variantId: v.id })
    let layers = 0
    walkLayers(c.tree as DmLayer | undefined, () => { layers++ })
    entries.push({
      id: c.id,
      name: c.name,
      page: typeof c.pageName === 'string' ? c.pageName.trim() : '',
      variants: Array.isArray(c.variants) ? c.variants.length : 0,
      layers,
      properties: Array.isArray(c.properties) ? c.properties.length : 0,
    })
  }
  if (!entries.length) throw new InputError('No readable components were found in this file.')
  entries.sort(byName)
  return { byAnyId, fileName: file.metadata?.fileName, pluginVersion: file.metadata?.pluginVersion, entries, components, tokens: file.tokens, warnings: file.warnings }
}

/** Several files (for example the per-component files of a split export) become one catalog. */
export function mergeCatalogs(list: DesignMdCatalog[]): DesignMdCatalog {
  const [first, ...rest] = list
  const merged: DesignMdCatalog = { ...first, byAnyId: new Map(first.byAnyId), entries: [...first.entries], components: new Map(first.components), tokens: { ...first.tokens }, warnings: [...first.warnings] }
  for (const c of rest) {
    for (const e of c.entries) if (!merged.components.has(e.id)) { merged.entries.push(e); merged.components.set(e.id, c.components.get(e.id)) }
    for (const [k, v] of c.byAnyId) if (!merged.byAnyId.has(k)) merged.byAnyId.set(k, v)
    Object.assign(merged.tokens, c.tokens)
    merged.warnings.push(...c.warnings)
  }
  merged.entries.sort(byName)
  return merged
}

/** Looks components of the file up by id, reading each one once. */
function libraryOf(cat: DesignMdCatalog): Library {
  const cache = new Map<string, ReturnType<typeof DmComponentSchema.safeParse>>()
  const converted = new Set<string>()
  return (id) => {
    const hit = cat.byAnyId.get(id)
    if (!hit) return undefined
    let parsed = cache.get(hit.compId)
    if (!parsed) { parsed = DmComponentSchema.safeParse(cat.components.get(hit.compId)); cache.set(hit.compId, parsed) }
    if (parsed.success && !converted.has(hit.compId)) {
      // A nested component is copied into another one from here, so its shapes must already be in the form the generators read.
      converted.add(hit.compId)
      prepareLayers(parsed.data.tree, parsed.data.variantDiffs)
    }
    return parsed.success ? { comp: parsed.data, variantId: hit.variantId } : undefined
  }
}

export function importDesignMd(cat: DesignMdCatalog, ids: string[]): ImportResult {
  const library = libraryOf(cat)
  const warnings: Warning[] = []
  const components: ComponentDef[] = []
  for (const id of ids.slice(0, MAX_DESIGNMD_IMPORT)) {
    const parsed = DmComponentSchema.safeParse(cat.components.get(id))
    if (!parsed.success) {
      const name = cat.entries.find((e) => e.id === id)?.name ?? id
      warnings.push({ level: 'warning', where: name, message: `Could not be read and was skipped: ${describeZodError(parsed.error, 2).join('; ')}` })
      continue
    }
    components.push(convertDesignMdComponent(parsed.data, cat.tokens, cat.warnings, { fileName: cat.fileName, pluginVersion: cat.pluginVersion }, warnings, library))
  }
  if (ids.length > MAX_DESIGNMD_IMPORT) warnings.push({ level: 'warning', message: `Only the first ${MAX_DESIGNMD_IMPORT} selected components were read. Import the rest in another round.` })
  if (!components.length) throw new InputError('None of the selected components could be read.', warnings.map((w) => w.message))
  return {
    components,
    warnings,
    uncertain: [],
    source: { kind: 'figma-plugin', label: [cat.fileName, cat.pluginVersion && `DesignMD ${cat.pluginVersion}`].filter(Boolean).join(' · ') || undefined, importedAt: new Date().toISOString() },
    assets: [],
  }
}
