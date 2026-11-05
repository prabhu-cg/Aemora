import { newId } from '../../../lib/id'
import type { Asset } from '../../components/schema'
import { sniffImageType, toBase64 } from '../screenshot'
import type { ImportResult, Warning } from '../types'
import { FigmaError, figmaGetJson } from './client'
import type { FigmaRef } from './ref'

/** A preview is a small picture, so each stays well within a project's size budget. */
export const PREVIEW_MAX_WIDTH = 720
export const PREVIEW_MAX_BYTES = 1_500_000
export const PREVIEW_MAX_COUNT = 12

/** Figma serves renders from its own image storage. Anything else is not fetched. */
const IMAGE_HOST = /(^|\.)amazonaws\.com$|(^|\.)figma\.com$/

export interface PreviewNode { nodeId: string; name: string; width?: number }

/** Render at most this wide: scale down big components, never blow small ones up. Steps of 0.05. */
export function previewScale(width: unknown): number {
  if (typeof width !== 'number' || !Number.isFinite(width) || width <= 0) return 1
  const s = Math.min(1, PREVIEW_MAX_WIDTH / width)
  return Math.max(0.05, Math.round(s * 20) / 20)
}

export function isFigmaImageUrl(raw: unknown): raw is string {
  if (typeof raw !== 'string') return false
  try {
    const u = new URL(raw)
    return u.protocol === 'https:' && IMAGE_HOST.test(u.hostname)
  } catch { return false }
}

/** Link back to the node in Figma, from the "fileKey:nodeId" we keep as a component's origin. */
export function figmaOpenUrl(originRef: string | undefined): string | null {
  if (!originRef) return null
  const [key, ...rest] = originRef.split(':')
  const node = rest.join(':')
  if (!/^[A-Za-z0-9]{10,40}$/.test(key) || !/^\d+:\d+(?::\d+)*$/.test(node)) return null
  return `https://www.figma.com/design/${key}?node-id=${node.replace(/:/g, '-')}`
}

export interface PreviewFetch { previews: Map<string, Asset>; problems: string[] }

/**
 * Ask Figma to render components as PNGs, then download those images. Never throws for a single bad
 * preview: a component without a picture is still a usable component. The token goes only to
 * api.figma.com; the image downloads carry no credentials.
 */
export async function fetchFigmaPreviews(opts: { ref: FigmaRef; token: string; nodes: PreviewNode[]; fetchImpl?: typeof fetch }): Promise<PreviewFetch> {
  const { ref, token, fetchImpl = fetch } = opts
  const previews = new Map<string, Asset>()
  const problems: string[] = []
  const nodes = opts.nodes.slice(0, PREVIEW_MAX_COUNT)
  if (opts.nodes.length > PREVIEW_MAX_COUNT) problems.push(`Only the first ${PREVIEW_MAX_COUNT} components got a preview. Import the rest from their own links to render them.`)

  const groups = new Map<number, PreviewNode[]>()
  for (const n of nodes) { const s = previewScale(n.width); groups.set(s, [...(groups.get(s) ?? []), n]) }

  for (const [scale, group] of groups) {
    const url = `https://api.figma.com/v1/images/${encodeURIComponent(ref.fileKey)}?ids=${group.map((g) => encodeURIComponent(g.nodeId)).join(',')}&format=png&scale=${scale}`
    let images: Record<string, unknown>
    try {
      const body = (await figmaGetJson(url, token, fetchImpl)) as { err?: unknown; images?: Record<string, unknown> }
      if (body?.err || !body?.images || typeof body.images !== 'object') throw new FigmaError('bad-response', 'Figma could not render previews for these components.')
      images = body.images
    } catch (e) {
      problems.push(e instanceof FigmaError ? e.message : 'Figma could not render previews.')
      if (e instanceof FigmaError && (e.kind === 'rate-limit' || e.kind === 'invalid-token' || e.kind === 'forbidden')) break
      continue
    }
    for (const n of group) {
      const src = images[n.nodeId]
      if (src === null || src === undefined) { problems.push(`Figma returned no picture for ${n.name}.`); continue }
      if (!isFigmaImageUrl(src)) { problems.push(`The picture for ${n.name} was not from Figma's image storage, so it was not downloaded.`); continue }
      try {
        const res = await fetchImpl(src, { credentials: 'omit', referrerPolicy: 'no-referrer' })
        if (!res.ok) throw new Error(String(res.status))
        const bytes = new Uint8Array(await res.arrayBuffer())
        if (bytes.length > PREVIEW_MAX_BYTES) { problems.push(`The preview for ${n.name} is ${(bytes.length / 1e6).toFixed(1)} MB, over the ${(PREVIEW_MAX_BYTES / 1e6).toFixed(1)} MB limit, so it was skipped.`); continue }
        if (sniffImageType(bytes) !== 'image/png') { problems.push(`The preview for ${n.name} was not a PNG image, so it was skipped.`); continue }
        previews.set(n.nodeId, { id: newId(), name: `${n.name} (Figma preview).png`.slice(0, 200), mime: 'image/png', bytes: bytes.length, dataUrl: `data:image/png;base64,${toBase64(bytes)}` })
      } catch {
        problems.push(`Could not download the preview for ${n.name}. The browser may have blocked the download.`)
      }
    }
  }
  return { previews, problems }
}

/** Add Figma renders to an import result. Components keep working if any or all previews fail. */
export async function attachFigmaPreviews(result: ImportResult, ref: FigmaRef, token: string, fetchImpl?: typeof fetch): Promise<ImportResult> {
  const nodes: PreviewNode[] = result.components.flatMap((c) => {
    const nodeId = typeof c.meta.figmaNodeId === 'string' ? c.meta.figmaNodeId : ''
    const size = c.meta.size as { width?: number } | undefined
    return nodeId ? [{ nodeId, name: c.name, width: size?.width }] : []
  })
  if (!nodes.length) return result
  const { previews, problems } = await fetchFigmaPreviews({ ref, token, nodes, fetchImpl })
  const warnings: Warning[] = [...result.warnings]
  for (const p of problems) warnings.push({ level: 'warning', message: p })
  if (previews.size) warnings.push({ level: 'info', message: 'Previews are pictures Figma rendered just now. They do not update by themselves, and Aemora does not read fields from them.' })
  return {
    ...result,
    warnings,
    assets: [...result.assets, ...previews.values()],
    components: result.components.map((c) => {
      const asset = previews.get(typeof c.meta.figmaNodeId === 'string' ? c.meta.figmaNodeId : '')
      return asset ? { ...c, previewAssetId: asset.id } : c
    }),
  }
}
