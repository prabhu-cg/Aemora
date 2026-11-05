/**
 * A small ZIP writer: stored (uncompressed) entries, UTF-8 names. Dialog XML is tiny, so skipping
 * compression keeps this dependency-free and easy to verify. Opens in every unzip tool.
 */
export interface ZipFile { path: string; content: string | Uint8Array }

const TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** Entries are written exactly as named, so unsafe names are refused instead of cleaned up. */
export function checkZipPath(path: string): string | null {
  if (!path) return 'empty path'
  if (path.startsWith('/') || /^[A-Za-z]:/.test(path)) return 'absolute path'
  if (path.includes('\\')) return 'backslash in path'
  if (path.split('/').some((s) => s === '..' || s === '')) return 'path escapes the archive or has an empty segment'
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f]/.test(path)) return 'control character in path'
  return null
}

export function createZip(files: ZipFile[], now = new Date()): Uint8Array {
  const enc = new TextEncoder()
  const seen = new Set<string>()
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)
  const date = ((Math.max(now.getFullYear(), 1980) - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0

  for (const f of files) {
    const bad = checkZipPath(f.path)
    if (bad) throw new Error(`Cannot add "${f.path}" to the ZIP: ${bad}.`)
    if (seen.has(f.path)) throw new Error(`Cannot add "${f.path}" twice.`)
    seen.add(f.path)
    const name = enc.encode(f.path)
    const data = typeof f.content === 'string' ? enc.encode(f.content) : f.content
    const crc = crc32(data)

    const local = new Uint8Array(30 + name.length + data.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true); lv.setUint16(8, 0, true)
    lv.setUint16(10, time, true); lv.setUint16(12, date, true); lv.setUint32(14, crc, true)
    lv.setUint32(18, data.length, true); lv.setUint32(22, data.length, true); lv.setUint16(26, name.length, true); lv.setUint16(28, 0, true)
    local.set(name, 30); local.set(data, 30 + name.length)

    const central = new Uint8Array(46 + name.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true); cv.setUint16(10, 0, true)
    cv.setUint16(12, time, true); cv.setUint16(14, date, true); cv.setUint32(16, crc, true)
    cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true); cv.setUint16(28, name.length, true)
    cv.setUint16(30, 0, true); cv.setUint16(32, 0, true); cv.setUint16(34, 0, true); cv.setUint16(36, 0, true); cv.setUint32(38, 0, true)
    cv.setUint32(42, offset, true)
    central.set(name, 46)

    locals.push(local); centrals.push(central); offset += local.length
  }

  const cdSize = centrals.reduce((n, c) => n + c.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true)
  ev.setUint32(12, cdSize, true); ev.setUint32(16, offset, true)

  const out = new Uint8Array(offset + cdSize + 22)
  let p = 0
  for (const part of [...locals, ...centrals, end]) { out.set(part, p); p += part.length }
  return out
}
