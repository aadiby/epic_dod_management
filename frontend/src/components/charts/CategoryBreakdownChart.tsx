import { Pie, PieChart, ResponsiveContainer, Tooltip, Cell } from 'recharts'

import type { CategoryBreakdown } from '../../types'
import { formatNumber } from '../../lib/utils'

const COLORS = ['#0d9488', '#6366f1', '#f97316', '#ef4444', '#14b8a6', '#334155']

type CategoryBreakdownChartProps = {
  data: CategoryBreakdown[]
}

export function CategoryBreakdownChart({ data }: CategoryBreakdownChartProps) {
  const chartData = data.map((item) => ({
    name: item.category,
    value: item.nonCompliant,
    compliant: item.compliant,
  }))

  return (
    <section className="rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm">
      <header className="mb-4">
        <h3 className="text-base font-semibold text-slate-900">DoD Category Breakdown</h3>
        <p className="text-sm text-slate-500">Violations by category</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="name"
                innerRadius={64}
                outerRadius={108}
                paddingAngle={2}
              >
                {chartData.map((item, index) => (
                  <Cell key={item.name} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number | string | undefined) => [formatNumber(Number(value ?? 0)), 'Violations']}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="space-y-2">
          {chartData.length === 0 && <p className="text-sm text-slate-500">No category data available.</p>}
          {chartData.map((item, index) => (
            <div key={item.name} className="rounded-xl border border-slate-200 p-3">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                <p className="text-sm font-medium text-slate-700">{item.name}</p>
              </div>
              <p className="mt-1 text-xs text-slate-500">{item.value} non-compliant tasks</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
