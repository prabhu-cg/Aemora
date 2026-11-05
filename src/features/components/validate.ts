import type { ComponentDef } from './schema'

export interface Issue {
  level: 'error' | 'warning'
  code: 'empty-label' | 'empty-key' | 'bad-key' | 'duplicate-key' | 'enum-no-values' | 'default-not-allowed' | 'duplicate-values' | 'required-hidden' | 'empty-name'
  message: string
  propertyId?: string
}

export const KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/

/** Design-level checks. AEM-specific validation comes with the XML generator (chunk 7). */
export function validateComponent(c: ComponentDef): Issue[] {
  const out: Issue[] = []
  if (!c.name.trim()) out.push({ level: 'error', code: 'empty-name', message: 'The component needs a name.' })
  const seen = new Map<string, number>()
  for (const p of c.properties) seen.set(p.key, (seen.get(p.key) ?? 0) + 1)
  for (const p of c.properties) {
    const at = (code: Issue['code'], level: Issue['level'], message: string) => out.push({ level, code, message, propertyId: p.id })
    if (!p.label.trim()) at('empty-label', 'error', 'Add a label authors will see.')
    if (!p.key.trim()) at('empty-key', 'error', 'Add a field name.')
    else if (!KEY_PATTERN.test(p.key)) at('bad-key', 'error', 'The field name must start with a letter and use only letters, numbers, hyphens and underscores.')
    else if ((seen.get(p.key) ?? 0) > 1) at('duplicate-key', 'error', `Another property is also named "${p.key}". Field names must be unique within the component.`)
    if (p.type === 'enum') {
      if (!p.allowedValues.length) at('enum-no-values', 'warning', 'Add the values authors can choose from.')
      else if (new Set(p.allowedValues).size !== p.allowedValues.length) at('duplicate-values', 'warning', 'The allowed values contain duplicates.')
      if (p.defaultValue !== null && p.allowedValues.length && !p.allowedValues.includes(String(p.defaultValue))) {
        at('default-not-allowed', 'error', `The default "${p.defaultValue}" is not one of the allowed values.`)
      }
    }
    if (p.type === 'hidden' && p.required) at('required-hidden', 'warning', 'A hidden field cannot be filled in by authors, so it should not be required.')
  }
  return out
}

export function issuesFor(issues: Issue[], propertyId: string): Issue[] {
  return issues.filter((i) => i.propertyId === propertyId)
}
