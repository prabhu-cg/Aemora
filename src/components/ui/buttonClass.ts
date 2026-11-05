export type Variant = 'primary' | 'outline' | 'ghost'
export type Size = 'sm' | 'md' | 'lg'

const base =
  'inline-flex items-center justify-center gap-2 rounded-lg font-bold transition-colors disabled:opacity-50 disabled:pointer-events-none active:translate-y-px cursor-pointer'
const variants: Record<Variant, string> = {
  primary: 'bg-accent text-on-accent hover:bg-accent-hover',
  outline: 'bg-surface text-ink-strong border border-hairline-strong hover:bg-sand',
  ghost: 'text-ink hover:bg-sand',
}
const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px]',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-7 text-base',
}

export function buttonClass(variant: Variant = 'primary', size: Size = 'md') {
  return `${base} ${variants[variant]} ${sizes[size]}`
}
