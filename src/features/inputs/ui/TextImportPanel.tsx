import { useRef, useState, type ReactNode } from 'react'
import { ClipboardPaste, FileUp } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { InputError, MAX_INPUT_CHARS, type ImportResult } from '../types'

/** Shared textarea + file picker used by the JSON, clipboard and plugin inputs. */
export function TextImportPanel({ label, hint, placeholder, parse, onResult, extra, allowClipboardRead, submitLabel = 'Validate and review' }: {
  label: string
  hint: ReactNode
  placeholder: string
  parse: (text: string) => ImportResult
  onResult: (r: ImportResult) => void
  extra?: ReactNode
  allowClipboardRead?: boolean
  submitLabel?: string
}) {
  const [text, setText] = useState('')
  const [error, setError] = useState<{ message: string; issues: string[] } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const run = (value = text) => {
    try {
      onResult(parse(value))
      setError(null)
    } catch (e) {
      if (e instanceof InputError) setError({ message: e.message, issues: e.issues })
      else setError({ message: 'Something went wrong reading that input. Nothing was imported.', issues: [] })
    }
  }

  const pickFile = async (f?: File) => {
    if (!f) return
    if (f.size > MAX_INPUT_CHARS) return setError({ message: 'That file is larger than 2 MB.', issues: [] })
    const t = await f.text()
    setText(t)
    run(t)
    if (fileRef.current) fileRef.current.value = ''
  }

  const paste = async () => {
    try {
      const t = await navigator.clipboard.readText()
      setText(t)
      run(t)
    } catch {
      setError({ message: 'The browser did not allow reading the clipboard. Paste into the box with Ctrl+V or ⌘V instead.', issues: [] })
    }
  }

  return (
    <div>
      <p className="mb-3 max-w-[70ch] text-[13px] text-ink-muted">{hint}</p>
      <label htmlFor="import-text" className="mb-1 block text-[13px] font-bold text-ink-strong">{label}</label>
      <textarea
        id="import-text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        rows={10}
        spellCheck={false}
        className="w-full rounded-lg border border-hairline-strong bg-surface p-3 font-mono text-[12.5px] leading-relaxed text-ink-strong focus-visible:outline-2 focus-visible:outline-accent-text"
      />
      {error && (
        <div role="alert" className="mt-2 rounded-lg bg-danger-soft p-3 text-[13px] text-danger">
          <p className="font-bold">{error.message}</p>
          {error.issues.length > 0 && <ul className="mt-1 list-disc space-y-0.5 pl-5">{error.issues.map((i, k) => <li key={k}><code>{i}</code></li>)}</ul>}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button onClick={() => run()}>{submitLabel}</Button>
        <Button variant="outline" onClick={() => fileRef.current?.click()}><FileUp size={16} aria-hidden="true" />Choose file</Button>
        {allowClipboardRead && <Button variant="outline" onClick={paste}><ClipboardPaste size={16} aria-hidden="true" />Read clipboard</Button>}
        {extra}
        <input ref={fileRef} type="file" accept=".json,.txt,text/plain,application/json" className="sr-only" aria-label="Choose an input file" onChange={(e) => pickFile(e.target.files?.[0])} />
      </div>
    </div>
  )
}
