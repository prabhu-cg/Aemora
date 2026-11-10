import { kebab } from '../../lib/kebab'

export const slug = (s: string) => kebab(s, 'x')

/** "Button / primary" -> "ButtonPrimary". Always a valid Java type name. */
export function pascal(s: string): string {
  const out = s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/[^A-Za-z0-9]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join('')
  return /^[A-Za-z]/.test(out) ? out : `Component${out}`
}

const JAVA_RESERVED = new Set(['abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char', 'class', 'const', 'continue', 'default', 'do', 'double', 'else', 'enum', 'extends', 'final', 'finally', 'float', 'for', 'goto', 'if', 'implements', 'import', 'instanceof', 'int', 'interface', 'long', 'native', 'new', 'package', 'private', 'protected', 'public', 'return', 'short', 'static', 'strictfp', 'super', 'switch', 'synchronized', 'this', 'throw', 'throws', 'transient', 'try', 'void', 'volatile', 'while', 'true', 'false', 'null', 'var', 'record', 'model'])

/** A Java field name for a JCR property key. */
export function javaName(key: string): string {
  const id = key.replace(/[^A-Za-z0-9_$]/g, '')
  const safe = /^[A-Za-z_$]/.test(id) ? id : `p${id}`
  return JAVA_RESERVED.has(safe) ? `${safe}Value` : safe
}

export const cap = (s: string) => s[0].toUpperCase() + s.slice(1)
export const xmlEscape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
export const htmlText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\$\{/g, '&#36;{')
export const javaString = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '')}"`
