import { toKey } from '../components/detect'
import type { ComponentDef, Property } from '../components/schema'
import { htmlText, slug } from './naming'
import type { Factor, Node, Structure } from './structure'
import type { MarkupNote } from './types'

const VOID = new Set(['img', 'hr', 'input'])
const INDENT = '  '

function condExpr(factor: Factor, values: string[]): string {
  const getter = `model.${factor.key}Modifier`
  const absent = factor.values.filter((v) => !values.includes(v))
  return values.length <= absent.length
    ? values.map((v) => `${getter} == '${slug(v)}'`).join(' || ')
    : absent.map((v) => `${getter} != '${slug(v)}'`).join(' && ')
}

interface Ctx { block: string; props: Property[]; component: ComponentDef; modelFqn: string; notes: MarkupNote[]; rootTag: string; hiddenLabels: Node[] }

function propFor(ctx: Ctx, ref?: string, layerId?: string): Property | undefined {
  if (ref) { const k = toKey(ref); const p = ctx.props.find((x) => x.key === k); if (p) return p }
  return layerId ? ctx.props.find((x) => x.origin.suggested && x.origin.ref === layerId) : undefined
}

export function rootTagFor(component: ComponentDef, props: Property[]): { tag: string; attrs: string[] } {
  if (component.type === 'button') {
    const link = props.find((p) => p.type === 'link')
    return link ? { tag: 'a', attrs: [`href="\${model.${link.key}}"`] } : { tag: 'button', attrs: ['type="button"'] }
  }
  return { tag: 'div', attrs: [] }
}

/** Inside a link or button only phrasing content is valid, so containers, headings and nested buttons become spans. */
function inlineTag(d: { tag: string; attrs: string[] }): { tag: string; attrs: string[] } {
  return ['div', 'p', 'h2', 'button', 'a'].includes(d.tag) ? { tag: 'span', attrs: [] } : d
}

function describe(n: Node, ctx: Ctx, inline: boolean): { tag: string; attrs: string[] } {
  const d = describeTag(n, ctx)
  return inline ? inlineTag(d) : d
}

function describeTag(n: Node, ctx: Ctx): { tag: string; attrs: string[] } {
  const l = n.layer
  if (!n.parent) { const r = rootTagFor(ctx.component, ctx.props); ctx.rootTag = r.tag; return r }
  switch (l.role) {
    case 'heading': return { tag: 'h2', attrs: [] }
    case 'text': case 'label': return { tag: n.children.length ? 'div' : ((l.text?.characters ?? '').length > 80 ? 'p' : 'span'), attrs: [] }
    case 'icon': {
      const p = propFor(ctx, l.propertyRefs?.mainComponent)
      return { tag: 'span', attrs: [...(p ? [`data-icon="\${model.${p.key}}"`] : []), 'aria-hidden="true"'] }
    }
    case 'image': {
      const img = ctx.props.find((p) => p.type === 'image' && /image|img|photo|picture|src/i.test(p.key)) ?? ctx.props.find((p) => p.type === 'image')
      const alt = ctx.props.find((p) => /^alt/i.test(p.key))
      if (!img) ctx.notes.push({ level: 'warning', layer: l.name, message: 'This is an image, but the component has no image field, so its source is empty.' })
      return { tag: 'img', attrs: [`src="${img ? `\${model.${img.key}}` : ''}"`, `alt="${alt ? `\${model.${alt.key}}` : ''}"`] }
    }
    case 'divider': return { tag: 'hr', attrs: [] }
    case 'button': return { tag: 'button', attrs: ['type="button"'] }
    case 'link': return { tag: 'a', attrs: ['href="#"'] }
    case 'input':
      if (n.children.length) {
        ctx.notes.push({ level: 'info', layer: l.name, message: 'This looks like an input field, but it has layers inside. A plain container was generated, so add the real <input> by hand.' })
        return { tag: 'div', attrs: [] }
      }
      return { tag: 'input', attrs: ['type="text"'] }
    default: return { tag: l.type === 'TEXT' ? 'span' : 'div', attrs: [] }
  }
}

