import { useMemo, useRef, useState } from 'react'
import { FileUp, FolderOpen } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { DesignMdIndexError, importDesignMd, mergeCatalogs, parseDesignMdText, MAX_DESIGNMD_CHARS, MAX_DESIGNMD_IMPORT, type DesignMdCatalog } from '../designmd/parse'
import { InputError, type ImportResult } from '../types'

/** Reads components.json from the DesignMD Figma plugin, then lets the user pick which components to bring in. */
export function DesignMdPanel({ onResult }: { onResult: (r: ImportResult) => void }) {
  const [catalog, setCatalog] = useState<DesignMdCatalog | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [error, setError] = useState<{ message: string; issues: string[]; index?: boolean } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const folderRef = useRef<HTMLInputElement>(null)

  const fail = (e: unknown) => {
    setStatus('')
    setError(e instanceof InputError ? { message: e.message, issues: e.issues, index: e instanceof DesignMdIndexError } : { message: 'Something went wrong reading that file. Nothing was imported.', issues: [] })
  }

  /**
   * Reads one or many files. A split export has an index file next to a folder of component files: the index is
   * skipped when there is anything else to read, and files that are not DesignMD components are left out and counted.
   */
  const readFiles = async (list: FileList | null, fromFolder = false) => {
    const files = Array.from(list ?? []).filter((f) => !fromFolder || /\.json$/i.test(f.name))
    if (!files.length) {
      if (fromFolder && list?.length) fail(new InputError('That folder has no .json files. Choose the folder DesignMD exported, the one that holds components.json.'))
      return
    }
    setError(null); setCatalog(null); setPicked(new Set())
    try {
      const parts: DesignMdCatalog[] = []
      let index = 0, ignored = 0
      let firstError: unknown
      for (const [i, f] of files.entries()) {
        if (f.size > MAX_DESIGNMD_CHARS) { ignored++; firstError ??= new InputError(`${f.name} is larger than 64 MB.`); continue }
        if (i % 8 === 0) {
          setStatus(files.length > 1 ? `Reading ${i + 1} of ${files.length} files…` : `Reading ${f.name}…`)
          await new Promise((r) => setTimeout(r, 0)) // let the status paint between files
        }
        try { parts.push(parseDesignMdText(await f.text())) } catch (e) {
          if (e instanceof DesignMdIndexError) { index++; firstError ??= e } else { ignored++; firstError ??= e }
        }
      }
      if (!parts.length) throw firstError ?? new InputError('No DesignMD components were found.')
      const merged = mergeCatalogs(parts)
      setCatalog(merged)
      const skipped = [index ? `the index file` : '', ignored ? (ignored === 1 ? '1 file that is not a DesignMD component' : `${ignored} files that are not DesignMD components`) : ''].filter(Boolean)
      setStatus(`Found ${merged.entries.length} component${merged.entries.length === 1 ? '' : 's'}${files.length > 1 ? ` in ${parts.length} file${parts.length === 1 ? '' : 's'}` : ''}${skipped.length ? `. Skipped ${skipped.join(' and ')}.` : '.'}`)
      if (merged.entries.length === 1) setPicked(new Set([merged.entries[0].id]))
    } catch (e) { fail(e) }
    if (fileRef.current) fileRef.current.value = ''
    if (folderRef.current) folderRef.current.value = ''
  }

  const shown = useMemo(() => {
    if (!catalog) return []
    const q = query.trim().toLowerCase()
    return q ? catalog.entries.filter((e) => e.name.toLowerCase().includes(q) || e.page.toLowerCase().includes(q)) : catalog.entries
  }, [catalog, query])

  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const overLimit = picked.size > MAX_DESIGNMD_IMPORT

  const review = () => {
    if (!catalog) return
    try { onResult(importDesignMd(catalog, catalog.entries.filter((e) => picked.has(e.id)).map((e) => e.id))); setError(null) } catch (e) { fail(e) }
  }

  return (
    <div>
      <p className="mb-3 max-w-[70ch] text-[13px] text-ink-muted">
        Choose <code>components.json</code> from the DesignMD Figma plugin (format <code>designmd.components/v1</code>). It carries each component's properties, layer structure, layout, styles and variants. Large exports are split into a <code>components</code> folder: choose the whole export folder, or select those files.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => fileRef.current?.click()}><FileUp size={16} aria-hidden="true" />Choose DesignMD file</Button>
        <input ref={fileRef} type="file" multiple accept=".json,application/json" className="sr-only" aria-label="Choose DesignMD components file" onChange={(e) => readFiles(e.target.files)} />
        <Button variant="outline" onClick={() => folderRef.current?.click()}><FolderOpen size={16} aria-hidden="true" />Choose export folder</Button>
        {/* A folder picker is not in React's types. It reads every file in the folder, which is how a split export is chosen in one go. */}
        <input ref={(el) => { folderRef.current = el; el?.setAttribute('webkitdirectory', '') }} type="file" multiple className="sr-only" aria-label="Choose DesignMD export folder" onChange={(e) => readFiles(e.target.files, true)} />
        {status && <span role="status" className="text-[13px] text-ink-muted">{status}</span>}
      </div>
      {error && (
        <div role="alert" className="mt-3 rounded-lg bg-danger-soft p-3 text-[13px] text-danger">
          <p className="font-bold">{error.message}</p>
          {error.issues.length > 0 && <ul className="mt-1 list-disc space-y-0.5 pl-5">{error.issues.map((i, k) => <li key={k}><code>{i}</code></li>)}</ul>}
          {error.index && <Button size="sm" variant="outline" className="mt-2" onClick={() => folderRef.current?.click()}><FolderOpen size={14} aria-hidden="true" />Choose export folder</Button>}
        </div>
      )}
      {catalog && (
        <section aria-label="Choose components" className="mt-4 rounded-xl border border-hairline-strong">
          <div className="flex flex-wrap items-center gap-2 border-b border-hairline px-4 py-3">
            <label className="sr-only" htmlFor="dm-search">Search components</label>
            <input id="dm-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${catalog.entries.length} components`} className="h-9 min-w-52 flex-1 rounded-lg border border-hairline-strong bg-surface px-3 text-[14px]" />
            <Button size="sm" variant="outline" onClick={() => setPicked((s) => new Set([...s, ...shown.map((e) => e.id)]))} disabled={!shown.length}>Select shown</Button>
            <Button size="sm" variant="ghost" onClick={() => setPicked(new Set())} disabled={!picked.size}>Clear</Button>
          </div>
          <ul aria-label="Components in the file" className="max-h-80 divide-y divide-hairline overflow-y-auto">
            {shown.map((e) => (
              <li key={e.id}>
                <label className="flex cursor-pointer items-center gap-3 px-4 py-2 text-[14px] hover:bg-sand">
                  <input type="checkbox" checked={picked.has(e.id)} onChange={() => toggle(e.id)} className="size-4" />
                  <span className="min-w-0 flex-1">
                    <span className="font-bold text-ink-strong">{e.name}</span>
                    {e.page && <span className="ml-2 text-[12px] text-ink-muted">{e.page}</span>}
                  </span>
                  <span className="tabular text-[12px] text-ink-muted">{e.variants} variants · {e.properties} props · {e.layers} layers</span>
                </label>
              </li>
            ))}
            {!shown.length && <li className="px-4 py-6 text-center text-[13px] text-ink-muted">No components match “{query}”.</li>}
          </ul>
          <div className="flex flex-wrap items-center gap-3 border-t border-hairline px-4 py-3">
            <Button onClick={review} disabled={!picked.size}>Review {picked.size || ''} selected</Button>
            <span className={`text-[13px] ${overLimit ? 'text-warning' : 'text-ink-muted'}`} aria-live="polite">
              {overLimit ? `Only the first ${MAX_DESIGNMD_IMPORT} are read per import.` : `${picked.size} selected (up to ${MAX_DESIGNMD_IMPORT} per import)`}
            </span>
          </div>
        </section>
      )}
    </div>
  )
}
