// @ts-expect-error node builtin, available at test time only
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8')
const config = JSON.parse(read('../vercel.json')) as { headers: { source: string; headers: { key: string; value: string }[] }[]; outputDirectory: string }
const headersFor = (source: string) => Object.fromEntries(config.headers.find((h) => h.source === source)!.headers.map((h) => [h.key, h.value]))
const all = headersFor('/(.*)')
const csp = Object.fromEntries(all['Content-Security-Policy'].split(';').map((d) => d.trim()).filter(Boolean).map((d) => { const [name, ...src] = d.split(/\s+/); return [name, src] })) as Record<string, string[]>

describe('deployment headers (vercel.json)', () => {
  it('builds the Vite app into dist', () => expect(config.outputDirectory).toBe('dist'))

  it('scripts may only come from this site: no inline, no eval, no other hosts', () => {
    expect(csp['script-src']).toEqual(["'self'"])
    expect(csp['default-src']).toEqual(["'self'"])
  })
  it('stylesheets come from this site; inline style attributes are the only inline styling allowed', () => {
    expect(csp['style-src']).toEqual(["'self'"])
    expect(csp['style-src-attr']).toEqual(["'unsafe-inline'"])
  })
  it('network access is limited to this site, the Figma API and Figma image storage', () => {
    expect(csp['connect-src']).toEqual(["'self'", 'https://api.figma.com', 'https://*.amazonaws.com'])
  })
  it('images and fonts are this site (plus data: images, never data: fonts)', () => {
    expect(csp['img-src']).toEqual(["'self'", 'data:'])
    expect(csp['font-src']).toEqual(["'self'"])
  })
  it('no plugins, no framing, no base-tag or form hijacking', () => {
    expect(csp['object-src']).toEqual(["'none'"])
    expect(csp['frame-ancestors']).toEqual(["'none'"])
    expect(csp['base-uri']).toEqual(["'self'"])
    expect(csp['form-action']).toEqual(["'self'"])
  })
  it('never allows unsafe-eval, wildcards on their own, or plain http sources', () => {
    const everything = Object.values(csp).flat()
    expect(everything).not.toContain("'unsafe-eval'")
    expect(everything).not.toContain('*')
    expect(everything.filter((s) => s.startsWith('http:'))).toEqual([])
    expect(csp['script-src']).not.toContain("'unsafe-inline'")
  })
  it('adds the standard hardening headers', () => {
    expect(all['X-Content-Type-Options']).toBe('nosniff')
    expect(all['X-Frame-Options']).toBe('DENY')
    expect(all['Referrer-Policy']).toBe('no-referrer')
    expect(all['Cross-Origin-Opener-Policy']).toBe('same-origin')
    for (const f of ['camera=()', 'microphone=()', 'geolocation=()', 'payment=()']) expect(all['Permissions-Policy']).toContain(f)
  })
  it('does not turn off the clipboard, which the Clipboard input and Copy buttons use', () => {
    expect(all['Permissions-Policy']).not.toMatch(/clipboard/)
  })
  it('caches hashed assets for a year and leaves the page itself to revalidate', () => {
    expect(headersFor('/assets/(.*)')['Cache-Control']).toBe('public, max-age=31536000, immutable')
    expect(all['Cache-Control']).toBeUndefined()
  })
})

describe('index.html', () => {
  const html = read('../index.html')
  it('has no inline scripts and no inline event handlers, so the script policy holds', () => {
    const scripts = [...html.matchAll(/<script\b([^>]*)>/g)].map((m) => m[1])
    expect(scripts.length).toBeGreaterThan(0)
    expect(scripts.every((a) => /\bsrc=/.test(a))).toBe(true)
    expect(html).not.toMatch(/\son[a-z]+\s*=/i)
    expect(html).not.toMatch(/javascript:/i)
  })
  it('loads nothing from other sites', () => {
    expect(html).not.toMatch(/(?:src|href)=["']https?:\/\//)
  })
  it('the theme script is a separate same-site file with no network or storage writes', () => {
    expect(html).toContain('src="./theme-init.js"')
    const js = read('../public/theme-init.js')
    expect(js).not.toMatch(/fetch\(|XMLHttpRequest|setItem|eval\(|new Function/)
  })
  it('says what to do without JavaScript, and states a title, description and theme colours', () => {
    expect(html).toMatch(/<noscript>[\s\S]*needs JavaScript/)
    expect(html).toMatch(/<title>[^<]+<\/title>/)
    expect(html).toMatch(/name="description"/)
    expect(html).toMatch(/name="theme-color"[^>]*dark/)
  })
})

describe('source code guards', () => {
  const files = import.meta.glob('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
  const app = Object.entries(files).filter(([p]) => !/\.test\.tsx?$/.test(p) && !p.includes('/src/test/'))

  it('finds the application source (so the checks below mean something)', () => expect(app.length).toBeGreaterThan(80))

  it('nothing evaluates strings as code or writes raw HTML', () => {
    const banned = /\beval\s*\(|new Function\s*\(|document\.write\s*\(|\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML/
    expect(app.filter(([, src]) => banned.test(src)).map(([p]) => p)).toEqual([])
  })
  it('raw HTML is injected in exactly two places, both fed only by the escaping highlighters', () => {
    const using = app.filter(([, src]) => src.includes('dangerouslySetInnerHTML')).map(([p]) => p.replace('/src/', '')).sort()
    expect(using).toEqual(['features/xml/ui/XmlEditor.tsx', 'marketing/windows.tsx'])
    for (const [, src] of app.filter(([p]) => /XmlEditor|windows/.test(p))) expect(src).toMatch(/dangerouslySetInnerHTML=\{\{ __html: (highlightXml|highlight)\(/)
  })
  it('browser storage is touched only for the theme choice, so a Figma token can never be saved there', () => {
    const storage = /localStorage|sessionStorage|document\.cookie/
    expect(app.filter(([, src]) => storage.test(src)).map(([p]) => p.replace('/src/', ''))).toEqual(['lib/theme.ts'])
    const theme = files['/src/lib/theme.ts']
    expect(theme).not.toMatch(/token/i)
  })
  it('the Figma token never appears in a URL, a log call or an error message', () => {
    for (const [p, src] of app.filter(([p]) => p.includes('/figma/'))) {
      expect(src, p).not.toMatch(/console\.(log|error|warn|info)\([^)]*token/i)
      expect(src, p).not.toMatch(/[?&]token=|access_token=/)
    }
  })
  it('network calls go only through the two Figma modules', () => {
    const callers = app.filter(([, src]) => /\bfetch\(|XMLHttpRequest|navigator\.sendBeacon|new WebSocket|new EventSource/.test(src) || /fetchImpl\s*\(/.test(src)).map(([p]) => p.replace('/src/', '')).sort()
    expect(callers).toEqual(['features/inputs/figma/client.ts', 'features/inputs/figma/previews.ts'])
  })
  it('there is no analytics, tracking or third-party script anywhere in the source', () => {
    expect(app.filter(([, src]) => /google-analytics|googletagmanager|gtag\(|segment\.|mixpanel|sentry|hotjar|plausible|posthog/i.test(src)).map(([p]) => p)).toEqual([])
  })
})
