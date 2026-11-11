import type { ComponentDef } from '../components/schema'
import { prepareLayers } from '../inputs/designmd/vectors'

/** The parts of designmd.components/v1 layers that markup generation reads. */
export interface Gradient {
  kind: 'LINEAR' | 'RADIAL'
  /** CSS angle in degrees (linear). */
  angle?: number
  /** Stops as positions along the CSS gradient line, 0 to 1. */
  stops: { position: number; hex: string; alpha: number }[]
  /** Radial: center and radii as fractions of the layer's box. */
  center?: { x: number; y: number }
  radii?: { x: number; y: number }
}
export interface Paint { type: string; visible?: boolean; hex?: string; alpha?: number; description?: string; token?: { cssName?: string }; gradient?: Gradient }
/** The drawn shape of a vector layer, as SVG path data in the layer's own coordinates. */
export interface Graphic {
  fills: { d: string; rule?: 'EVENODD' | 'NONZERO' }[]
  strokes?: { d: string; rule?: 'EVENODD' | 'NONZERO' }[]
}
export interface Padding { top: number; right: number; bottom: number; left: number }
export interface Layout {
  mode: 'HORIZONTAL' | 'VERTICAL'; gap?: number; padding?: Padding
  primaryAlign?: 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN'; counterAlign?: 'MIN' | 'CENTER' | 'MAX' | 'BASELINE'
  sizingH?: 'FIXED' | 'HUG' | 'FILL'; sizingV?: 'FIXED' | 'HUG' | 'FILL'; wrap?: boolean
  /** The first layer is drawn on top (Figma's "first on top"). */
  reverseZIndex?: boolean
}
export interface Effect { type: string; visible?: boolean; color?: { hex?: string; alpha?: number; r?: number; g?: number; b?: number; a?: number }; offsetX?: number; offsetY?: number; radius?: number; spread?: number }
export interface UnitValue { value: number; unit: 'px' | 'percent' | 'auto' }
export interface TextProps {
  fontFamily?: string; fontWeight?: number; fontSize?: number; lineHeight?: UnitValue; letterSpacing?: UnitValue
  textCase?: string; textDecoration?: string; align?: string; characters?: string; mixed?: boolean
  /** NONE, WIDTH_AND_HEIGHT, HEIGHT or TRUNCATE: how the text box follows its text. */
  autoResize?: string
  italic?: boolean
}
export interface Radii { tl: number; tr: number; br: number; bl: number }

export interface LayerAttrs {
  role?: string; roleSource?: string; visible?: boolean
  size?: { width: number; height: number }
  layout?: Layout
  radius?: number | Radii
  opacity?: number
  fills?: Paint[]
  strokes?: { paints?: Paint[]; weight?: number; align?: string; sides?: { top: number; right: number; bottom: number; left: number }; dash?: number[] }
  effects?: Effect[]
  text?: TextProps
  instanceOf?: { componentId?: string; componentName?: string }
  propertyRefs?: { characters?: string; visible?: string; mainComponent?: string }
  /** Position in the containing frame (groups do not contain). Used for children that auto layout does not place. */
  position?: { x: number; y: number }
  layoutPositioning?: 'AUTO' | 'ABSOLUTE'
  /** How a layer that is not an auto-layout frame (text, a shape, an instance) is sized inside an auto-layout parent. Frames carry this in `layout`. */
  sizing?: { h?: 'FIXED' | 'HUG' | 'FILL'; v?: 'FIXED' | 'HUG' | 'FILL' }
  /** The 2x2 part of the layer's transform [a, b, c, d], only when it is not the identity (rotation, flip, skew). */
  transform?: [number, number, number, number]
  clipsContent?: boolean
  blendMode?: string
  graphic?: Graphic
}
export interface Layer extends LayerAttrs { id: string; name: string; type: string; children?: Layer[] }
export type LayerChanges = LayerAttrs

export interface VariantDiff {
  variantId: string
  variantProperties: Record<string, string>
  layers: { path: string; changes: LayerChanges }[]
  /** `index` is the position among the parent's children, when the plugin provides it. */
  added: { parentPath: string; index?: number; layer: Layer }[]
  removed: string[]
}

export interface DesignData {
  tree?: Layer
  variantDiffs: VariantDiff[]
  states: string[]
  sizes: string[]
  defaultVariantProperties?: Record<string, string>
  treeTruncated: boolean
}

const read = new WeakMap<object, DesignData>()

/**
 * The design data the DesignMD adapter stored on the component, or null when there is none.
 * A component imported with an older Aemora keeps the export's own field names, so its layers are brought up to date here
 * (on a copy, once), and nothing has to be imported again.
 */
export function readDesign(component: ComponentDef): DesignData | null {
  const d = component.meta.design as Record<string, unknown> | undefined
  if (!d || typeof d !== 'object' || (d.format !== 'designmd.components/v1' && d.format !== 'aemora.design/v1')) return null
  const hit = read.get(d)
  if (hit) return hit
  const out = readFresh(d)
  read.set(d, out)
  return out
}

function readFresh(source: Record<string, unknown>): DesignData {
  let d = source
  if (source.format === 'designmd.components/v1' && (source.tree || Array.isArray(source.variantDiffs))) {
    d = { ...source, tree: structuredClone(source.tree), variantDiffs: structuredClone(source.variantDiffs ?? []) }
    prepareLayers(d.tree, d.variantDiffs as unknown[])
  }
  const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])
  const tree = d.tree && typeof d.tree === 'object' ? (d.tree as Layer) : undefined
  return {
    tree,
    variantDiffs: arr<VariantDiff>(d.variantDiffs).map((v) => ({ ...v, layers: arr(v.layers), added: arr(v.added), removed: arr(v.removed), variantProperties: v.variantProperties ?? {} })),
    states: arr<string>(d.states),
    sizes: arr<string>(d.sizes),
    defaultVariantProperties: d.defaultVariantProperties as Record<string, string> | undefined,
    treeTruncated: d.treeTruncated === true,
  }
}

/** The name path the plugin uses to tell layers apart across variants. Same-name siblings get `[index]`. */
export function childPath(parentPath: string, layer: Layer, siblings: Layer[]): string {
  const same = siblings.filter((s) => s.name === layer.name)
  return same.length > 1 ? `${parentPath}/${layer.name}[${same.indexOf(layer)}]` : `${parentPath}/${layer.name}`
}
