import { newId } from '../../lib/id'
import { classifyComponent, inferPropertyType, normalizeTypeAlias, toKey, toLabel } from '../components/detect'
import { COMPONENT_TYPES, type ComponentDef, type ComponentType, type Property } from '../components/schema'
import { parseComponentJson } from './json'
import { InputError, MAX_INPUT_CHARS, type ImportResult, type UncertainLine, type Warning } from './types'

/**
 * Structured text format (documented in docs/clipboard-format.md):
 *
 *   Component: Button [button]
 *   - Label: text, required, default=Learn more
 *   - Size: enum(small|medium|large), default=medium
 *   - Opens in new tab: boolean
 *
 * JSON in the clipboard is detected and handed to the JSON adapter. Lines the parser
 * cannot interpret are returned as `uncertain` so the user can correct them.
 */
export function parseClipboard(text: string): ImportResult {
  if (text.length > MAX_INPUT_CHARS) throw new InputError('That input is larger than 2 MB.')
  const trimmed = text.trim()
  if (!trimmed) throw new InputError('The clipboard text is empty. Copy a component description first.')
  if (/^[[{]/.test(trimmed)) {
    const res = parseComponentJson(trimmed, 'clipboard')
    return res
  }

  const warnings: Warning[] = []
  const uncertain: UncertainLine[] = []
  const components: ComponentDef[] = []
  let current: ComponentDef | null = null
  const taken = new Map<string, Set<string>>()

  const lines = text.split(/\r?\n/)
  lines.forEach((raw, i) => {
    const lineNo = i + 1
    const line = raw.trim()
    if (!line || line.startsWith('#') || line.startsWith('//')) return

    const comp = /^component\s*[:=]\s*(.+)$/i.exec(line)
    if (comp) {
      const m = /^(.*?)\s*\[(\w+)\]\s*$/.exec(comp[1].trim())
      const name = (m ? m[1] : comp[1]).trim().slice(0, 120)
      const declared = m?.[2].toLowerCase()
      const type: ComponentType = declared && (COMPONENT_TYPES as readonly string[]).includes(declared) ? (declared as ComponentType) : 'custom'
      if (declared && type === 'custom' && declared !== 'custom') {
        warnings.push({ level: 'warning', where: name, message: `Component type "${declared}" is not supported. It will be detected from the name and properties.` })
      }
      current = {
        id: newId(), name, type, description: '', properties: [], unsupported: [], children: [], meta: {},
        origin: { kind: 'clipboard', ref: `line ${lineNo}`, suggested: false },
      }
      if (!m || type === 'custom') (current.meta as Record<string, unknown>).detectType = true
      taken.set(current.id, new Set())
      components.push(current)
      return
    }

    const prop = /^[-*•]\s*(.+?)\s*[:–—]\s*(.*)$/.exec(line) ?? /^[-*•]\s*([^:]+)$/.exec(line)
    if (prop && current) {
      current.properties.push(parseProperty(prop[1], prop[2] ?? '', lineNo, taken.get(current.id)!, warnings, current.name))
      return
    }
    if (prop && !current) {
      uncertain.push({ line: lineNo, text: line })
      return
    }
    // Free text right after a component line becomes its description.
    if (current && !current.description && !current.properties.length) {
      current.description = line.slice(0, 2000)
      return
    }
    uncertain.push({ line: lineNo, text: line })
  })

  if (!components.length) {
    throw new InputError(
      'No component found. Start with a line like "Component: Button", then list properties as "- Label: text, required". Or paste Aemora component JSON.',
      uncertain.slice(0, 5).map((u) => `Line ${u.line} was not understood: ${u.text}`),
    )
  }
  for (const c of components) {
    if (c.meta.detectType) {
      c.type = classifyComponent(c.name, c.properties.map((p) => p.label))
      delete c.meta.detectType
    }
  }
  if (uncertain.length) {
    warnings.push({ level: 'warning', message: `${uncertain.length} line${uncertain.length === 1 ? '' : 's'} could not be interpreted. Review them below and add what you need by hand.` })
  }
  return { components, warnings, uncertain, source: { kind: 'clipboard', importedAt: new Date().toISOString() }, assets: [] }
}

function splitTopLevel(s: string): string[] {
  const out: string[] = []
  let depth = 0, cur = ''
  for (const ch of s) {
    if (ch === '(') depth++
    if (ch === ')') depth = Math.max(0, depth - 1)
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = '' } else cur += ch
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

function parseProperty(name: string, rest: string, line: number, taken: Set<string>, warnings: Warning[], comp: string): Property {
  let type = null as ReturnType<typeof normalizeTypeAlias>
  let required = false
  let def: string | number | boolean | null = null
  let values: string[] = []
  const notes: string[] = []

  for (const tok of splitTopLevel(rest)) {
    const lower = tok.toLowerCase()
    const en = /^(?:enum|select|options?)\s*\(([^)]*)\)$/i.exec(tok)
    const dflt = /^default\s*[=:]\s*(.*)$/i.exec(tok)
    if (en) { type = 'enum'; values = en[1].split(/[|/]/).map((v) => v.trim()).filter(Boolean) }
    else if (/^[^,]+(\|[^,]+)+$/.test(tok)) { type = 'enum'; values = tok.split('|').map((v) => v.trim()).filter(Boolean) }
    else if (lower === 'required') required = true
    else if (lower === 'optional') required = false
    else if (dflt) def = coerceDefault(dflt[1])
    else if (!type && normalizeTypeAlias(tok)) type = normalizeTypeAlias(tok)
    else if (tok) notes.push(tok)
  }
  if (!type) {
    type = inferPropertyType(name, def)
    warnings.push({ level: 'info', where: `${comp} › ${name}`, message: `No type given. Detected "${type}" from the name (line ${line}).` })
  }
  let base = toKey(name)
  for (let i = 2; taken.has(base); i++) base = `${toKey(name)}${i}`
  taken.add(base)
  return {
    id: newId(), key: base, label: toLabel(name), type, required, defaultValue: def, allowedValues: values,
    description: notes.join(', '), group: '', origin: { kind: 'clipboard', ref: `line ${line}`, suggested: false },
  }
}

function coerceDefault(v: string): string | number | boolean {
  const t = v.trim().replace(/^["']|["']$/g, '')
  if (/^(true|false)$/i.test(t)) return t.toLowerCase() === 'true'
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t)
  return t
}
