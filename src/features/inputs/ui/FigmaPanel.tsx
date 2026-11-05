import { useRef, useState } from 'react'
import { Button } from '../../../components/ui/Button'
import { TextField } from '../../../components/ui/Field'
import { FigmaError, fetchFigma, figmaSession } from '../figma/client'
import { parseFigmaResponse } from '../figma/parse'
import { parseFigmaRef } from '../figma/ref'
import type { ImportResult } from '../types'

export function FigmaPanel({ onResult }: { onResult: (r: ImportResult) => void }) {
  const [url, setUrl] = useState('')
  const [token, setToken] = useState(figmaSession.get())
  const [error, setError] = useState('')
  const [urlError, setUrlError] = useState('')
  const [loading, setLoading] = useState(false)
  const abort = useRef<AbortController | null>(null)

  const run = async () => {
    setError(''); setUrlError('')
    const ref = parseFigmaRef(url)
    if (!ref) return setUrlError('Enter a Figma file URL (figma.com/design/…) or a file key.')
    figmaSession.set(token)
    abort.current = new AbortController()
    setLoading(true)
    try {
      const json = await fetchFigma({ ref, token: figmaSession.get(), signal: abort.current.signal })
      onResult(parseFigmaResponse(json, { fileKey: ref.fileKey, requestedNodeId: ref.nodeId }))
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') setError('Cancelled.')
      else setError(e instanceof FigmaError ? e.message : 'Could not read the Figma response.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-xl">
      <p className="mb-4 text-[13px] text-ink-muted">
        Aemora reads component names, variants, component properties, text layers, visibility and size from the Figma REST API. Visual styling is not turned into authoring fields.
      </p>
      <div className="flex flex-col gap-4">
        <TextField label="Figma file URL or file key" value={url} onChange={(e) => setUrl(e.target.value)} error={urlError} placeholder="https://www.figma.com/design/AbC…/File?node-id=1-2" hint="Include node-id in the URL to read just that component." autoComplete="off" />
        <TextField label="Personal access token" type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" spellCheck={false} hint="Needs the file_content:read scope. Kept in memory for this session only. Never saved, exported or logged." />
      </div>
      {error && <p role="alert" className="mt-3 rounded-lg bg-danger-soft p-3 text-[13px] font-semibold text-danger">{error}</p>}
      <div className="mt-4 flex gap-2">
        <Button onClick={run} disabled={loading}>{loading ? 'Reading Figma…' : 'Read components'}</Button>
        {loading && <Button variant="ghost" onClick={() => abort.current?.abort()}>Cancel</Button>}
        <Button variant="ghost" onClick={() => { figmaSession.clear(); setToken('') }} disabled={!token}>Forget token</Button>
      </div>
    </div>
  )
}
