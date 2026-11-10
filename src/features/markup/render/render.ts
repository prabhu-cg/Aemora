import { evaluate, ExprError, INTERPOLATION, splitOptions, truthy, type Model } from './expr'
import { sanitizeChildren, sanitizeHtml } from './sanitize'

export interface Rendered {
  /** The rendered, cleaned page content, in a document of its own. Import it into the frame. */
  body: HTMLElement
  /** What the preview could not do. Never silently skipped. */
  problems: string[]
}

const SUPPORTED_SLY = new Set(['data-sly-test', 'data-sly-use'])

/**
 * Renders HTL the way AEM would, for the parts of HTL the generator writes: the model, conditions,
 * and expressions in text and attributes. Everything else is reported in `problems`.
 */
export function renderHtl(source: string, model: Model): Rendered {
  const doc = new DOMParser().parseFromString(`<body>${source}</body>`, 'text/html')
  const problems = new Set<string>()

  const value = (inner: string): { value: unknown; html: boolean } => {
    const { expr, html } = splitOptions(inner)
    try { return { value: evaluate(expr, model), html } } catch (e) {
      problems.add(e instanceof ExprError ? `Could not evaluate \${${inner}}: ${e.message}` : `Could not evaluate \${${inner}}.`)
      return { value: undefined, html }
    }
  }
  const asText = (v: unknown) => (v === undefined || v === null || v === false ? '' : Array.isArray(v) ? v.join(', ') : String(v))

  const visit = (parent: Node): void => {
    for (const child of [...parent.childNodes]) {
      if (child.nodeType === 3) { expandText(child as Text); continue }
      if (child.nodeType !== 1) continue
      const el = child as Element

      // Conditions first: a layer that is not shown is never looked at again.
      let shown = true
      for (const a of [...el.attributes]) {
        if (!a.name.startsWith('data-sly-')) continue
        const base = a.name.split('.')[0]
        if (base === 'data-sly-test') {
          const m = /^\$\{([\s\S]*)\}$/.exec(a.value.trim())
          if (!m) { problems.add('A data-sly-test was not a single expression.'); continue }
          if (!truthy(value(m[1]).value)) shown = false
        } else if (!SUPPORTED_SLY.has(base)) problems.add(`${a.name} is not supported by the preview, so it was ignored.`)
        el.removeAttribute(a.name)
      }
      if (!shown) { parent.removeChild(el); continue }

      for (const a of [...el.attributes]) {
        if (!a.value.includes('${')) continue
        const whole = /^\$\{([\s\S]*)\}$/.exec(a.value.trim())
        if (whole && !a.value.trim().slice(2).includes('${')) {
          const v = value(whole[1]).value
          if (v === undefined || v === null || v === false || v === '') el.removeAttribute(a.name)
          else el.setAttribute(a.name, v === true ? '' : asText(v))
        } else {
          el.setAttribute(a.name, a.value.replace(INTERPOLATION, (_m, inner: string) => asText(value(inner).value)))
        }
      }
      visit(el)
    }
  }

  const expandText = (node: Text): void => {
    const text = node.nodeValue ?? ''
    if (!text.includes('${')) return
    const frag = doc.createDocumentFragment()
    let last = 0
    for (const m of text.matchAll(INTERPOLATION)) {
      frag.appendChild(doc.createTextNode(text.slice(last, m.index)))
      const r = value(m[1])
      if (r.html) frag.appendChild(sanitizeHtml(asText(r.value), doc))
      else frag.appendChild(doc.createTextNode(asText(r.value)))
      last = (m.index ?? 0) + m[0].length
    }
    frag.appendChild(doc.createTextNode(text.slice(last)))
    node.parentNode?.replaceChild(frag, node)
  }

  visit(doc.body)
  sanitizeChildren(doc.body)
  return { body: doc.body, problems: [...problems] }
}
