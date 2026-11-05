/**
 * XML-agnostic description of a JCR node tree. The mapping engine and dialog builder produce
 * these; the XML generator (chunk 7) is the only thing that turns them into text.
 */
export type AemValue =
  | { t: 'String'; v: string }
  | { t: 'Boolean'; v: boolean }
  | { t: 'Long'; v: number }
  | { t: 'Double'; v: number }
  | { t: 'StringArray'; v: string[] }

export interface AemNode {
  /** JCR node name. */
  name: string
  props: Record<string, AemValue>
  children: AemNode[]
}

export const s = (v: string): AemValue => ({ t: 'String', v })
export const b = (v: boolean): AemValue => ({ t: 'Boolean', v })
export const l = (v: number): AemValue => ({ t: 'Long', v })
export const d = (v: number): AemValue => ({ t: 'Double', v })
export const sa = (v: string[]): AemValue => ({ t: 'StringArray', v })
export const num = (v: number): AemValue => (Number.isInteger(v) ? l(v) : d(v))

export const node = (name: string, props: Record<string, AemValue | undefined>, children: AemNode[] = []): AemNode => ({
  name,
  props: Object.fromEntries(Object.entries(props).filter(([, v]) => v !== undefined)) as Record<string, AemValue>,
  children,
})
