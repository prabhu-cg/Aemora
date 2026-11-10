/**
 * The preview shows markup that may have been edited by hand, and values that people type, so everything
 * it renders is cleaned first: only known tags and attributes survive, and nothing can run script.
 * The preview frame is also sandboxed. This is the second lock on the same door.
 */

const KEEP_TAGS = new Set(['a', 'abbr', 'article', 'aside', 'b', 'blockquote', 'br', 'button', 'caption', 'cite', 'code', 'dd', 'div', 'dl', 'dt', 'em', 'figcaption', 'figure', 'footer', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'i', 'img', 'input', 'label', 'li', 'main', 'mark', 'nav', 'ol', 'p', 'pre', 'q', 's', 'section', 'small', 'span', 'strong', 'sub', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'time', 'tr', 'u', 'ul'])
/** Gone with everything inside, instead of unwrapped. */
const DROP_TAGS = new Set(['script', 'style', 'template', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'noscript', 'link', 'meta', 'base', 'title', 'head', 'svg', 'math', 'form', 'select', 'textarea', 'audio', 'video', 'canvas', 'dialog'])
const KEEP_ATTRS = new Set(['class', 'id', 'role', 'title', 'alt', 'href', 'src', 'width', 'height', 'type', 'disabled', 'hidden', 'lang', 'dir', 'colspan', 'rowspan', 'for', 'value', 'placeholder', 'checked', 'readonly', 'tabindex', 'datetime'])
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
export function sanitizeChildren(root: Node): void {
  for (const child of [...root.childNodes]) {
    if (child.nodeType === 3) continue
    if (child.nodeType !== 1) { root.removeChild(child); continue }
    const el = child as Element
    const tag = el.tagName.toLowerCase()
    if (DROP_TAGS.has(tag)) { root.removeChild(el); continue }
    if (!KEEP_TAGS.has(tag)) {
      // Unknown or custom tags (the <sly> helper, say) lose the tag and keep their content.
      while (el.firstChild) root.insertBefore(el.firstChild, el)
      root.removeChild(el)
      sanitizeChildren(root)
      return
    }
    cleanAttrs(el)
    sanitizeChildren(el)
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
