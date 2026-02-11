import type { ViolationBreakdown } from '../../types'

type TopViolationsProps = {
  data: ViolationBreakdown[]
}

export function TopViolations({ data }: TopViolationsProps) {
  return (
    <section className="rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm">
      <header className="mb-4">
        <h3 className="text-base font-semibold text-slate-900">Top Violations</h3>
        <p className="text-sm text-slate-500">Ranked by share of failing DoD tasks</p>
      </header>

      <div className="space-y-3">
        {data.length === 0 && <p className="text-sm text-slate-500">No violations available.</p>}
        {data.map((item) => (
          <article key={item.category} className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-slate-700">{item.category}</span>
              <span className="text-slate-500">{item.count} issues</span>
            </div>
            <div className="h-2 rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-teal-500 to-indigo-500"
                style={{ width: `${Math.max(4, item.percent)}%` }}
              />
            </div>
            <p className="text-xs text-slate-500">{item.percent.toFixed(1)}% of total</p>
          </article>
        ))}
      </div>
    </section>
  )
}
