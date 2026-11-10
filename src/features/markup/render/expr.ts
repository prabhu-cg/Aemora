/**
 * The expressions the generator writes into HTL, and nothing more:
 *   model.name   model.nameModifier   'text'   true/false   !   ==   !=   &&   ||   ( )
 * Anything else is a syntax error, so the preview never guesses at what a template means.
 */
export type Model = Record<string, unknown>

export class ExprError extends Error {}

type Tok = { k: 'id' | 'str' | 'num' | 'op'; v: string }

function tokenize(src: string): Tok[] {
  const out: Tok[] = []
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (/\s/.test(c)) { i++; continue }
    const two = src.slice(i, i + 2)
    if (two === '==' || two === '!=' || two === '&&' || two === '||') { out.push({ k: 'op', v: two }); i += 2; continue }
    if (c === '!' || c === '(' || c === ')') { out.push({ k: 'op', v: c }); i++; continue }
    if (c === "'" || c === '"') {
      const end = src.indexOf(c, i + 1)
      if (end < 0) throw new ExprError('A string is not closed.')
      out.push({ k: 'str', v: src.slice(i + 1, end) }); i = end + 1; continue
    }
    const num = /^-?\d+(\.\d+)?/.exec(src.slice(i))
    if (num) { out.push({ k: 'num', v: num[0] }); i += num[0].length; continue }
    const id = /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*/.exec(src.slice(i))
    if (id) { out.push({ k: 'id', v: id[0] }); i += id[0].length; continue }
    throw new ExprError(`Unsupported character "${c}" in the expression.`)
  }
  return out
}

/** HTL truthiness: empty text, 0, false, nothing and an empty list are all false. */
export function truthy(v: unknown): boolean {
  if (Array.isArray(v)) return v.length > 0
  return !(v === undefined || v === null || v === false || v === 0 || v === '')
}

export function evaluate(src: string, model: Model): unknown {
  const t = tokenize(src)
  let p = 0
  const peek = () => t[p]
  const eat = (v: string) => (peek()?.k === 'op' && peek().v === v ? (p++, true) : false)

  const primary = (): unknown => {
    const tok = peek()
    if (!tok) throw new ExprError('The expression ends too soon.')
    if (eat('(')) { const v = or(); if (!eat(')')) throw new ExprError('A bracket is not closed.'); return v }
    p++
    if (tok.k === 'str') return tok.v
    if (tok.k === 'num') return Number(tok.v)
    if (tok.k === 'id') {
      if (tok.v === 'true') return true
      if (tok.v === 'false') return false
      if (tok.v === 'null' || tok.v === 'undefined') return undefined
      const [root, ...path] = tok.v.split('.')
      if (root !== 'model') return undefined
      let cur: unknown = model
      for (const key of path) {
        if (cur === null || typeof cur !== 'object' || !Object.prototype.hasOwnProperty.call(cur, key)) return undefined
        cur = (cur as Record<string, unknown>)[key]
      }
      return cur
    }
    throw new ExprError(`Unexpected "${tok.v}" in the expression.`)
  }
  const unary = (): unknown => (eat('!') ? !truthy(unary()) : primary())
  const equality = (): unknown => {
    const left = unary()
    if (eat('==')) return left === unary()
    if (eat('!=')) return left !== unary()
    return left
  }
  const and = (): unknown => { let v = equality(); while (eat('&&')) { const r = equality(); v = truthy(v) ? r : v } return v }
  const or = (): unknown => { let v = and(); while (eat('||')) { const r = and(); v = truthy(v) ? v : r } return v }

  const result = or()
  if (p < t.length) throw new ExprError(`Unexpected "${t[p].v}" after the expression.`)
  return result
}

export interface Interpolation {
  /** The expression, without the options. */
  expr: string
  /** `@ context='html'` makes the value markup instead of text. */
  html: boolean
}

/** Splits `model.x @ context='html'` into the expression and its options. */
export function splitOptions(inner: string): Interpolation {
  let quote = ''
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i]
    if (quote) { if (c === quote) quote = '' } else if (c === "'" || c === '"') quote = c
    else if (c === '@') {
      const opts = inner.slice(i + 1)
      return { expr: inner.slice(0, i).trim(), html: /context\s*=\s*['"]html['"]/.test(opts) }
    }
  }
  return { expr: inner.trim(), html: false }
}

/** Matches `${ ... }` where the contents may hold quoted text. */
export const INTERPOLATION = /\$\{((?:[^}'"]|'[^']*'|"[^"]*")*)\}/g
