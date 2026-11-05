import { newId } from '../../lib/id'
import { classifyComponent, inferPropertyType, toKey, toLabel } from '../components/detect'
import { COMPONENT_TYPES, PROPERTY_TYPES, type Asset, type ComponentDef, type ComponentType, type Property, type PropertyType } from '../components/schema'
import { InputError, type ImportResult } from './types'

export interface Region { id: string; x: number; y: number; w: number; h: number }
export interface DraftProperty {
  id: string
  name: string
  type: PropertyType
  required: boolean
  defaultValue: string
  values: string
  regionId: string
}
export interface Draft { name: string; type: ComponentType | 'auto'; properties: DraftProperty[] }

export const emptyDraft = (): Draft => ({ name: '', type: 'auto', properties: [] })
export const newDraftProperty = (): DraftProperty => ({ id: newId(), name: '', type: 'string', required: false, defaultValue: '', values: '', regionId: '' })

export const clampRegion = (r: Region): Region => {
  const x = Math.min(100, Math.max(0, r.x)), y = Math.min(100, Math.max(0, r.y))
  return { ...r, x, y, w: Math.min(100 - x, Math.max(0.5, r.w)), h: Math.min(100 - y, Math.max(0.5, r.h)) }
}

/**
 * Turns what the user annotated by hand into the common import result. Nothing is detected
 * from pixels: every name, type and default here was typed by the user.
 */
export function buildScreenshotResult(draft: Draft, regions: Region[], asset: Asset | null): ImportResult {
  const problems: string[] = []
  const name = draft.name.trim()
  if (!name) problems.push('Give the component a name.')
  if (!draft.properties.length) problems.push('Add at least one property.')
  draft.properties.forEach((p, i) => { if (!p.name.trim()) problems.push(`Property ${i + 1} needs a name.`) })
  if (problems.length) throw new InputError('The component is not ready to review.', problems)

  const taken = new Set<string>()
  const properties: Property[] = draft.properties.map((p) => {
    const region = regions.find((r) => r.id === p.regionId)
    let key = toKey(p.name)
    for (let i = 2; taken.has(key); i++) key = `${toKey(p.name)}${i}`
    taken.add(key)
    const type = (PROPERTY_TYPES as readonly string[]).includes(p.type) ? p.type : inferPropertyType(p.name)
    const raw = p.defaultValue.trim()
    const defaultValue = raw === '' ? null : type === 'boolean' ? raw.toLowerCase() === 'true' : type === 'number' && Number.isFinite(Number(raw)) ? Number(raw) : raw
    return {
      id: newId(), key, label: toLabel(p.name), type, required: p.required, defaultValue,
      allowedValues: type === 'enum' ? p.values.split(',').map((v) => v.trim()).filter(Boolean) : [],
      description: '', group: '',
      origin: { kind: 'screenshot', suggested: false, assetId: asset?.id, region: region ? { x: region.x, y: region.y, w: region.w, h: region.h } : undefined },
    }
  })
  const type: ComponentType = draft.type !== 'auto' && (COMPONENT_TYPES as readonly string[]).includes(draft.type)
    ? draft.type : classifyComponent(name, properties.map((p) => p.label))
  const component: ComponentDef = {
    id: newId(), name, type, description: '', properties, unsupported: [], children: [],
    meta: asset ? { screenshot: asset.name } : {}, origin: { kind: 'screenshot', assetId: asset?.id, suggested: false },
  }
  return {
    components: [component],
    warnings: [{ level: 'info', message: 'Entered by hand from a screenshot. Aemora does not read pixels or Figma metadata from images, so check each property.' }],
    uncertain: [],
    source: { kind: 'screenshot', label: asset?.name, importedAt: new Date().toISOString() },
    assets: asset ? [asset] : [],
  }
}
