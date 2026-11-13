import { describe, expect, it } from 'vitest'
// Vitest blanks out CSS imports, so the stylesheets are read from disk. Runs in Node, never in the browser.
// @ts-expect-error node builtin, available at test time only
import { readFileSync } from 'node:fs'

const read = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8')
const tokensCss = read('./tokens.css')
const indexCss = read('../index.css')

/** WCAG 2.x contrast, computed from the actual design tokens: layout-free, so it works where jsdom cannot. */
const hex = (h: string) => { const n = h.replace('#', ''); return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16)) as [number, number, number] }
const lum = ([r, g, b]: [number, number, number]) => { const f = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
const ratio = (a: string, b: string) => { const [x, y] = [lum(hex(a)), lum(hex(b))]; return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }

function vars(css: string, selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`)
  if (start < 0) throw new Error(`no block for ${selector}`)
  const body = css.slice(start, css.indexOf('}', start))
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]))
}

const themes = { light: vars(tokensCss, ':root'), dark: vars(tokensCss, ':root.dark'), 'AEM preview skin': vars(indexCss, '.aem-skin') }

// [foreground token, background token, what it is]
const TEXT: [string, string, string][] = [
  ['ink', 'bg', 'body text'], ['ink', 'surface', 'text on cards'], ['ink', 'sand', 'text on sand bands'], ['ink', 'desk', 'text on the pale butter desk'],
  ['ink-strong', 'bg', 'headings'], ['ink-strong', 'sand', 'headings on sand'],
  ['ink-muted', 'bg', 'secondary text'], ['ink-muted', 'surface', 'secondary text on cards'], ['ink-muted', 'sand', 'secondary text on sand'], ['ink-muted', 'desk', 'secondary text on the desk'],
  ['accent-text', 'bg', 'accent text on page'], ['accent-text', 'sand', 'accent text on sand'], ['accent-text', 'accent-tint', 'accent text on its tint'],
  ['on-accent', 'accent', 'text on filled buttons'],
  ['danger', 'bg', 'error text'], ['danger', 'danger-soft', 'error text on its tint'],
  ['success', 'bg', 'success text'], ['success', 'success-soft', 'success text on its tint'],
  ['warning', 'bg', 'warning text'], ['warning', 'warning-soft', 'warning text on its tint'],
  ['info', 'bg', 'info text'], ['info', 'info-soft', 'info text on its tint'],
  ['bg', 'ink-strong', 'tooltip text'],
]

describe('text contrast meets WCAG AA (4.5:1) from the real tokens', () => {
  for (const [theme, v] of Object.entries(themes)) {
    describe(theme, () => {
      for (const [fg, bg, what] of TEXT) {
        if (!v[fg] || !v[bg]) continue
        it(`${what}: ${fg} on ${bg}`, () => {
          const r = ratio(v[fg], v[bg])
          expect(r, `${v[fg]} on ${v[bg]} is ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5)
        })
      }
    })
  }

  it('placeholder text, which is easy to make too faint', () => {
    for (const [theme, v] of Object.entries(themes)) {
      const r = ratio(v['ink-muted'], v.surface)
      expect(r, `${theme}: placeholder colour is ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('amber is a fill, never text: it cannot carry text on white, so the accent text token is the darker ochre', () => {
    expect(ratio(themes.light.accent, '#ffffff')).toBeLessThan(3)
    expect(ratio(themes.light['accent-text'], '#ffffff')).toBeGreaterThanOrEqual(4.5)
  })

  it('charcoal text on amber fills reaches AA in both themes (white on amber would not)', () => {
    for (const theme of ['light', 'dark'] as const) expect(ratio(themes[theme]['on-accent'], themes[theme].accent)).toBeGreaterThanOrEqual(4.5)
    expect(ratio('#ffffff', themes.light.accent)).toBeLessThan(4.5)
  })

  it('the outline of a text field reaches 3:1 on every surface it can sit on (WCAG 1.4.11)', () => {
    for (const [theme, v] of Object.entries(themes)) {
      for (const surface of ['bg', 'surface', 'desk', 'sand'] as const) {
        if (!v[surface]) continue
        const r = ratio(v['control-border'], v[surface])
        expect(r, `${theme}: control border on ${surface} is ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(3)
      }
    }
  })

  it('decorative dividers are allowed to be quieter, which is why fields do not use them', () => {
    expect(ratio(themes.light['hairline-strong'], themes.light.surface)).toBeLessThan(3)
  })
})
