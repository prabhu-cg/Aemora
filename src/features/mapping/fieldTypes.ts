import type { PropertyType } from '../components/schema'
import { RESOURCE_TYPES } from '../aem/resourceTypes'
import type { FieldTypeId } from './schema'

type Scalar = string | number | boolean

export interface ConstraintSpec {
  key: string
  label: string
  kind: 'text' | 'number' | 'boolean' | 'choice'
  choices?: string[]
  hint?: string
  default?: Scalar
}

export interface FieldTypeDef {
  id: FieldTypeId
  label: string
  resourceType: string
  description: string
  constraints: ConstraintSpec[]
}

const t = (key: string, label: string, hint?: string, def?: Scalar): ConstraintSpec => ({ key, label, kind: 'text', hint, default: def })
const n = (key: string, label: string, hint?: string): ConstraintSpec => ({ key, label, kind: 'number', hint })
const bo = (key: string, label: string, def?: boolean, hint?: string): ConstraintSpec => ({ key, label, kind: 'boolean', default: def, hint })

export const FIELD_TYPES: Record<FieldTypeId, FieldTypeDef> = {
  textfield: { id: 'textfield', label: 'Textfield', resourceType: RESOURCE_TYPES.textfield, description: 'Single-line text.', constraints: [t('emptyText', 'Placeholder'), n('maxlength', 'Maximum length')] },
  textarea: { id: 'textarea', label: 'Textarea', resourceType: RESOURCE_TYPES.textarea, description: 'Multi-line text.', constraints: [t('emptyText', 'Placeholder'), n('maxlength', 'Maximum length'), n('rows', 'Visible rows')] },
  numberfield: { id: 'numberfield', label: 'Numberfield', resourceType: RESOURCE_TYPES.numberfield, description: 'A number with optional limits.', constraints: [t('emptyText', 'Placeholder'), n('min', 'Minimum'), n('max', 'Maximum'), n('step', 'Step')] },
  checkbox: { id: 'checkbox', label: 'Checkbox', resourceType: RESOURCE_TYPES.checkbox, description: 'On or off, saved as true or false.', constraints: [] },
  switch: { id: 'switch', label: 'Switch', resourceType: RESOURCE_TYPES.switch, description: 'A toggle, saved as true or false.', constraints: [] },
  select: { id: 'select', label: 'Select', resourceType: RESOURCE_TYPES.select, description: 'Choose from a fixed list.', constraints: [bo('emptyOption', 'Include an empty choice', undefined, 'Left unset: added when the field is optional and has no default.'), bo('multiple', 'Allow several choices', false)] },
  multifield: { id: 'multifield', label: 'Multifield', resourceType: RESOURCE_TYPES.multifield, description: 'A repeatable list of values or of grouped fields.', constraints: [] },
  pathfield: { id: 'pathfield', label: 'Pathfield', resourceType: RESOURCE_TYPES.pathfield, description: 'Pick a page or asset path.', constraints: [t('rootPath', 'Root path', 'Where the picker starts, e.g. /content or /content/dam.'), t('emptyText', 'Placeholder'), bo('multiple', 'Allow several paths', false)] },
  fileupload: { id: 'fileupload', label: 'Fileupload', resourceType: RESOURCE_TYPES.fileupload, description: 'Upload or drop a file; stores a file reference.', constraints: [t('mimeTypes', 'Allowed MIME types', 'Comma separated.', 'image/gif,image/jpeg,image/png,image/webp,image/tiff')] },
  colorfield: { id: 'colorfield', label: 'Colorfield', resourceType: RESOURCE_TYPES.colorfield, description: 'Pick a color.', constraints: [bo('showDefaultColors', 'Show default colors', true), bo('showProperties', 'Show color properties', false), bo('showSwatches', 'Show swatches', true)] },
  hidden: { id: 'hidden', label: 'Hidden', resourceType: RESOURCE_TYPES.hidden, description: 'Stores a fixed value. Authors do not see it.', constraints: [] },
  tagfield: { id: 'tagfield', label: 'Tagfield', resourceType: RESOURCE_TYPES.tagfield, description: 'Pick AEM tags.', constraints: [t('rootPath', 'Tag root path', undefined, '/content/cq:tags'), bo('multiple', 'Allow several tags', true)] },
  datepicker: { id: 'datepicker', label: 'Datepicker', resourceType: RESOURCE_TYPES.datepicker, description: 'Pick a date, or a date and time.', constraints: [{ key: 'type', label: 'Kind', kind: 'choice', choices: ['date', 'datetime'], default: 'date' }, t('displayedFormat', 'Displayed format', 'Leave empty for the standard format.'), t('valueFormat', 'Stored format', 'Leave empty for the standard format.')] },
  richtext: { id: 'richtext', label: 'Richtext', resourceType: RESOURCE_TYPES.richtext, description: 'Formatted text with a fixed inline toolbar.', constraints: [bo('useFixedInlineToolbar', 'Use a fixed inline toolbar', true)] },
}

/** Property types each field type fits without a warning. The first entry is the suggestion. */
export const COMPATIBLE: Record<PropertyType, FieldTypeId[]> = {
  string: ['textfield', 'textarea', 'hidden', 'pathfield', 'colorfield', 'select'],
  text: ['textarea', 'textfield', 'richtext', 'hidden'],
  richtext: ['richtext', 'textarea'],
  number: ['numberfield', 'textfield', 'hidden', 'select'],
  boolean: ['checkbox', 'switch', 'hidden', 'select'],
  enum: ['select', 'textfield', 'hidden'],
  image: ['pathfield', 'fileupload', 'textfield', 'hidden'],
  link: ['pathfield', 'textfield', 'hidden'],
  color: ['colorfield', 'textfield', 'hidden', 'select'],
  date: ['datepicker', 'textfield', 'hidden'],
  list: ['multifield', 'tagfield', 'textarea'],
  tags: ['tagfield', 'multifield', 'textfield'],
  hidden: ['hidden', 'textfield'],
}

export const fieldTypeList: FieldTypeDef[] = Object.values(FIELD_TYPES)
