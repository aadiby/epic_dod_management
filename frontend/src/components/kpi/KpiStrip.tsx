import { ResponsiveContainer, LineChart, Line, Tooltip } from 'recharts'

import type { KpiItem } from '../../types'
import { cn, deltaClass } from '../../lib/utils'

type KpiStripProps = {
  kpis: KpiItem[]
  testIds?: Record<string, string>
}

export function KpiStrip({ kpis, testIds = {} }: KpiStripProps) {
  return (
    <section aria-label="KPI Strip" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {kpis.map((kpi) => {
        const sparklineData = kpi.sparkline.map((value, index) => ({ index, value }))
        const deltaPrefix = kpi.delta > 0 ? '+' : ''

        return (
          <article
            key={kpi.label}
            className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{kpi.label}</p>
            <p
              className="mt-2 text-3xl font-bold text-slate-900"
              data-testid={testIds[kpi.label]}
            >
              {kpi.value}
            </p>
            <p className={cn('mt-1 text-xs font-medium', deltaClass(kpi.delta))}>
              {deltaPrefix}
              {kpi.delta.toFixed(1)} vs previous snapshot
            </p>
            <div className="mt-3 h-12">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={sparklineData}>
                  <Tooltip cursor={false} />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#0d9488"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </article>
        )
      })}
    </section>
  )
}
