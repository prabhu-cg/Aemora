import { newId } from '../../lib/id'
import type { Asset } from '../components/schema'
import { InputError } from './types'

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const

/** Real format is decided by the file's first bytes, not its name or declared type. */
export function sniffImageType(bytes: Uint8Array): (typeof TYPES)[number] | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'image/webp'
  return null
}

export function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

export async function readScreenshot(file: File): Promise<Asset> {
  if (file.size > MAX_IMAGE_BYTES) throw new InputError(`That image is ${(file.size / 1024 / 1024).toFixed(1)} MB. Screenshots up to 8 MB are supported. Export a smaller one.`)
  const bytes = new Uint8Array(await file.arrayBuffer())
  const mime = sniffImageType(bytes)
  if (!mime) throw new InputError('Only PNG, JPG and WebP screenshots are supported. SVG and other formats are not accepted.')
  return { id: newId(), name: file.name.slice(0, 200) || 'screenshot', mime, bytes: bytes.length, dataUrl: `data:${mime};base64,${toBase64(bytes)}` }
}
