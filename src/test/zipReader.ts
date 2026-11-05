import { crc32 } from '../lib/zip'

/** A separate ZIP reader for tests, so the writer is checked against the format and not against itself. */
export function readZip(bytes: Uint8Array) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let e = bytes.length - 22
  while (e >= 0 && v.getUint32(e, true) !== 0x06054b50) e--
  if (e < 0) throw new Error('no end of central directory')
  const count = v.getUint16(e + 10, true)
  let p = v.getUint32(e + 16, true)
  const out: { name: string; text: string; crcOk: boolean }[] = []
  for (let i = 0; i < count; i++) {
    const crc = v.getUint32(p + 16, true), size = v.getUint32(p + 24, true)
    const nameLen = v.getUint16(p + 28, true), extra = v.getUint16(p + 30, true), comment = v.getUint16(p + 32, true), off = v.getUint32(p + 42, true)
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen))
    const ln = v.getUint16(off + 26, true), le = v.getUint16(off + 28, true)
    const data = bytes.slice(off + 30 + ln + le, off + 30 + ln + le + size)
    out.push({ name, text: new TextDecoder().decode(data), crcOk: crc32(data) === crc })
    p += 46 + nameLen + extra + comment
  }
  return out
}
