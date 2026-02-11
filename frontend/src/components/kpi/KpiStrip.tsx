type KpiItem = {
  label: string
  value: string
  hint?: string
  onClick?: () => void
}

type KpiStripProps = {
  kpis: KpiItem[]
  testIds?: Record<string, string>
}

export function KpiStrip({ kpis, testIds = {} }: KpiStripProps) {
  return (
    <section aria-label="KPI Strip" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {kpis.map((kpi) => {
        const clickable = Boolean(kpi.onClick)
        const sharedClassName =
          'rounded-2xl border border-slate-200/60 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md'

        return (
          <button
            key={kpi.label}
            type="button"
            className={`${sharedClassName} ${clickable ? 'cursor-pointer' : 'cursor-default'}`}
            onClick={kpi.onClick}
            disabled={!clickable}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{kpi.label}</p>
            <p
              className="mt-2 text-3xl font-bold text-slate-900"
              data-testid={testIds[kpi.label]}
            >
              {kpi.value}
            </p>
            {kpi.hint && <p className="mt-2 text-xs text-slate-500">{kpi.hint}</p>}
          </button>
        )
      })}
    </section>
  )
}
