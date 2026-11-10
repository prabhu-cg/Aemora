import type { Property, PropertyType } from '../components/schema'
import { cap, javaName, javaString } from './naming'

const JAVA_TYPE: Record<PropertyType, string> = {
  string: 'String', text: 'String', richtext: 'String', link: 'String', image: 'String', color: 'String', enum: 'String', hidden: 'String',
  number: 'Double', boolean: 'boolean', date: 'Calendar', tags: 'String[]', list: 'String[]',
}

function defaultAnnotation(p: Property): string | null {
  const v = p.defaultValue
  if (v === null || v === '') return null
  if (p.type === 'boolean') return `@Default(booleanValues = ${String(v) === 'true'})`
  if (p.type === 'number') { const n = Number(v); return Number.isFinite(n) ? `@Default(doubleValues = ${n})` : null }
  if (p.type === 'date' || p.type === 'tags' || p.type === 'list') return null
  return `@Default(values = ${javaString(String(v))})`
}

export function generateModel(props: Property[], jcrNames: Record<string, string>, pkg: string, className: string): string {
  const used = new Set<string>()
  const fields = props.map((p) => {
    let name = javaName(p.key)
    for (let i = 2; used.has(name); i++) name = `${javaName(p.key)}${i}`
    used.add(name)
    return { p, name, type: JAVA_TYPE[p.type], jcr: jcrNames[p.key] ?? p.key }
  })
  const imports = new Set(['org.apache.sling.api.resource.Resource', 'org.apache.sling.models.annotations.DefaultInjectionStrategy', 'org.apache.sling.models.annotations.Model'])
  if (fields.length) imports.add('org.apache.sling.models.annotations.injectorspecific.ValueMapValue')
  if (fields.some(({ p }) => defaultAnnotation(p))) imports.add('org.apache.sling.models.annotations.Default')
  if (fields.some((f) => f.type === 'Calendar')) imports.add('java.util.Calendar')

  const body: string[] = []
  for (const f of fields) {
    body.push(`    @ValueMapValue${f.jcr !== f.name ? `(name = ${javaString(f.jcr)})` : ''}`)
    const d = defaultAnnotation(f.p)
    if (d) body.push(`    ${d}`)
    body.push(`    private ${f.type} ${f.name};`, '')
  }
  for (const f of fields) {
    body.push(`    public ${f.type} ${f.type === 'boolean' ? 'is' : 'get'}${cap(f.name)}() {`, `        return ${f.name};`, '    }', '')
    if (f.p.type === 'enum') body.push(`    public String get${cap(f.name)}Modifier() {`, `        return toModifier(${f.name});`, '    }', '')
  }
  if (fields.some((f) => f.p.type === 'enum')) {
    body.push('    private static String toModifier(String value) {', '        return value == null ? "" : value.toLowerCase().replaceAll("[^a-z0-9]+", "-").replaceAll("^-+|-+$", "");', '    }', '')
  }
  while (body[body.length - 1] === '') body.pop()
  return [
    `package ${pkg};`, '',
    ...[...imports].sort().map((i) => `import ${i};`), '',
    '@Model(adaptables = Resource.class, defaultInjectionStrategy = DefaultInjectionStrategy.OPTIONAL)',
    `public class ${className} {`, '', ...body, '}', '',
  ].join('\n')
}
