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

export const FRAME_CSS = `html,body{margin:0}body{padding:16px;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#fff;color:#101828}body.pv-dark{background:#101828;color:#f2f4f7}body *:empty:not(hr):not(img):not(input):not(br){outline:1px dashed rgba(128,128,128,.7);outline-offset:-1px}`

/** The CSS with each state's pseudo-class swapped for a class, so a state can be shown without hovering. */
export function withStateClasses(css: string): string {
  return STATES.reduce((out, s) => out.split(s.pseudo).join(`.is-preview-${s.id}`), css)
}

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
