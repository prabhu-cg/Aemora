export interface FigmaRef {
  fileKey: string
  /** Node id in API form ("12:34"), when the URL pointed at a specific node. */
  nodeId?: string
}

/** Accepts a file URL (file/design/proto/board) or a bare file key. */
export function parseFigmaRef(input: string): FigmaRef | null {
  const s = input.trim()
  if (!s) return null
  if (/^[A-Za-z0-9]{10,40}$/.test(s)) return { fileKey: s }
  let url: URL
  try {
    url = new URL(s.startsWith('http') ? s : `https://${s}`)
  } catch {
    return null
  }
  if (!/(^|\.)figma\.com$/.test(url.hostname)) return null
  const m = /^\/(?:file|design|proto|board)\/([A-Za-z0-9]{10,40})/.exec(url.pathname)
  if (!m) return null
  const raw = url.searchParams.get('node-id')
  const nodeId = raw && /^\d+[-:]\d+(?:[-:]\d+)*$/.test(raw) ? raw.replace(/-/g, ':') : undefined
  return { fileKey: m[1], nodeId }
}
