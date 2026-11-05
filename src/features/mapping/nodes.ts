import { RESOURCE_TYPES } from '../aem/resourceTypes'
import { b, l, node, num, s, sa, type AemNode, type AemValue } from '../aem/nodes'
import type { ResolvedField } from './engine'
import type { Subfield } from './schema'

const PRIMARY = 'nt:unstructured'

/** Standard first two properties of every dialog node. */
const typed = (resourceType: string, rest: Record<string, AemValue | undefined>): Record<string, AemValue | undefined> => ({
  'jcr:primaryType': s(PRIMARY),
  'sling:resourceType': s(resourceType),
  ...rest,
})

const str = (v: unknown) => (typeof v === 'string' && v !== '' ? s(v) : undefined)
const numberOrUndef = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? num(v) : undefined)
const longOrUndef = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? l(Math.trunc(v)) : undefined)
const boolOrUndef = (v: unknown) => (typeof v === 'boolean' ? b(v) : undefined)

export const nodeName = (key: string) => key.replace(/[^A-Za-z0-9_-]/g, '_').replace(/^([^A-Za-z_])/, '_$1')

function typeHint(r: { key: string; name: string }, hint: string): AemNode {
  return node(`${nodeName(r.key)}TypeHint`, typed(RESOURCE_TYPES.hidden, { name: s(`${r.name}@TypeHint`), value: s(hint) }))
}

function selectItems(values: string[], selected: string | null): AemNode {
  return node('items', { 'jcr:primaryType': s(PRIMARY) }, values.map((v, i) =>
    node(`item${i}`, { 'jcr:primaryType': s(PRIMARY), text: s(v), value: s(v), selected: selected === v ? b(true) : undefined }),
  ))
}

function subfieldNode(sf: Subfield): AemNode {
  const name = s(`./${sf.key}`)
  const common = { name, fieldLabel: s(sf.label) }
  switch (sf.fieldType) {
    case 'textarea': return node(nodeName(sf.key), typed(RESOURCE_TYPES.textarea, common))
    case 'numberfield': return node(nodeName(sf.key), typed(RESOURCE_TYPES.numberfield, common))
    case 'pathfield': return node(nodeName(sf.key), typed(RESOURCE_TYPES.pathfield, { ...common, rootPath: s('/content') }))
    case 'hidden': return node(nodeName(sf.key), typed(RESOURCE_TYPES.hidden, { name }))
    case 'checkbox': return node(nodeName(sf.key), typed(RESOURCE_TYPES.checkbox, { name, text: s(sf.label), value: s('true'), uncheckedValue: s('false') }))
    case 'select': return node(nodeName(sf.key), typed(RESOURCE_TYPES.select, common), [selectItems(sf.allowedValues, null)])
    default: return node(nodeName(sf.key), typed(RESOURCE_TYPES.textfield, common))
  }
}

function itemField(r: ResolvedField): AemNode {
  const kind = r.multifield?.itemFieldType ?? 'textfield'
  const name = s(r.name)
  if (kind === 'pathfield') return node('field', typed(RESOURCE_TYPES.pathfield, { name, rootPath: s('/content') }))
  if (kind === 'numberfield') return node('field', typed(RESOURCE_TYPES.numberfield, { name }))
  if (kind === 'textarea') return node('field', typed(RESOURCE_TYPES.textarea, { name }))
  return node('field', typed(RESOURCE_TYPES.textfield, { name }))
}

function datepickerFormats(type: string) {
  return type === 'datetime'
    ? { displayed: 'YYYY-MM-DD HH:mm', value: 'YYYY-MM-DD[T]HH:mm:ss.SSSZ' }
    : { displayed: 'YYYY-MM-DD', value: 'YYYY-MM-DD' }
}

/**
 * The dialog node for one field, plus any sibling nodes it needs (a hidden @TypeHint field so
 * booleans, numbers and dates are saved with the right JCR type). Names come from the field key.
 */
