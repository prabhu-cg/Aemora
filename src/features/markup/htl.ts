import { toKey } from '../components/detect'
import type { ComponentDef, Property } from '../components/schema'
import { htmlText, modelNames, modifier, slug } from './naming'
import type { Layer } from './layers'
import type { Node, Presence, Structure, Term } from './structure'
import type { MarkupNote } from './types'

const VOID = new Set(['img', 'hr', 'input'])
const INDENT = '  '

function condExpr(presence: Presence, names: Record<string, string>): string {
  const is = (t: Term, op: '==' | '!=') => `model.${names[t.factor.key!]}Modifier ${op} '${modifier(t.value)}'`
  const all = (terms: Term[]) => terms.map((t) => is(t, '==')).join(' && ')
  const manyOptions = presence.terms.some((t) => t.length > 1)
  if (!presence.negate) return presence.terms.map((t) => (manyOptions && presence.terms.length > 1 ? `(${all(t)})` : all(t))).join(' || ')
  if (!manyOptions) return presence.terms.map((t) => is(t[0], '!=')).join(' && ')
  return `!(${presence.terms.map((t) => `(${all(t)})`).join(' || ')})`
}

interface Ctx { tags: Map<Node, string>; names: Record<string, string>; block: string; props: Property[]; component: ComponentDef; modelFqn: string; notes: MarkupNote[]; rootTag: string; hiddenLabels: Node[]; linkUsed?: boolean }

function propFor(ctx: Ctx, ref?: string, layerId?: string, layer?: Layer): Property | undefined {
  if (ref) { const k = toKey(ref); const p = ctx.props.find((x) => x.key === k); if (p) return p }
  // A field made from a text layer remembers the layer, whether or not the suggestion was kept.
  const byLayer = layerId ? ctx.props.find((x) => x.origin.ref === layerId) : undefined
  if (byLayer || !layer || layer.type !== 'TEXT') return byLayer
  // The same text in another look of the component (the pill version of a tab) is another layer with another id:
  // it is the same field when it has the same name and says the same thing.
  const said = layer.text?.characters ?? ''
  return ctx.props.find((x) => x.origin.ref && x.type !== 'boolean' && x.label === layer.name && String(x.defaultValue ?? '') === said)
}

export function rootTagFor(component: ComponentDef, props: Property[], names: Record<string, string>): { tag: string; attrs: string[] } {
  if (component.type === 'button') {
    const link = props.find((p) => p.type === 'link')
    return link ? { tag: 'a', attrs: [`href="\${model.${names[link.key]}}"`] } : { tag: 'button', attrs: ['type="button"'] }
  }
  return { tag: 'div', attrs: [] }
}

/** Inside a link or button only phrasing content is valid, so containers, headings and nested buttons become spans. */
function inlineTag(d: { tag: string; attrs: string[] }): { tag: string; attrs: string[] } {
  return ['div', 'p', 'h2', 'button', 'a'].includes(d.tag) ? { tag: 'span', attrs: [] } : d
}

function describe(n: Node, ctx: Ctx, inline: boolean): { tag: string; attrs: string[] } {
  let d = describeTag(n, ctx)
  // A tag that cannot hold anything (hr, img, input) must not stand in for a layer that has layers inside it.
  if (VOID.has(d.tag) && n.children.length) d = { tag: 'div', attrs: [] }
  return inline ? inlineTag(d) : d
}

