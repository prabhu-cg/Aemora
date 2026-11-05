import { useEffect, useState } from 'react'
import { InputError, type ImportResult } from '../types'
import { parsePluginText, readPluginMessage } from '../plugin'
import { TextImportPanel } from './TextImportPanel'

export function PluginPanel({ onResult }: { onResult: (r: ImportResult) => void }) {
  const [status, setStatus] = useState('')
  const hasOpener = typeof window !== 'undefined' && !!window.opener

  useEffect(() => {
    if (!hasOpener) return
    const on = (e: MessageEvent) => {
      try {
        const res = readPluginMessage(e, window.opener)
        if (res) { onResult(res); setStatus('Received components from the Figma plugin. Review them below.') }
      } catch (err) {
        setStatus(err instanceof InputError ? `The plugin sent data Aemora could not read: ${err.message}` : 'The plugin sent data Aemora could not read.')
      }
    }
    window.addEventListener('message', on)
    return () => window.removeEventListener('message', on)
  }, [hasOpener, onResult])

  return (
    <div>
      <p className="mb-3 max-w-[70ch] text-[13px] text-ink-muted">
        A companion Figma plugin is planned but not required. Aemora already accepts its payload (<code>aemora.plugin/v1</code>, see <code>docs/figma-plugin-interface.md</code>) when pasted or uploaded here
        {hasOpener ? ', and is listening for a message from the window that opened it.' : '. When a plugin opens Aemora, it can also send the payload directly.'}
      </p>
      {status && <p role="status" className="mb-3 rounded-lg bg-info-soft p-3 text-[13px] text-info">{status}</p>}
      <TextImportPanel
        label="Plugin payload (JSON)"
        hint="Paste the JSON the plugin produced."
        placeholder={'{ "schema": "aemora.plugin/v1", "components": [ … ] }'}
        parse={parsePluginText}
        onResult={onResult}
      />
    </div>
  )
}
