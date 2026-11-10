import { escapeAttr, safeName } from './serialize'
import { parseXml } from './validate'

const pad = (d: number) => '    '.repeat(d)

function writeElement(el: Element, depth: number, root: boolean): string {
  const attrs = [...el.attributes].map((a) => `${a.name}="${escapeAttr(a.value)}"`)
  const name = safeName(el.tagName)
  const open = `${pad(depth)}<${name}${attrs.map((a) => `\n${pad(depth + 1)}${a}`).join('')}`
  const parts: string[] = []
  for (const n of el.childNodes) {
    if (n.nodeType === 1) parts.push(writeElement(n as Element, depth + 1, false))
    else if (n.nodeType === 8) parts.push(`${pad(depth + 1)}<!--${n.nodeValue}-->`)
    else if (n.nodeType === 3 && n.nodeValue?.trim()) parts.push(`${pad(depth + 1)}${n.nodeValue.trim().replace(/&/g, '&amp;').replace(/</g, '&lt;')}`)
  }
  void root
  return parts.length ? `${open}>\n${parts.join('\n')}\n${pad(depth)}</${name}>` : `${open}/>`
}

/** Re-indent XML in Aemora's layout, keeping attribute order and comments. Throws a readable error if it is not well-formed. */
export function formatXml(xml: string): string {
  const { doc, result } = parseXml(xml)
  if (!doc) throw new Error(result.message ?? 'The XML is not well-formed.')
  const lead: string[] = []
  for (const n of doc.childNodes) if (n.nodeType === 8) lead.push(`<!--${n.nodeValue}-->`)
  return `<?xml version="1.0" encoding="UTF-8"?>\n${lead.map((c) => `${c}\n`).join('')}${writeElement(doc.documentElement, 0, true)}\n`
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** HTML for a syntax-highlighted view of XML. Everything from the document is escaped first. */
export function highlightXml(xml: string): string {
  return esc(xml)
    .replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="xml-comment">$1</span>')
    .replace(/(&lt;\?[\s\S]*?\?&gt;)/g, '<span class="xml-decl">$1</span>')
    .replace(/(&lt;\/?)([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*"[^"]*")*)\s*(\/?&gt;)/g, (_m, open, tag, attrs, close) =>
      `<span class="xml-punct">${open}</span><span class="xml-tag">${tag}</span>${String(attrs).replace(/([\w:.-]+)(\s*=\s*)("[^"]*")/g, '<span class="xml-attr">$1</span><span class="xml-punct">$2</span><span class="xml-value">$3</span>')}<span class="xml-punct">${close}</span>`)
}

/** Plain text for the editor overlay: escaped, no highlighting. */
export const highlightPlain = (text: string) => esc(text)

export type EditorLanguage = 'xml' | 'plain'
/** The only way editor text becomes HTML. Both routes escape the text first. */
export function highlight(text: string, language: EditorLanguage): string {
  return language === 'xml' ? highlightXml(text) : highlightPlain(text)
}
