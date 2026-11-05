// Serves the production build with the same headers vercel.json applies, so the policy can be tried locally.
//   npm run build && node scripts/serve-dist.mjs        then open http://localhost:4173
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../dist/', import.meta.url))
const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'))
const all = config.headers.find((h) => h.source === '/(.*)').headers
const assets = config.headers.find((h) => h.source === '/assets/(.*)').headers
const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8', '.woff2': 'font/woff2' }
const port = Number(process.env.PORT ?? 4173)
// CSP_REPORT=1 makes the browser send every policy violation to /__csp, where it is printed. For checking, not for production.
const report = process.env.CSP_REPORT === '1'

createServer(async (req, res) => {
  const path = new URL(req.url ?? '/', 'http://x').pathname
  if (req.method === 'POST' && path === '/__csp') {
    let body = ''
    for await (const chunk of req) body += chunk
    try {
      const r = JSON.parse(body)['csp-report'] ?? JSON.parse(body)
      console.log('CSP-VIOLATION', JSON.stringify({ directive: r['violated-directive'], blocked: r['blocked-uri'], page: r['document-uri'], source: r['source-file'], line: r['line-number'], sample: (r['script-sample'] ?? '').slice(0, 80) }))
    } catch { console.log('CSP-VIOLATION (unparsed)', body.slice(0, 200)) }
    return void res.writeHead(204).end()
  }
  const rel = normalize(path === '/' ? '/index.html' : path).replace(/^(\.\.[/\\])+/, '')
  try {
    const body = await readFile(join(root, rel))
    const headers = { 'Content-Type': types[extname(rel)] ?? 'application/octet-stream' }
    for (const h of all) headers[h.key] = h.key === 'Content-Security-Policy' && report ? `${h.value}; report-uri /__csp` : h.value
    if (path.startsWith('/assets/')) for (const h of assets) headers[h.key] = h.value
    res.writeHead(200, headers).end(body)
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found')
  }
}).listen(port, () => console.log(`Serving dist/ with Vercel's headers on http://localhost:${port}`))
