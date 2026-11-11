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

/** A wait in the unit a person thinks in. */
export function humanWait(seconds: number): string {
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`
  if (seconds < 90) return plural(Math.round(seconds), 'second')
  if (seconds < 3600) return plural(Math.round(seconds / 60), 'minute')
  if (seconds < 86400) return `about ${plural(Math.round(seconds / 3600), 'hour')}`
  return `about ${plural(Math.round(seconds / 86400), 'day')}`
}

/** Waits of an hour or more are a used-up monthly allowance, not a busy moment: say so, and say what still works. */
function rateLimitMessage(secs: number | undefined, limitType: string | null): string {
  if (!secs) return 'Figma is rate limiting requests. Wait a minute and try again.'
  if (secs < 3600) return `Figma is rate limiting requests. Try again in ${humanWait(secs)}.`
  const seat = limitType?.toLowerCase() === 'low' ? ' Figma reports this account is on its lowest limit tier, which is what View and Collab seats get.' : ''
  return `Figma is rate limiting requests, and the wait is ${humanWait(secs)} (${secs} seconds). A wait that long means the allowance for this file has run out for the month. Figma sets it by the plan of the team the file is in and by your seat type, and free plans get the smallest.${seat} Importing with the DesignMD plugin export needs no Figma API requests, so use that to carry on now.`
}

/** One authenticated GET to api.figma.com, with every failure turned into a plain-language FigmaError. */
export async function figmaGetJson(url: string, token: string, fetchImpl: typeof fetch = fetch, signal?: AbortSignal): Promise<unknown> {
  if (!token.trim()) throw new FigmaError('missing-token', 'Add a Figma personal access token first. It is kept in memory for this session only.')
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
    throw new FigmaError('rate-limit', rateLimitMessage(secs, res.headers.get('X-Figma-Rate-Limit-Type')), secs)
  }
  if (!res.ok) throw new FigmaError('bad-response', `Figma returned an unexpected error (HTTP ${res.status}).`)

  try {
    return await res.json()
  } catch {
    throw new FigmaError('bad-response', 'Figma returned a response that is not valid JSON.')
  }
}

/**
 * Reads the file, or only the selected node when the URL had a node-id.
 * Uses the REST API directly from the browser; the token is sent only to api.figma.com.
 */
export async function fetchFigma({ ref, token, fetchImpl = fetch, signal }: FetchFigmaOptions): Promise<unknown> {
  const base = `https://api.figma.com/v1/files/${encodeURIComponent(ref.fileKey)}`
  // For chosen nodes, geometry=paths brings vector shapes and positions. A whole file would be too large to ask that of.
  const url = ref.nodeId ? `${base}/nodes?ids=${encodeURIComponent(ref.nodeId)}&geometry=paths` : `${base}?geometry=omit`
  return figmaGetJson(url, token, fetchImpl, signal)
}
