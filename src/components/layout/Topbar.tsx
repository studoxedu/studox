import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

interface TopbarProps {
  title: string
  meta?: string
  actions?: ReactNode
  className?: string
}

export function Topbar({ title, meta, actions, className }: TopbarProps) {
  return (
    <div className={cn(
      'bg-white border-b border-gray-200 px-8 h-14 flex items-center justify-between flex-shrink-0',
      className
    )}>
      <div className="flex items-center gap-3">
        <h1 className="text-[18px] font-bold text-navy-900">{title}</h1>
        {meta && <span className="text-xs text-gray-400">{meta}</span>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
