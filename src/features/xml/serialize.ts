import type { AemNode, AemValue } from '../aem/nodes'

export const NAMESPACES: Record<string, string> = {
  jcr: 'http://www.jcp.org/jcr/1.0',
  nt: 'http://www.jcp.org/jcr/nt/1.0',
  sling: 'http://sling.apache.org/jcr/sling/1.0',
  cq: 'http://www.day.com/jcr/cq/1.0',
  granite: 'http://www.adobe.com/jcr/granite/1.0',
}

/** Escape text for use inside a double-quoted XML attribute. */
export function escapeAttr(v: string): string {
  return v
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/\t/g, '&#x9;').replace(/\n/g, '&#xa;').replace(/\r/g, '&#xd;')
    // Characters XML 1.0 does not allow at all are dropped rather than written.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '')
}

/**
 * FileVault property syntax: strings that start with { or [ would be read as a type prefix
 * or an array, so they get a leading backslash. Array items escape backslash and comma.
 */
export function formatValue(v: AemValue): string {
  switch (v.t) {
    case 'String': return /^[{[]/.test(v.v) ? `\\${v.v}` : v.v
    case 'Boolean': return `{Boolean}${v.v}`
    case 'Long': return `{Long}${Math.trunc(v.v)}`
    case 'Double': return `{Double}${v.v}`
    case 'StringArray': return `[${v.v.map((x) => x.replace(/\\/g, '\\\\').replace(/,/g, '\\,')).join(',')}]`
  }
}

const NAME = /^[A-Za-z_][A-Za-z0-9_.-]*(:[A-Za-z_][A-Za-z0-9_.-]*)?$/
/** Node and attribute names must be valid XML names. Anything else is made safe, never emitted raw. */
export const safeName = (n: string) => (NAME.test(n) ? n : n.replace(/[^A-Za-z0-9_.:-]/g, '_').replace(/^([^A-Za-z_])/, '_$1'))

const pad = (depth: number) => '    '.repeat(depth)

/** One attribute per line, the way AEM's package manager writes .content.xml. */
export function serializeNode(n: AemNode, depth = 0, extraAttrs: string[] = []): string {
  const attrs = [...extraAttrs, ...Object.entries(n.props).map(([k, v]) => `${safeName(k)}="${escapeAttr(formatValue(v))}"`)]
  const name = safeName(n.name)
  const open = `${pad(depth)}<${name}${attrs.map((a) => `\n${pad(depth + 1)}${a}`).join('')}`
  if (!n.children.length) return `${open}/>`
  return `${open}>\n${n.children.map((c) => serializeNode(c, depth + 1)).join('\n')}\n${pad(depth)}</${name}>`
}

export interface DocumentOptions {
  /** Lines for a comment placed after the declaration. */
  comment?: string[]
  /** Prefixes to declare on the root. Defaults to all of them. */
  namespaces?: string[]
}

export function serializeDocument(root: AemNode, opts: DocumentOptions = {}): string {
  const prefixes = opts.namespaces ?? Object.keys(NAMESPACES)
  const decl = prefixes.map((p) => `xmlns:${p}="${NAMESPACES[p]}"`)
  const comment = opts.comment?.length
    ? `<!--\n${opts.comment.map((l) => `    ${l.replace(/--/g, '- -')}`).join('\n')}\n-->\n`
    : ''
  return `<?xml version="1.0" encoding="UTF-8"?>\n${comment}${serializeNode(root, 0, decl)}\n`
}

/** Unescape what escapeAttr produced, for display and tests. */
export const unescapeAttr = (v: string) =>
  v.replace(/&#xa;/g, '\n').replace(/&#x9;/g, '\t').replace(/&#xd;/g, '\r').replace(/&quot;/g, '"').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&')
