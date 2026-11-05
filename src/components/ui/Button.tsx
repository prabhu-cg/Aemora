import type { ButtonHTMLAttributes } from 'react'
import { buttonClass, type Size, type Variant } from './buttonClass'

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button className={`${buttonClass(variant, size)} ${className}`} {...rest} />
}
