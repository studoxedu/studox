import { cn } from '../../lib/utils'
import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'amber'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

const variantClass: Record<Variant, string> = {
  primary:   'bg-navy-900 text-white hover:bg-navy-800 border border-transparent',
  secondary: 'bg-white text-navy-900 border border-navy-900 hover:bg-navy-100',
  ghost:     'bg-transparent text-navy-900 border border-gray-300 hover:bg-gray-50',
  danger:    'bg-red-600 text-white border border-transparent hover:bg-red-700',
  amber:     'bg-amber-500 text-navy-900 border border-transparent hover:bg-amber-200',
}

const sizeClass: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-2.5 text-md',
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled}
      className={cn(
        'inline-flex items-center gap-1.5 font-semibold tracking-[0.04em] rounded-sm',
        'transition-colors duration-150 cursor-pointer',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        variantClass[variant],
        sizeClass[size],
        className
      )}
    >
      {children}
    </button>
  )
}
