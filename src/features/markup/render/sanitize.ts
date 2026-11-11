/**
 * The preview shows markup that may have been edited by hand, and values that people type, so everything
 * it renders is cleaned first: only known tags and attributes survive, and nothing can run script.
 * The preview frame is also sandboxed. This is the second lock on the same door.
 */

const KEEP_TAGS = new Set(['a', 'abbr', 'article', 'aside', 'b', 'blockquote', 'br', 'button', 'caption', 'cite', 'code', 'dd', 'div', 'dl', 'dt', 'em', 'figcaption', 'figure', 'footer', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'i', 'img', 'input', 'label', 'li', 'main', 'mark', 'nav', 'ol', 'p', 'pre', 'q', 's', 'section', 'small', 'span', 'strong', 'sub', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'time', 'tr', 'u', 'ul'])
/** Gone with everything inside, instead of unwrapped. */
const DROP_TAGS = new Set(['script', 'style', 'template', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'noscript', 'link', 'meta', 'base', 'title', 'head', 'math', 'form', 'select', 'textarea', 'audio', 'video', 'canvas', 'dialog'])
const KEEP_ATTRS = new Set(['class', 'id', 'role', 'title', 'alt', 'href', 'src', 'width', 'height', 'type', 'disabled', 'hidden', 'lang', 'dir', 'colspan', 'rowspan', 'for', 'value', 'placeholder', 'checked', 'readonly', 'tabindex', 'datetime'])
/** The drawing tags kept: shapes only. No scripts, styles, references, images, filters or animation. */
const SVG_TAGS = new Set(['svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon'])
const SVG_DROP = new Set(['foreignobject', 'use', 'image', 'animate', 'animatetransform', 'animatemotion', 'set', 'defs', 'mask', 'clippath', 'filter', 'lineargradient', 'radialgradient', 'pattern', 'symbol', 'marker', 'text', 'tspan', 'a', 'switch'])
const SVG_ATTRS = new Set(['d', 'viewbox', 'width', 'height', 'fill', 'fill-rule', 'clip-rule', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'stroke-opacity', 'transform', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'points', 'opacity', 'focusable', 'preserveaspectratio', 'class', 'role'])
const PATH_DATA = /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\s+-]*$/
const NUMBERS = /^[0-9eE.,\s+-]*$/
const PAINT = /^(none|currentcolor|#[0-9a-f]{3,8}|rgba?\([0-9.,\s%]+\)|[a-z]{3,20})$/i
const TRANSFORM = /^([a-z]+\([0-9eE.,\s+-]*\)\s*)+$/i

/** A drawing attribute is kept only when its value is plain: path data, numbers, a colour, a simple transform. Never a reference. */
function svgValueOk(name: string, value: string): boolean {
  const v = value.trim()
  if (name === 'd') return PATH_DATA.test(v)
  if (name === 'transform') return TRANSFORM.test(v)
  if (name === 'fill' || name === 'stroke') return PAINT.test(v)
  if (name === 'class' || name === 'role' || name === 'focusable' || name === 'preserveaspectratio' || name === 'fill-rule' || name === 'clip-rule' || name.startsWith('stroke-line')) return /^[\w\s-]*$/.test(v)
  return NUMBERS.test(v) || /^[0-9.]+(px|%)?$/.test(v)
}

const INPUT_TYPES = new Set(['text', 'checkbox', 'radio', 'email', 'number', 'search', 'tel', 'url', 'button'])
const BUTTON_TYPES = new Set(['button'])

const hasScheme = (u: string) => /^[a-z][a-z0-9+.-]*:/i.test(u)

function safeUrl(value: string, attr: 'href' | 'src'): boolean {
  // Browsers ignore tabs, line breaks and spaces inside a URL's scheme, so "java<tab>script:" must not slip past.
  const u = [...value].filter((c) => c.charCodeAt(0) > 32 && c.charCodeAt(0) !== 160).join('')
  if (!hasScheme(u)) return !u.startsWith('//')
  if (attr === 'href') return /^(https?:|mailto:|tel:)/i.test(u)
  return /^https?:/i.test(u) || /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=]+$/i.test(u)
}

function cleanSvgAttrs(el: Element): void {
  for (const a of [...el.attributes]) {
    const n = a.name.toLowerCase()
    const ok = (n.startsWith('aria-') || SVG_ATTRS.has(n)) && !n.startsWith('on') && !/url\s*\(|javascript:/i.test(a.value) && (n.startsWith('aria-') || svgValueOk(n, a.value))
    if (!ok) el.removeAttribute(a.name)
  }
}

function cleanAttrs(el: Element): void {
  const tag = el.tagName.toLowerCase()
  for (const a of [...el.attributes]) {
    const n = a.name.toLowerCase()
    let ok = n.startsWith('aria-') || n.startsWith('data-') || KEEP_ATTRS.has(n)
    if (n.startsWith('on')) ok = false
    if (ok && (n === 'href' || n === 'src') && (!safeUrl(a.value, n) || (n === 'href' && tag !== 'a') || (n === 'src' && tag !== 'img'))) ok = false
    if (ok && n === 'type' && !((tag === 'input' && INPUT_TYPES.has(a.value.toLowerCase())) || (tag === 'button' && BUTTON_TYPES.has(a.value.toLowerCase())))) ok = false
    if (!ok) el.removeAttribute(a.name)
  }
  if (tag === 'a') { el.setAttribute('rel', 'noopener noreferrer'); el.removeAttribute('target') }
}

/** Cleans a tree in place. The root itself is not inspected, only what it holds. */
export function sanitizeChildren(root: Node, inSvg = false): void {
  for (const child of [...root.childNodes]) {
    if (child.nodeType === 3) continue
    if (child.nodeType !== 1) { root.removeChild(child); continue }
    const el = child as Element
    const tag = el.tagName.toLowerCase()
    if (DROP_TAGS.has(tag) || (inSvg && SVG_DROP.has(tag))) { root.removeChild(el); continue }
    if (SVG_TAGS.has(tag) && (inSvg || tag === 'svg')) { cleanSvgAttrs(el); sanitizeChildren(el, true); continue }
    if (!KEEP_TAGS.has(tag)) {
      // Unknown or custom tags (the <sly> helper, say) lose the tag and keep their content.
      while (el.firstChild) root.insertBefore(el.firstChild, el)
      root.removeChild(el)
      sanitizeChildren(root, inSvg)
      return
    }
    cleanAttrs(el)
    sanitizeChildren(el, inSvg)
  }
}

/** Markup text as a cleaned fragment of the given (inert) document. */
export function sanitizeHtml(html: string, doc: Document): DocumentFragment {
  const parsed = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  sanitizeChildren(parsed.body)
  const frag = doc.createDocumentFragment()
  for (const n of [...parsed.body.childNodes]) frag.appendChild(doc.importNode(n, true))
  return frag
}
