import type { ElementType, ReactNode } from 'react'

/** The single centred frame: 1152px max, gutters 20px, 24px from sm, 32px from lg. */
export const FRAME = 'mx-auto w-full max-w-[1152px] px-5 sm:px-6 lg:px-8'

export function Frame({ as: Tag = 'div', className = '', children }: { as?: ElementType; className?: string; children: ReactNode }) {
  return <Tag className={`${FRAME} ${className}`}>{children}</Tag>
}
