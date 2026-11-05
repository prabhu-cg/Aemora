/**
 * Granite UI / Coral resource types used in generated Touch UI dialogs.
 * Only these are ever emitted. They are not runtime-verified against an AEM instance yet.
 */
const F = 'granite/ui/components/coral/foundation/form'

export const RESOURCE_TYPES = {
  dialog: 'cq/gui/components/authoring/dialog',
  tabs: 'granite/ui/components/coral/foundation/tabs',
  fixedColumns: 'granite/ui/components/coral/foundation/fixedcolumns',
  container: 'granite/ui/components/coral/foundation/container',
  fieldset: 'granite/ui/components/coral/foundation/form/fieldset',
  textfield: `${F}/textfield`,
  textarea: `${F}/textarea`,
  numberfield: `${F}/numberfield`,
  checkbox: `${F}/checkbox`,
  switch: `${F}/switch`,
  select: `${F}/select`,
  multifield: `${F}/multifield`,
  pathfield: `${F}/pathfield`,
  colorfield: `${F}/colorfield`,
  hidden: `${F}/hidden`,
  datepicker: `${F}/datepicker`,
  fileupload: 'cq/gui/components/authoring/dialog/fileupload',
  tagfield: 'cq/gui/components/coral/common/form/tagfield',
  richtext: 'cq/gui/components/authoring/dialog/richtext',
} as const

/** Every resource type the generator may emit. The AEM compatibility check uses this allow-list. */
export const ALLOWED_RESOURCE_TYPES: ReadonlySet<string> = new Set(Object.values(RESOURCE_TYPES))