function describeTag(n: Node, ctx: Ctx): { tag: string; attrs: string[] } {
  const l = n.layer
  if (!n.parent) { const r = rootTagFor(ctx.component, ctx.props, ctx.names); ctx.rootTag = r.tag; return r }
  // A layer with a drawn shape is that drawing, inline, so the CSS can colour it like text.
  if (l.graphic && l.size) {
    const w = Math.round(l.size.width * 100) / 100, h = Math.round(l.size.height * 100) / 100
    return { tag: 'svg', attrs: [`viewBox="0 0 ${w} ${h}"`, `width="${w}"`, `height="${h}"`, 'aria-hidden="true"', 'focusable="false"'] }
  }
  switch (l.role) {
    case 'heading': return { tag: 'h2', attrs: [] }
    case 'text': case 'label': return { tag: n.children.length ? 'div' : ((l.text?.characters ?? '').length > 80 ? 'p' : 'span'), attrs: [] }
    case 'icon': {
      const p = propFor(ctx, l.propertyRefs?.mainComponent)
      // A fixed icon keeps the name of the Figma icon it was, so whoever builds the markup knows which one to draw.
      const fixed = !p && l.instanceOf?.componentName ? slug(l.instanceOf.componentName.split('/').pop() ?? '') : ''
      return { tag: 'span', attrs: [...(p ? [`data-icon="\${model.${ctx.names[p.key]}}"`] : fixed ? [`data-icon="${fixed}"`] : []), 'aria-hidden="true"'] }
    }
    case 'image': {
      const img = ctx.props.find((p) => p.type === 'image' && /image|img|photo|picture|src/i.test(p.key)) ?? ctx.props.find((p) => p.type === 'image')
      const alt = ctx.props.find((p) => /^alt|alt(text)?$/i.test(p.key))
      if (!img) ctx.notes.push({ level: 'warning', layer: l.name, message: 'This is an image, but the component has no image field, so its source is empty.' })
      return { tag: 'img', attrs: [`src="${img ? `\${model.${ctx.names[img.key]}}` : ''}"`, `alt="${alt ? `\${model.${ctx.names[alt.key]}}` : ''}"`] }
    }
    case 'divider': return { tag: 'hr', attrs: [] }
    case 'button': case 'link': {
      // The first button or link in a component that has a link field opens that link. Later ones keep a plain target.
      const field = ctx.rootTag === 'a' || ctx.linkUsed ? undefined : ctx.props.find((p) => p.type === 'link')
      if (field) { ctx.linkUsed = true; return { tag: 'a', attrs: [`href="\${model.${ctx.names[field.key]}}"`] } }
      return l.role === 'button' ? { tag: 'button', attrs: ['type="button"'] } : { tag: 'a', attrs: ['href="#"'] }
    }
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
  ctx.tags.set(n, d.tag)
  const cls = n.el ? `${ctx.block}__${n.el}` : `${ctx.block}${modifierClasses}`
  const l = n.layer

  const conds: string[] = []
  if (n.presence) conds.push(condExpr(n.presence, ctx.names))
  const vis = propFor(ctx, l.propertyRefs?.visible)
  if (vis?.type === 'boolean') conds.push(`model.${ctx.names[vis.key]}`)

  let content: string | null = null
  if (l.type === 'TEXT') {
    const p = propFor(ctx, l.propertyRefs?.characters, l.id, n.look ? l : undefined)
    if (p) {
      content = `\${model.${ctx.names[p.key]}${p.type === 'richtext' ? " @ context='html'" : ''}}`
      if (!p.required) conds.push(`model.${ctx.names[p.key]}`)
    } else {
      content = htmlText(l.text?.characters ?? '')
      if (content) ctx.notes.push({ level: 'info', layer: l.name, message: 'The text is fixed in the markup because no field drives it.' })
    }
  }
  if (l.role === 'slot') ctx.notes.push({ level: 'info', layer: l.name, message: 'This is a slot. An empty container was generated for it.' })

  const test = conds.length ? `data-sly-test="\${${conds.length > 1 ? conds.map((c) => (/\|\||&&/.test(c) ? `(${c})` : c)).join(' && ') : conds[0]}}"` : ''
  const attrs = [`class="${cls}"`, ...(test ? [test] : []), ...d.attrs, ...(!n.parent ? rootExtra(ctx) : [])].join(' ')
  if (d.tag === 'svg' && l.graphic) {
    const d2 = (p: { d: string; rule?: string }, extra: string) => `${pad}${INDENT}<path${extra} d="${p.d.replace(/"/g, '')}"${p.rule === 'EVENODD' ? ' fill-rule="evenodd" clip-rule="evenodd"' : ''}${extra ? '' : ' fill="currentColor"'}/>`
    const paths = [...l.graphic.fills.map((p) => d2(p, '')), ...(l.graphic.strokes ?? []).map((p) => d2(p, ` class="${cls}-stroke"`))]
    return [`${pad}<svg ${attrs}>`, ...paths, `${pad}</svg>`]
  }
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
  const label = ctx.hiddenLabels.map((h) => propFor(ctx, h.layer.propertyRefs?.characters, h.layer.id, h.look ? h.layer : undefined)).find(Boolean)
  if (!label) return []
  ctx.notes.push({ level: 'info', message: `A variant hides the text of "${label.label}", so the root gets aria-label="\${model.${ctx.names[label.key]}}" to keep an accessible name.` })
  return [`aria-label="\${model.${ctx.names[label.key]}}"`]
}

/** The HTL, and the tag each layer was written as. The CSS needs the tags to undo what browsers add to some of them. */
export function generateHtl(st: Structure, component: ComponentDef, block: string, modelFqn: string, hiddenLabels: Node[], notes: MarkupNote[]): { html: string; tags: Map<Node, string> } {
  const ctx: Ctx = { tags: new Map(), names: modelNames(component.properties.map((p) => p.key)), block, props: component.properties, component, modelFqn, notes, rootTag: 'div', hiddenLabels }
  const modifiers = st.factors.filter((f) => f.key).map((f) => ` ${block}--${slug(f.name)}-\${model.${ctx.names[f.key!]}Modifier}`).join('')
  const body = render(st.root, 0, ctx, modifiers)
  return { html: [`<sly data-sly-use.model="${modelFqn}"></sly>`, ...body].join('\n') + '\n', tags: ctx.tags }
}

/** Simple wrapper when there is no layer structure. */
export function generateFallbackHtl(component: ComponentDef, block: string, modelFqn: string): string {
  const names = modelNames(component.properties.map((p) => p.key))
  const root = rootTagFor(component, component.properties, names)
  const kids = component.properties
    .filter((p) => ['string', 'text', 'richtext'].includes(p.type))
    .map((p) => `${INDENT}<span class="${block}__${slug(p.key)}" data-sly-test="\${model.${names[p.key]}}">\${model.${names[p.key]}${p.type === 'richtext' ? " @ context='html'" : ''}}</span>`)
  return [`<sly data-sly-use.model="${modelFqn}"></sly>`, `<${root.tag} class="${block}"${root.attrs.length ? ' ' + root.attrs.join(' ') : ''}>`, ...kids, `</${root.tag}>`].join('\n') + '\n'
}
