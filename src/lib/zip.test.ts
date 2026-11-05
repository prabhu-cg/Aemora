import { describe, expect, it } from 'vitest'
import { checkZipPath, crc32, createZip } from './zip'

/** An independent reader, so the writer is checked against the format and not against itself. */
function readZip(bytes: Uint8Array) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let e = bytes.length - 22
  while (e >= 0 && v.getUint32(e, true) !== 0x06054b50) e--
  if (e < 0) throw new Error('no end of central directory')
  const count = v.getUint16(e + 10, true)
  let p = v.getUint32(e + 16, true)
  const out: { name: string; data: Uint8Array; crcOk: boolean; flags: number; method: number }[] = []
  for (let i = 0; i < count; i++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error('bad central header')
    const flags = v.getUint16(p + 8, true), method = v.getUint16(p + 10, true), crc = v.getUint32(p + 16, true)
    const size = v.getUint32(p + 24, true), nameLen = v.getUint16(p + 28, true), extra = v.getUint16(p + 30, true), comment = v.getUint16(p + 32, true), off = v.getUint32(p + 42, true)
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen))
    if (v.getUint32(off, true) !== 0x04034b50) throw new Error('bad local header')
    const ln = v.getUint16(off + 26, true), le = v.getUint16(off + 28, true)
    const data = bytes.slice(off + 30 + ln + le, off + 30 + ln + le + size)
    out.push({ name, data, crcOk: crc32(data) === crc, flags, method })
    p += 46 + nameLen + extra + comment
  }
  return out
}

describe('crc32', () => {
  it('matches the standard check values', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
    expect(crc32(new Uint8Array())).toBe(0)
    expect(crc32(new TextEncoder().encode('The quick brown fox jumps over the lazy dog'))).toBe(0x414fa339)
  })
})

describe('createZip', () => {
  it('writes entries a separate reader can read back, byte for byte, with valid checksums', () => {
    const files = [
      { path: 'jcr_root/apps/site/components/card/_cq_dialog/.content.xml', content: '<?xml version="1.0"?>\n<jcr:root/>\n' },
      { path: 'README.txt', content: 'hello' },
      { path: 'bin/data.bin', content: Uint8Array.from([0, 1, 2, 255, 254]) },
    ]
    const back = readZip(createZip(files))
    expect(back.map((f) => f.name)).toEqual(files.map((f) => f.path))
    expect(back.every((f) => f.crcOk && f.method === 0)).toBe(true)
    expect(new TextDecoder().decode(back[0].data)).toBe(files[0].content)
    expect([...back[2].data]).toEqual([0, 1, 2, 255, 254])
  })
  it('handles unicode names and content, flagged as UTF-8', () => {
    const back = readZip(createZip([{ path: 'données/日本語.txt', content: 'Überschrift 🙂' }]))
    expect(back[0].name).toBe('données/日本語.txt')
    expect(new TextDecoder().decode(back[0].data)).toBe('Überschrift 🙂')
    expect(back[0].flags & 0x0800).toBe(0x0800)
  })
  it('makes a valid empty archive and a large one', () => {
    expect(readZip(createZip([]))).toEqual([])
    const big = 'x'.repeat(300_000)
    const back = readZip(createZip([{ path: 'big.txt', content: big }]))
    expect(back[0].data.length).toBe(300_000)
    expect(back[0].crcOk).toBe(true)
  })
  it('refuses unsafe or duplicate names instead of writing them', () => {
    for (const bad of ['../evil', '/abs', 'a\\b', 'a//b', '', 'C:/x', 'dir/../x']) expect(() => createZip([{ path: bad, content: '' }])).toThrow(/Cannot add/)
    expect(() => createZip([{ path: 'a', content: '' }, { path: 'a', content: '' }])).toThrow(/twice/)
    expect(checkZipPath('ok/.content.xml')).toBeNull()
  })
})
