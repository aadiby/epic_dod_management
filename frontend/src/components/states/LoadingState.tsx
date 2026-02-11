type LoadingStateProps = {
  variant?: 'overview' | 'table' | 'generic'
}

export function LoadingState({ variant = 'generic' }: LoadingStateProps) {
  if (variant === 'overview') {
    return (
      <div className="space-y-4" aria-busy="true" aria-live="polite">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-36 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />
          ))}
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="h-80 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />
          <div className="h-80 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />
          <div className="h-80 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />
          <div className="h-80 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />
        </div>
      </div>
    )
  }

  if (variant === 'table') {
    return (
      <div className="space-y-3" aria-busy="true" aria-live="polite">
        <div className="h-12 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
        <div className="h-[420px] animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />
      </div>
    )
  }

  return <div className="h-48 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />
}
