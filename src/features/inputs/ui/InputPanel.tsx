import { useCallback, useEffect, useState } from 'react'
import { imageFrom } from '../clipboardImage'
import { parseClipboard } from '../clipboard'
import { parseComponentJson } from '../json'
import { SAMPLES } from '../samples'
import { Button } from '../../../components/ui/Button'
import type { ImportResult } from '../types'
import { DesignMdPanel } from './DesignMdPanel'
import { FigmaPanel } from './FigmaPanel'
import { PluginPanel } from './PluginPanel'
import { ReviewPanel } from './ReviewPanel'
import { ScreenshotPanel } from './ScreenshotPanel'
import { TextImportPanel } from './TextImportPanel'

/** The companion Figma plugin is not built yet. Flip to true to show the paste/upload tab again. */
export const SHOW_PLUGIN_TAB = false

const ALL_TABS = [
  { id: 'json', label: 'JSON' },
  { id: 'clipboard', label: 'Clipboard' },
  { id: 'designmd', label: 'DesignMD' },
  { id: 'figma', label: 'Figma API' },
  { id: 'plugin', label: 'Figma plugin' },
  { id: 'screenshot', label: 'Screenshot' },
] as const
type TabId = (typeof ALL_TABS)[number]['id']
const TABS = ALL_TABS.filter((t) => SHOW_PLUGIN_TAB || t.id !== 'plugin')

export function InputPanel({ onAdd, busy }: { onAdd: (r: ImportResult) => Promise<void>; busy: boolean }) {
  const [tab, setTab] = useState<TabId>('json')
  const [result, setResult] = useState<ImportResult | null>(null)
  const onResult = useCallback((r: ImportResult) => setResult(r), [])
  const [incoming, setIncoming] = useState<{ file: File; n: number } | null>(null)

  // A screenshot pasted anywhere while this panel is open goes to the Screenshot tab, whichever tab is showing.
  // Text pastes are left alone, so pasting JSON into the box still works.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = imageFrom(e.clipboardData)
      if (!file || e.clipboardData?.getData('text/plain')) return
      e.preventDefault()
      setTab('screenshot'); setResult(null); setIncoming({ file, n: Date.now() })
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [])

  return (
    <div>
      <div role="tablist" aria-label="Input method" className="flex flex-wrap gap-1 border-b border-hairline">
        {TABS.map((t) => (
          <button
            key={t.id} role="tab" id={`tab-${t.id}`} type="button" aria-selected={tab === t.id} aria-controls={`panel-${t.id}`}
            onClick={() => { setTab(t.id); setResult(null) }}
            className={`-mb-px h-9 cursor-pointer border-b-2 px-3 text-[14px] font-bold ${tab === t.id ? 'border-accent text-accent-text' : 'border-transparent text-ink hover:text-ink-strong'}`}
          >{t.label}</button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="pt-5">
        {tab === 'json' && (
          <JsonTab onResult={onResult} />
        )}
        {tab === 'clipboard' && (
          <TextImportPanel
            label="Copied component description"
            hint={<>Paste JSON, or structured text such as <code>Component: Button</code> followed by lines like <code>- Label: text, required</code>. Lines Aemora cannot read are shown for you to correct.</>}
            placeholder={'Component: Button [button]\n- Label: text, required, default=Learn more\n- Size: enum(small|medium|large)'}
            parse={parseClipboard} onResult={onResult} allowClipboardRead submitLabel="Parse and review"
          />
        )}
        {tab === 'designmd' && <DesignMdPanel onResult={onResult} />}
        {tab === 'figma' && <FigmaPanel onResult={onResult} />}
        {tab === 'plugin' && <PluginPanel onResult={onResult} />}
        {tab === 'screenshot' && <ScreenshotPanel onResult={onResult} incoming={incoming} />}
      </div>
      {result && (
        <ReviewPanel
          result={result} busy={busy} onChange={setResult} onDiscard={() => setResult(null)}
          onAdd={async () => { await onAdd(result); setResult(null) }}
        />
      )}
    </div>
  )
}

function JsonTab({ onResult }: { onResult: (r: ImportResult) => void }) {
  const [sample, setSample] = useState('')
  return (
    <TextImportPanel
      key={sample}
      label="Component JSON"
      hint={<>Format <code>aemora.components/v1</code>. The schema is at <a className="font-bold text-accent-text underline" href="./schemas/aemora-components-v1.json" target="_blank" rel="noreferrer">schemas/aemora-components-v1.json</a>. Properties Aemora cannot map are kept and flagged, never dropped.</>}
      placeholder={'{\n  "schema": "aemora.components/v1",\n  "components": [ … ]\n}'}
      parse={parseComponentJson} onResult={onResult}
      extra={
        <span className="flex items-center gap-1.5 text-[13px] text-ink-muted">Try a sample:
          {SAMPLES.map((s) => (
            <Button key={s.name} size="sm" variant="ghost" onClick={() => { try { onResult(parseComponentJson(s.json)); setSample(s.name) } catch { /* samples are valid */ } }}>{s.name}</Button>
          ))}
        </span>
      }
    />
  )
}
