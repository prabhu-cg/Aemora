import { newId } from '../../lib/id'
import type { ComponentDef, Property } from './schema'

export function makeProperty(p: Partial<Property> & Pick<Property, 'key'>): Property {
  return {
    id: newId(),
    label: p.key,
    type: 'string',
    required: false,
    defaultValue: null,
    allowedValues: [],
    description: '',
    group: '',
    origin: { kind: 'manual', suggested: false },
    ...p,
  }
}

export function makeComponent(c: Partial<ComponentDef> & Pick<ComponentDef, 'name'>): ComponentDef {
  return {
    id: newId(),
    type: 'custom',
    description: '',
    properties: [],
    unsupported: [],
    children: [],
    meta: {},
    origin: { kind: 'manual', suggested: false },
    ...c,
  }
}
