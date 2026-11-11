import { useRef, useState } from 'react'
import type { ComponentDef } from '../../components/schema'
import { Button } from '../../../components/ui/Button'
import { checkFidelity, type FidelityReport, type MismatchKind } from '../check'

const KIND_LABEL: Record<MismatchKind, string> = { size: 'Size', color: 'Colour', order: 'Order', missing: 'Present' }

/** Draws the component off screen, in a frame of its own, for the check. */
function offscreenDocument(): { doc: Document; done: () => void } | null {
  const frame = document.createElement('iframe')
  frame.setAttribute('sandbox', 'allow-same-origin')
  frame.setAttribute('aria-hidden', 'true')
  frame.tabIndex = -1
  Object.assign(frame.style, { position: 'fixed', left: '-10000px', top: '0', width: '1400px', height: '2400px', border: '0', visibility: 'hidden' })
  document.body.appendChild(frame)
  const doc = frame.contentDocument
  if (!doc) { frame.remove(); return null }
  return { doc, done: () => frame.remove() }
}

export function FidelityPanel({ component, html, css, blockClass }: { component: ComponentDef; html: string; css: string; blockClass: string }) {
  const [report, setReport] = useState<FidelityReport | null>(null)
  const [progress, setProgress] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const running = useRef(false)

  const run = async () => {
    if (running.current) return
    running.current = true
    setFailed(null)
    setReport(null)
    setProgress('Starting')
    // Let the button repaint before the check holds the page.
    await new Promise((r) => setTimeout(r, 30))
    const off = offscreenDocument()
    try {
      if (!off) throw new Error('The check frame could not be created.')
      const r = checkFidelity(component, html, css, blockClass, off.doc, (d, t) => setProgress(`Variant ${d} of ${t}`))
      if (!r) setFailed('This component has no layer structure from the design, so there is nothing to compare with.')
      else setReport(r)
    } catch (e) {
      setFailed(e instanceof Error ? e.message : 'The check failed.')
    } finally {
      off?.done()
      setProgress(null)
      running.current = false
    }
  }

  const pct = report ? Math.floor(report.score * 1000) / 10 : null
  return (
    <section aria-label="Fidelity check" className="mt-5 rounded-lg border border-hairline p-4">
      <h3 className="text-[13px] font-extrabold text-ink-strong">Check against the design</h3>
      <p className="mt-1 max-w-[70ch] text-[13px] text-ink-muted">
        Draws every option of this component and compares each layer with the design: size, colour, order, and whether it is there. It tells you where the result differs from Figma, so you do not have to find it by eye.
      </p>
      <div className="mt-3 flex items-center gap-3">
        <Button variant="outline" onClick={run} disabled={progress !== null}>{report ? 'Check again' : 'Run the check'}</Button>
        {progress && <span role="status" className="text-[13px] text-ink-muted">{progress}</span>}
      </div>
      {failed && <p role="alert" className="mt-3 rounded-lg bg-warning-soft p-2.5 text-[13px] text-warning">{failed}</p>}

      {report && (
        <div className="mt-4 space-y-3" aria-live="polite">
          <p className="text-[14px] font-bold text-ink-strong">
            {report.mismatches.length === 0 ? 'Every comparison held.' : `${pct}% of comparisons held, ${report.mismatches.length}${report.mismatches.length >= 300 ? '+' : ''} differ.`}
            <span className="ml-2 text-[12px] font-normal text-ink-muted">{report.variants - report.skippedVariants} of {report.variants} variants drawn</span>
          </p>
          <ul className="flex flex-wrap gap-2 text-[12px]">
            {(Object.keys(KIND_LABEL) as MismatchKind[]).map((k) => (
              <li key={k} className="rounded-md border border-hairline bg-surface px-2 py-1">
                <span className="font-bold text-ink-strong">{KIND_LABEL[k]}</span> {report.matched[k]} of {report.checked[k]}
              </li>
            ))}
          </ul>
          {report.mismatches.length > 0 && (
            <div className="max-h-72 overflow-auto rounded-md border border-hairline">
              <table className="w-full text-left text-[12px]">
                <thead className="sticky top-0 bg-sand text-ink-muted"><tr><th className="p-2">What</th><th className="p-2">Variant</th><th className="p-2">Layer</th><th className="p-2">Design</th><th className="p-2">Here</th></tr></thead>
                <tbody>
                  {report.mismatches.slice(0, 100).map((m, i) => (
                    <tr key={i} className="border-t border-hairline align-top">
                      <td className="p-2 font-bold">{KIND_LABEL[m.kind]}</td><td className="p-2">{m.variant}</td><td className="p-2 break-all">{m.path}</td><td className="p-2">{m.expected}</td><td className="p-2">{m.actual}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <details className="text-[12px] text-ink-muted">
            <summary className="cursor-pointer font-bold">What this check cannot see</summary>
            <ul className="mt-1 list-disc pl-5">{report.limits.map((l) => <li key={l}>{l}</li>)}</ul>
            {report.unmatched > 0 && <p className="mt-1">{report.unmatched} layers of the markup could not be matched to the design in some variants and were not compared.</p>}
          </details>
        </div>
      )}
    </section>
  )
}
