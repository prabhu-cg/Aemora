import { useRef, type UIEvent } from 'react'
import { highlight, type EditorLanguage } from '../format'

/**
 * A small XML editor: a transparent textarea over a highlighted copy of the same text, so it is
 * a real, accessible text field. Read-only mode is a native readOnly textarea.
 */
export function XmlEditor({ value, onChange, readOnly, label = 'XML', language = 'xml' }: { value: string; onChange: (v: string) => void; readOnly: boolean; label?: string; language?: EditorLanguage }) {
  const pre = useRef<HTMLPreElement>(null)
  const gutter = useRef<HTMLDivElement>(null)
  const lines = value.split('\n').length
  const sync = (e: UIEvent<HTMLTextAreaElement>) => {
    const t = e.currentTarget
    if (pre.current) { pre.current.scrollTop = t.scrollTop; pre.current.scrollLeft = t.scrollLeft }
    if (gutter.current) gutter.current.scrollTop = t.scrollTop
  }
  const shared = 'm-0 whitespace-pre p-3 font-mono text-[12.5px] leading-[1.55] tab-size-4'
  return (
    <div className={`flex overflow-hidden rounded-lg border bg-surface ${readOnly ? 'border-hairline' : 'border-hairline-strong'}`} style={{ height: '28rem' }}>
      <div ref={gutter} aria-hidden="true" className={`${shared} w-12 shrink-0 select-none overflow-hidden border-r border-hairline bg-sand text-right text-ink-muted tabular`}>
        {Array.from({ length: lines }, (_, i) => i + 1).join('\n')}
      </div>
      <div className="relative min-w-0 flex-1">
        <pre ref={pre} aria-hidden="true" className={`${shared} pointer-events-none absolute inset-0 overflow-auto text-ink-strong`} dangerouslySetInnerHTML={{ __html: highlight(value, language) + '\n' }} />
        <textarea
          aria-label={label}
          value={value}
          readOnly={readOnly}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          wrap="off"
          onChange={(e) => onChange(e.target.value)}
          onScroll={sync}
          onKeyDown={(e) => {
            // Tab inserts spaces in edit mode instead of leaving the field. Escape lets keyboard users out.
            if (readOnly || e.key !== 'Tab' || e.shiftKey) return
            e.preventDefault()
            const t = e.currentTarget
            const { selectionStart: a, selectionEnd: z } = t
            onChange(`${value.slice(0, a)}    ${value.slice(z)}`)
            requestAnimationFrame(() => { t.selectionStart = t.selectionEnd = a + 4 })
          }}
          className={`${shared} absolute inset-0 h-full w-full resize-none overflow-auto bg-transparent text-transparent caret-[var(--ink-strong)] outline-none selection:bg-accent/30 ${readOnly ? 'cursor-default' : ''}`}
        />
      </div>
    </div>
  )
}
