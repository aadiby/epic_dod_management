import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import type { TrendPoint } from '../../types'
import { formatDate } from '../../lib/utils'

type TrendChartProps = {
  data: TrendPoint[]
}

export function TrendChart({ data }: TrendChartProps) {
  return (
    <section className="rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm">
      <header className="mb-4">
        <h3 className="text-base font-semibold text-slate-900">Trend Over Time</h3>
        <p className="text-sm text-slate-500">Compliance and non-compliant epic trend</p>
      </header>

      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
            <defs>
              <linearGradient id="trendCompliance" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#14b8a6" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="4 4" stroke="#e2e8f0" />
            <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 12 }} />
            <YAxis yAxisId="left" domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
            <YAxis yAxisId="right" orientation="right" allowDecimals={false} />
            <Tooltip
              labelFormatter={(label: unknown) => formatDate(typeof label === 'string' ? label : '')}
            />
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="compliance"
              stroke="#0d9488"
              strokeWidth={2.5}
              fill="url(#trendCompliance)"
            />
            <Line yAxisId="right" type="monotone" dataKey="nonCompliant" stroke="#f97316" strokeWidth={2} dot />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}
