import interUrl from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url'

/** 'default', a pseudo-class state, or `is-<name>` for a state the design has that scripts set with a class (selected, active ...). */
export type PreviewState = 'default' | 'hover' | 'focus' | 'pressed' | 'disabled' | `is-${string}`
export type Background = 'light' | 'dark'

/** The pseudo-class each state stands for. A state button appears only when the CSS styles it. */
export const STATES: { id: Exclude<PreviewState, 'default'>; label: string; pseudo: string }[] = [
  { id: 'hover', label: 'Hover', pseudo: ':hover' },
  { id: 'focus', label: 'Focus', pseudo: ':focus-visible' },
  { id: 'pressed', label: 'Pressed', pseudo: ':active' },
  { id: 'disabled', label: 'Disabled', pseudo: ':disabled' },
]

/** The design's own typeface when it is Inter, which most design systems use. Other fonts fall back to the system font. */
const FONT_CSS = `@font-face{font-family:"Inter";font-style:normal;font-weight:100 900;font-display:swap;src:url("${new URL(interUrl, typeof location === 'undefined' ? 'http://localhost/' : location.href).href}") format("woff2-variations")}`

export const FRAME_CSS = `html,body{margin:0}body{padding:16px;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#fff;color:#101828}body.pv-dark{background:#101828;color:#f2f4f7}:where(img[data-pv-nopic]){background-color:#e4e7ec;object-fit:cover}[data-pv-empty]{outline:1px dashed rgba(128,128,128,.7);outline-offset:-1px}`

/** The CSS with each state's pseudo-class swapped for a class, so a state can be shown without hovering. */
export function withStateClasses(css: string): string {
  return STATES.reduce((out, s) => out.split(s.pseudo).join(`.is-preview-${s.id}`), css)
}

/** Is this colour something you could not see on a white page: nothing, or white? */
function invisibleOnLight(color: string): boolean {
  const m = /rgba?\(([^)]+)\)/.exec(color)
  if (!m) return true
  const [r, g, b, a = '1'] = m[1].split(/[\s,/]+/).filter(Boolean)
  return Number(a) < 0.05 || [r, g, b].every((v) => Number(v) >= 245)
}

/**
 * Empty boxes that you could not otherwise see (an avatar, an icon the export has no shape for) get a dashed outline.
 * A box that has a fill, a border, a shadow or a drawing in it is drawn as it is.
 */
/** A white box shows up when what is behind it is not white: a coloured frame, a gradient. */
function onColoured(el: HTMLElement, win: Window): boolean {
  for (let p = el.parentElement; p && p !== el.ownerDocument.body; p = p.parentElement) {
    const cs = win.getComputedStyle(p)
    if (cs.backgroundImage !== 'none' || !invisibleOnLight(cs.backgroundColor)) return true
  }
  return false
}

function markPlaceholders(doc: Document, win: Window): void {
  for (const el of doc.body.querySelectorAll<HTMLElement>('*')) {
    el.removeAttribute('data-pv-empty')
    if (el.closest('svg') || el.children.length || el.textContent?.trim() || ['HR', 'IMG', 'INPUT', 'BR'].includes(el.tagName)) continue
    const cs = win.getComputedStyle(el)
    const painted = (!invisibleOnLight(cs.backgroundColor) || (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && onColoured(el, win))) || cs.backgroundImage !== 'none' || cs.boxShadow !== 'none' || (cs.borderTopWidth !== '0px' && cs.borderTopStyle !== 'none') || cs.outlineStyle !== 'none'
    if (!painted) el.setAttribute('data-pv-empty', '')
  }
}

/** A 1x1 transparent picture, so a picture with no source shows the box the design gave it and not a broken-image glyph. */
const CLEAR_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

const seen = new WeakSet<Document>()

export interface PaintOptions {
  css: string
  /** The rendered, cleaned markup. Its children are copied into the frame. */
  body: HTMLElement
  state: PreviewState
  bg: Background
  zoom: string
}

/** Puts the generated CSS and the rendered markup into a preview frame. Returns the height the content needs. */
export function paintFrame(doc: Document, o: PaintOptions): number | null {
  const win = doc.defaultView
  if (!doc.body || !win) return null
  const pseudo = o.state !== 'default' && !o.state.startsWith('is-')
  const sheets = [`${FONT_CSS}${FRAME_CSS}body{zoom:${o.zoom}}`, o.css, ...(pseudo ? [withStateClasses(o.css)] : [])]
  // Stylesheets are set through the CSS object model, which the page's content security policy allows. An inline <style> would be blocked.
  if ('adoptedStyleSheets' in doc && 'CSSStyleSheet' in win) {
    doc.adoptedStyleSheets = sheets.map((text) => { const s = new win.CSSStyleSheet(); s.replaceSync(text); return s })
  } else {
    doc.querySelectorAll('style[data-preview]').forEach((n) => n.remove())
    const style = doc.createElement('style')
    style.setAttribute('data-preview', '')
    style.textContent = sheets.join('\n')
    doc.head.appendChild(style)
  }
  doc.body.className = o.bg === 'dark' ? 'pv-dark' : ''
  doc.body.replaceChildren(...[...o.body.childNodes].map((n) => doc.importNode(n, true)))
  // Icons and pictures are not in the markup, only their names are. Hovering a dashed box says which one.
  doc.querySelectorAll('[data-icon]').forEach((el) => el.setAttribute('title', `Icon: ${el.getAttribute('data-icon')}`))
  // A picture with no source (the design had a photo, the component has no image field) is a grey box, not a broken-image glyph.
  doc.querySelectorAll('img').forEach((img) => {
    const noPic = () => { img.setAttribute('src', CLEAR_PIXEL); img.setAttribute('alt', ''); img.setAttribute('data-pv-nopic', '') }
    if (!img.getAttribute('src')?.trim()) noPic()
    else img.addEventListener('error', noPic, { once: true })
  })
  markPlaceholders(doc, win)
  const root = doc.body.firstElementChild
  if (root && o.state.startsWith('is-')) {
    root.classList.add(o.state)
    if (o.state === 'is-selected') root.setAttribute('aria-selected', 'true')
    if (o.state === 'is-checked') root.setAttribute('aria-checked', 'true')
  } else if (root && o.state !== 'default') {
    root.classList.add(`is-preview-${o.state}`)
    if (o.state === 'disabled') root.setAttribute('aria-disabled', 'true')
  }
  if (!seen.has(doc)) {
    seen.add(doc)
    // Links in the markup must not take the frame somewhere else.
    doc.addEventListener('click', (e) => { if ((e.target as Element | null)?.closest?.('a')) e.preventDefault() })
  }
  return doc.documentElement.scrollHeight
}
