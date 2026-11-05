import type { Asset, ComponentDef } from '../components/schema'
import type { Project } from '../projects/schema'

export interface Warning {
  level: 'info' | 'warning'
  message: string
  where?: string
}

export interface UncertainLine {
  line: number
  text: string
}

export interface ImportResult {
  components: ComponentDef[]
  warnings: Warning[]
  /** Input the parser could not interpret. The UI lets the user correct these by hand. */
  uncertain: UncertainLine[]
  source: Project['inputSource']
  assets: Asset[]
}

/** A user-facing input failure with every problem listed, not just the first. */
export class InputError extends Error {
  issues: string[]
  constructor(message: string, issues: string[] = []) {
    super(message)
    this.issues = issues
  }
}

export const MAX_INPUT_CHARS = 2 * 1024 * 1024

/** Drop keys that could pollute prototypes if a consumer ever merges the data. */
export function safeReviver(key: string, value: unknown) {
  return key === '__proto__' || key === 'constructor' || key === 'prototype' ? undefined : value
}
