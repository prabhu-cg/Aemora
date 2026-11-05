import type { FigmaRef } from './ref'

export type FigmaErrorKind = 'invalid-token' | 'forbidden' | 'not-found' | 'rate-limit' | 'network' | 'bad-response' | 'missing-token'

export class FigmaError extends Error {
  kind: FigmaErrorKind
  retryAfterSeconds?: number
  constructor(kind: FigmaErrorKind, message: string, retryAfterSeconds?: number) {
    super(message)
    this.kind = kind
    this.retryAfterSeconds = retryAfterSeconds
  }
}

/**
 * The token lives only in this module's memory for the browser session. It is never
 * written to storage, to project data or exports, or to logs.
 */
let sessionToken = ''
export const figmaSession = {
  get: () => sessionToken,
  set: (t: string) => { sessionToken = t.trim() },
  clear: () => { sessionToken = '' },
  has: () => sessionToken.length > 0,
}

export interface FetchFigmaOptions {
  ref: FigmaRef
  token: string
  fetchImpl?: typeof fetch
  signal?: AbortSignal
}

/**
 * Reads the file, or only the selected node when the URL had a node-id.
 * Uses the REST API directly from the browser; the token is sent only to api.figma.com.
 */
export async function fetchFigma({ ref, token, fetchImpl = fetch, signal }: FetchFigmaOptions): Promise<unknown> {
  if (!token.trim()) throw new FigmaError('missing-token', 'Add a Figma personal access token first. It is kept in memory for this session only.')
  const base = `https://api.figma.com/v1/files/${encodeURIComponent(ref.fileKey)}`
  const url = ref.nodeId ? `${base}/nodes?ids=${encodeURIComponent(ref.nodeId)}&geometry=omit` : `${base}?geometry=omit`

  let res: Response
  try {
    res = await fetchImpl(url, { headers: { 'X-Figma-Token': token.trim() }, signal })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e
    throw new FigmaError('network', 'Could not reach Figma. Check your connection and that nothing is blocking api.figma.com.')
  }

  if (res.status === 401) throw new FigmaError('invalid-token', 'Figma rejected the token. Create a new personal access token with the file_content:read scope and try again.')
  if (res.status === 403) throw new FigmaError('forbidden', 'This token cannot read that file. Ask the file owner for view access, or use a token from an account that has it.')
  if (res.status === 404) throw new FigmaError('not-found', 'Figma could not find that file. Check the URL or file key.')
  if (res.status === 429) {
    const wait = Number(res.headers.get('Retry-After'))
    const secs = Number.isFinite(wait) && wait > 0 ? wait : undefined
    throw new FigmaError('rate-limit', `Figma is rate limiting requests.${secs ? ` Try again in ${secs} seconds.` : ' Wait a minute and try again.'}`, secs)
  }
  if (!res.ok) throw new FigmaError('bad-response', `Figma returned an unexpected error (HTTP ${res.status}).`)

  try {
    return await res.json()
  } catch {
    throw new FigmaError('bad-response', 'Figma returned a response that is not valid JSON.')
  }
}
