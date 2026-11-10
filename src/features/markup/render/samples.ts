import type { Property } from '../../components/schema'
import { modelNames, modifier } from '../naming'

export type SampleValue = string | number | boolean | string[]

/** A 1x1 grey picture. The design sizes the image, so it stretches into a grey box. */
export const PLACEHOLDER_IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

/** What the preview starts with: the design's defaults, and plain stand-ins where the design has none. */
export function defaultSamples(props: Property[]): Record<string, SampleValue> {
  const out: Record<string, SampleValue> = {}
  for (const p of props) {
    const d = p.defaultValue
    switch (p.type) {
      case 'boolean': out[p.key] = d === true || String(d) === 'true'; break
      case 'number': out[p.key] = typeof d === 'number' ? d : Number.isFinite(Number(d)) && d !== null && d !== '' ? Number(d) : 1; break
      case 'enum': out[p.key] = typeof d === 'string' && d ? d : (p.allowedValues[0] ?? ''); break
      case 'image': out[p.key] = PLACEHOLDER_IMAGE; break
      case 'link': out[p.key] = typeof d === 'string' && d ? d : '#'; break
      case 'color': out[p.key] = typeof d === 'string' && d ? d : '#888888'; break
      case 'richtext': out[p.key] = typeof d === 'string' && d ? d : `<p>Sample ${p.label.toLowerCase()}</p>`; break
      case 'tags': case 'list': out[p.key] = []; break
      case 'date': out[p.key] = typeof d === 'string' ? d : ''; break
      default: out[p.key] = typeof d === 'string' && d ? d : `Sample ${p.label.toLowerCase()}`
    }
  }
  return out
}

/** The object `model` stands for in the HTL: each value under its model name, plus the class-name form of each enum. */
export function buildModel(props: Property[], samples: Record<string, SampleValue>): Record<string, unknown> {
  const names = modelNames(props.map((p) => p.key))
  const model: Record<string, unknown> = {}
  for (const p of props) {
    const v = samples[p.key]
    model[names[p.key]] = v
    if (p.type === 'enum') model[`${names[p.key]}Modifier`] = modifier(String(v ?? ''))
  }
  return model
}