function render(n: Node, depth: number, ctx: Ctx, modifierClasses: string, inline = false): string[] {
  const pad = INDENT.repeat(depth)
  const d = describe(n, ctx, inline)
  const cls = n.el ? `${ctx.block}__${n.el}` : `${ctx.block}${modifierClasses}`
  const l = n.layer

  const conds: string[] = []
  if (n.presence?.factor.key) conds.push(condExpr(n.presence.factor, n.presence.values))
  const vis = propFor(ctx, l.propertyRefs?.visible)
  if (vis?.type === 'boolean') conds.push(`model.${vis.key}`)

  let content: string | null = null
  if (l.type === 'TEXT') {
    const p = propFor(ctx, l.propertyRefs?.characters, l.id)
    if (p) {
      content = `\${model.${p.key}${p.type === 'richtext' ? " @ context='html'" : ''}}`
      if (!p.required) conds.push(`model.${p.key}`)
    } else {
      content = htmlText(l.text?.characters ?? '')
      if (content) ctx.notes.push({ level: 'info', layer: l.name, message: 'The text is fixed in the markup because no field drives it.' })
    }
  }
  if (l.role === 'slot') ctx.notes.push({ level: 'info', layer: l.name, message: 'This is a slot. An empty container was generated for it.' })

  const test = conds.length ? `data-sly-test="\${${conds.length > 1 ? conds.map((c) => (/\|\||&&/.test(c) ? `(${c})` : c)).join(' && ') : conds[0]}}"` : ''
  const attrs = [`class="${cls}"`, ...(test ? [test] : []), ...d.attrs, ...(!n.parent ? rootExtra(ctx) : [])].join(' ')
  if (VOID.has(d.tag)) return [`${pad}<${d.tag} ${attrs}>`]
  if (content !== null && !n.children.length) return [`${pad}<${d.tag} ${attrs}>${content}</${d.tag}>`]
  const childInline = inline || d.tag === 'a' || d.tag === 'button'
  const kids = n.children.flatMap((c) => render(c, depth + 1, ctx, modifierClasses, childInline))
  if (!kids.length) return [`${pad}<${d.tag} ${attrs}></${d.tag}>`]
  return [`${pad}<${d.tag} ${attrs}>`, ...kids, `${pad}</${d.tag}>`]
}

/** An accessible name for the root when a variant hides its visible text. */
function rootExtra(ctx: Ctx): string[] {
  if (ctx.rootTag !== 'a' && ctx.rootTag !== 'button') return []
  const label = ctx.hiddenLabels.map((h) => propFor(ctx, h.layer.propertyRefs?.characters, h.layer.id)).find(Boolean)
  if (!label) return []
  ctx.notes.push({ level: 'info', message: `A variant hides the text of "${label.label}", so the root gets aria-label="\${model.${label.key}}" to keep an accessible name.` })
  return [`aria-label="\${model.${label.key}}"`]
}

export function generateHtl(st: Structure, component: ComponentDef, block: string, modelFqn: string, hiddenLabels: Node[], notes: MarkupNote[]): string {
  const ctx: Ctx = { block, props: component.properties, component, modelFqn, notes, rootTag: 'div', hiddenLabels }
  const modifiers = st.factors.filter((f) => f.key).map((f) => ` ${block}--${slug(f.name)}-\${model.${f.key}Modifier}`).join('')
  const body = render(st.root, 0, ctx, modifiers)
  return [`<sly data-sly-use.model="${modelFqn}"></sly>`, ...body].join('\n') + '\n'
}

/** Simple wrapper when there is no layer structure. */
export function generateFallbackHtl(component: ComponentDef, block: string, modelFqn: string): string {
  const root = rootTagFor(component, component.properties)
  const kids = component.properties
    .filter((p) => ['string', 'text', 'richtext'].includes(p.type))
    .map((p) => `${INDENT}<span class="${block}__${slug(p.key)}" data-sly-test="\${model.${p.key}}">\${model.${p.key}${p.type === 'richtext' ? " @ context='html'" : ''}}</span>`)
  return [`<sly data-sly-use.model="${modelFqn}"></sly>`, `<${root.tag} class="${block}"${root.attrs.length ? ' ' + root.attrs.join(' ') : ''}>`, ...kids, `</${root.tag}>`].join('\n') + '\n'
}
