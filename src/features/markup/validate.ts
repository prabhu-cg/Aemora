import type { MarkupResult } from './types'

const VOID = new Set(['img', 'hr', 'input', 'br', 'meta', 'link'])

/** Structural problems in generated markup. Empty when everything is consistent. */
export function validateMarkup(result: MarkupResult): string[] {
  const problems: string[] = []
  const file = (k: string) => result.files.find((f) => f.kind === k)?.content ?? ''
  const html = file('htl'), css = file('css'), java = file('model'), xml = file('component') + file('editConfig')

  // HTL: balanced tags, one of each attribute per element, closed expressions.
  const stack: string[] = []
  for (const m of html.matchAll(/<(\/?)([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g)) {
    const [, close, tag, rest] = m
    if (close) {
      if (stack.pop() !== tag) problems.push(`HTL: unexpected </${tag}>`)
      continue
    }
    const names = [...rest.matchAll(/\s([\w:.-]+)(?==)/g)].map((a) => a[1])
    const dup = names.find((n, i) => names.indexOf(n) !== i)
    if (dup) problems.push(`HTL: <${tag}> has "${dup}" twice`)
    if (!VOID.has(tag) && !rest.trimEnd().endsWith('/')) stack.push(tag)
  }
  if (stack.length) problems.push(`HTL: unclosed <${stack.join('>, <')}>`)
  for (const m of html.matchAll(/\$\{/g)) {
    let depth = 0, i = (m.index ?? 0) + 1
    for (; i < html.length; i++) { if (html[i] === '{') depth++; else if (html[i] === '}' && --depth === 0) break }
    if (depth !== 0) problems.push('HTL: an expression is not closed')
  }

  // HTL and model agree: every model.x used in the markup has a getter.
  const getters = new Set([...java.matchAll(/public \S+ (?:get|is)(\w+)\(\)/g)].map((g) => g[1][0].toLowerCase() + g[1].slice(1)))
  for (const m of html.matchAll(/model\.(\w+)/g)) if (!getters.has(m[1])) problems.push(`HTL uses model.${m[1]}, but the model has no getter for it`)
  if (!/data-sly-use\.model="[\w.]+"/.test(html)) problems.push('HTL does not load the model')
  if (!java.includes(`class ${result.modelClass}`)) problems.push('Java: the model class name does not match')

  // CSS and Java: balanced, and no leftovers from missing values.
  for (const [name, text] of [['CSS', css], ['Java', java]] as const) {
    if ((text.match(/{/g) ?? []).length !== (text.match(/}/g) ?? []).length) problems.push(`${name}: braces are not balanced`)
    if (/\bundefined\b|\bNaN\b|\[object/.test(text)) problems.push(`${name}: contains an unresolved value`)
  }
  if (/\bundefined\b|\bNaN\b|\[object/.test(html)) problems.push('HTL: contains an unresolved value')
  const fields = [...java.matchAll(/private \S+ (\w+);/g)].map((m) => m[1])
  if (new Set(fields).size !== fields.length) problems.push('Java: duplicate field names')
  if (!xml.includes('cq:Component')) problems.push('Component XML is missing its primary type')
  return problems
}
