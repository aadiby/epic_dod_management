import { ArrowRight, Inbox } from 'lucide-react'

type EmptyStateProps = {
  title: string
  description: string
  primaryCtaLabel?: string
  onPrimaryCta?: () => void
  secondaryLinkLabel?: string
  onSecondaryClick?: () => void
}

export function EmptyState({
  title,
  description,
  primaryCtaLabel,
  onPrimaryCta,
  secondaryLinkLabel,
  onSecondaryClick,
}: EmptyStateProps) {
  return (
    <section className="rounded-2xl border border-slate-200/60 bg-white p-8 text-center shadow-sm">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-slate-600">
        <Inbox className="h-6 w-6" />
      </div>
      <h3 className="mt-4 text-lg font-semibold text-slate-900">{title}</h3>
      <p className="mx-auto mt-2 max-w-xl text-sm text-slate-600">{description}</p>

      {(primaryCtaLabel || secondaryLinkLabel) && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          {primaryCtaLabel && onPrimaryCta && (
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700"
              onClick={onPrimaryCta}
            >
              {primaryCtaLabel}
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
          {secondaryLinkLabel && onSecondaryClick && (
            <button
              type="button"
              className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
              onClick={onSecondaryClick}
            >
              {secondaryLinkLabel}
            </button>
          )}
        </div>
      )}
    </section>
  )
}