export function fieldToNodes(r: ResolvedField): AemNode[] {
  const id = nodeName(r.key)
  const c = r.constraints
  const label = str(r.label)
  const desc = str(r.description)
  const req = r.required ? b(true) : undefined
  const common = { name: s(r.name), fieldLabel: label, fieldDescription: desc, required: req }
  const dv = r.defaultValue

  switch (r.fieldType) {
    case 'textfield':
      return [node(id, typed(r.resourceType, { ...common, value: str(dv), emptyText: str(c.emptyText), maxlength: longOrUndef(c.maxlength) }))]
    case 'textarea':
      return [node(id, typed(r.resourceType, { ...common, value: str(dv), emptyText: str(c.emptyText), maxlength: longOrUndef(c.maxlength), rows: longOrUndef(c.rows) }))]
    case 'numberfield': {
      const fractional = [dv, c.min, c.max, c.step].some((v) => typeof v === 'number' && !Number.isInteger(v))
      return [node(id, typed(r.resourceType, {
        ...common, value: numberOrUndef(dv), emptyText: str(c.emptyText), min: numberOrUndef(c.min), max: numberOrUndef(c.max), step: numberOrUndef(c.step),
        typeHint: s(fractional ? 'Double' : 'Long'),
      }))]
    }
    case 'checkbox':
    case 'switch':
      return [
        node(id, typed(r.resourceType, {
          name: s(r.name), text: label, fieldDescription: desc, required: req,
          value: s('true'), uncheckedValue: s('false'), checked: dv === true ? b(true) : undefined,
        })),
        typeHint(r, 'Boolean'),
      ]
    case 'select':
      return [node(id, typed(r.resourceType, {
        ...common, multiple: boolOrUndef(c.multiple) ?? undefined,
        emptyOption: (c.emptyOption === true || (c.emptyOption === undefined && !r.required && dv === null)) ? b(true) : undefined,
      }), [selectItems(r.allowedValues, dv === null ? null : String(dv))])]
    case 'multifield': {
      const mf = r.multifield
      const head = { fieldLabel: label, fieldDescription: desc, required: req }
      if (mf?.composite) {
        const field = node('field', typed(RESOURCE_TYPES.container, { name: s(r.name) }), [
          node('items', { 'jcr:primaryType': s(PRIMARY) }, mf.subfields.map(subfieldNode)),
        ])
        return [node(id, typed(r.resourceType, { composite: b(true), ...head }), [field])]
      }
      return [node(id, typed(r.resourceType, head), [itemField(r)])]
    }
    case 'pathfield':
      return [node(id, typed(r.resourceType, { ...common, value: str(dv), rootPath: str(c.rootPath), emptyText: str(c.emptyText), multiple: boolOrUndef(c.multiple) }))]
    case 'fileupload': {
      const mimes = String(c.mimeTypes ?? '').split(',').map((m) => m.trim()).filter(Boolean)
      return [node(id, typed(r.resourceType, {
        name: s(r.name), fieldLabel: label, fieldDescription: desc, required: req,
        autoStart: b(false), class: s('cq-droptarget'),
        fileNameParameter: s(`${r.name}FileName`), fileReferenceParameter: s(`${r.name}FileReference`),
        mimeTypes: mimes.length ? sa(mimes) : undefined, multiple: b(false),
        title: s('Drag and drop a file, or click to upload'), uploadUrl: s('${suffix.path}'), useHTML5: b(true),
      }))]
    }
    case 'colorfield':
      return [node(id, typed(r.resourceType, { ...common, value: str(dv), showDefaultColors: boolOrUndef(c.showDefaultColors), showProperties: boolOrUndef(c.showProperties), showSwatches: boolOrUndef(c.showSwatches) }))]
    case 'hidden':
      return [node(id, typed(r.resourceType, { name: s(r.name), value: str(dv) }))]
    case 'tagfield':
      return [node(id, typed(r.resourceType, { ...common, rootPath: str(c.rootPath), multiple: boolOrUndef(c.multiple) }))]
    case 'datepicker': {
      const type = typeof c.type === 'string' ? c.type : 'date'
      const f = datepickerFormats(type)
      return [node(id, typed(r.resourceType, {
        ...common, value: str(dv), type: s(type), displayedFormat: s(str(c.displayedFormat) ? String(c.displayedFormat) : f.displayed),
        valueFormat: s(str(c.valueFormat) ? String(c.valueFormat) : f.value), typeHint: s('Date'),
      }))]
    }
    case 'richtext':
      return [node(id, typed(r.resourceType, { ...common, useFixedInlineToolbar: boolOrUndef(c.useFixedInlineToolbar) }))]
  }
}
