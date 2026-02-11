import type { HTMLAttributes, ReactNode } from 'react'

import { cn, statusToneClasses } from '../../lib/utils'

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  children: ReactNode
  tone?: 'success' | 'warning' | 'error' | 'neutral'
}

export function Badge({ children, tone = 'neutral', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold',
        statusToneClasses(tone),
        className,
      )}
      {...props}
    >
      {children}
    </span>
  )
}
