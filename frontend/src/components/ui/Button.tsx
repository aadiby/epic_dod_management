import type { ButtonHTMLAttributes } from 'react'

import { cn } from '../../lib/utils'

export function Button({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-xl border border-teal-600 bg-teal-600 px-4 py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-500',
        className,
      )}
      {...props}
    />
  )
}
