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
/** A foreground at a given opacity over a background, as the eye sees it. */
const over = (fg: string, bg: string, alpha: number) => { const [f, b] = [hex(fg), hex(bg)]; return '#' + f.map((c, i) => Math.round(c * alpha + b[i] * (1 - alpha)).toString(16).padStart(2, '0')).join('') }

function vars(css: string, selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`)
  if (start < 0) throw new Error(`no block for ${selector}`)
  const body = css.slice(start, css.indexOf('}', start))
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]))
}

const themes = { light: vars(tokensCss, ':root'), dark: vars(tokensCss, ':root.dark'), 'AEM preview skin': vars(indexCss, '.aem-skin') }

// [foreground token, background token, what it is]
const TEXT: [string, string, string][] = [
  ['ink', 'bg', 'body text'], ['ink', 'surface', 'text on cards'], ['ink', 'sand', 'text on sand bands'],
  ['ink-strong', 'bg', 'headings'], ['ink-strong', 'sand', 'headings on sand'],
  ['ink-muted', 'bg', 'secondary text'], ['ink-muted', 'surface', 'secondary text on cards'], ['ink-muted', 'sand', 'secondary text on sand'],
  ['accent-text', 'bg', 'orange text on page'], ['accent-text', 'sand', 'orange text on sand'], ['accent-text', 'accent-tint', 'orange text on its tint'],
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

  it('white text on the orange closing band is solid white: at 90% it falls to 4.2:1, below AA', () => {
    const bg = themes.light.accent
    expect(ratio('#ffffff', bg)).toBeGreaterThanOrEqual(4.5)
    expect(ratio(over('#ffffff', bg, 0.9), bg)).toBeLessThan(4.5) // why it is not translucent
  })

  it('the hand-drawn orange button text on white, in the final band', () => {
    expect(ratio(themes.light['accent-hover'], '#ffffff')).toBeGreaterThanOrEqual(4.5)
  })

  it('the outline of a text field reaches 3:1 on every surface it can sit on (WCAG 1.4.11)', () => {
    for (const [theme, v] of Object.entries(themes)) {
      for (const surface of ['bg', 'surface', 'sand'] as const) {
        const r = ratio(v['control-border'], v[surface])
        expect(r, `${theme}: control border on ${surface} is ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(3)
      }
    }
  })

  it('decorative dividers are allowed to be quieter, which is why fields do not use them', () => {
    expect(ratio(themes.light['hairline-strong'], themes.light.surface)).toBeLessThan(3)
  })
})
