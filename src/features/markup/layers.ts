import type { ComponentDef } from '../components/schema'

/** The parts of designmd.components/v1 layers that markup generation reads. */
export interface Paint { type: string; visible?: boolean; hex?: string; alpha?: number; description?: string; token?: { cssName?: string } }
export interface Padding { top: number; right: number; bottom: number; left: number }
export interface Layout {
  mode: 'HORIZONTAL' | 'VERTICAL'; gap?: number; padding?: Padding
  primaryAlign?: 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN'; counterAlign?: 'MIN' | 'CENTER' | 'MAX' | 'BASELINE'
  sizingH?: 'FIXED' | 'HUG' | 'FILL'; sizingV?: 'FIXED' | 'HUG' | 'FILL'; wrap?: boolean
}
export interface Effect { type: string; visible?: boolean; color?: { hex?: string; alpha?: number; r?: number; g?: number; b?: number; a?: number }; offsetX?: number; offsetY?: number; radius?: number; spread?: number }
export interface UnitValue { value: number; unit: 'px' | 'percent' | 'auto' }
export interface TextProps {
  fontFamily?: string; fontWeight?: number; fontSize?: number; lineHeight?: UnitValue; letterSpacing?: UnitValue
  textCase?: string; textDecoration?: string; align?: string; characters?: string; mixed?: boolean
}
export interface Radii { tl: number; tr: number; br: number; bl: number }

export interface LayerAttrs {
  role?: string; roleSource?: string; visible?: boolean
  size?: { width: number; height: number }
  layout?: Layout
  radius?: number | Radii
  opacity?: number
  fills?: Paint[]
  strokes?: { paints?: Paint[]; weight?: number; align?: string }
  effects?: Effect[]
  text?: TextProps
  instanceOf?: { componentId?: string; componentName?: string }
  propertyRefs?: { characters?: string; visible?: string; mainComponent?: string }
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

/** The design data the DesignMD adapter stored on the component, or null when there is none. */
export function readDesign(component: ComponentDef): DesignData | null {
  const d = component.meta.design as Record<string, unknown> | undefined
  if (!d || typeof d !== 'object' || d.format !== 'designmd.components/v1') return null
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
