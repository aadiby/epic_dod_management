import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import type { SquadBreakdown } from '../../types'
import { formatPercent } from '../../lib/utils'

type ComplianceBySquadChartProps = {
  data: SquadBreakdown[]
  onSelectSquad?: (squad: string) => void
}

export function ComplianceBySquadChart({ data, onSelectSquad }: ComplianceBySquadChartProps) {
  return (
    <section className="rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Compliance by Squad</h3>
          <p className="text-sm text-slate-500">Sorted by compliance rate</p>
        </div>
      </header>

      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="4 4" stroke="#e2e8f0" />
            <XAxis type="number" domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
            <YAxis type="category" dataKey="squad" width={110} tick={{ fontSize: 12 }} />
            <Tooltip
              formatter={(value: string | number | undefined) => [formatPercent(Number(value ?? 0)), 'Compliance']}
            />
            <Bar
              dataKey="compliance"
              radius={[8, 8, 8, 8]}
              onClick={(payload) => {
                const squad = (payload as { squad?: string } | undefined)?.squad
                if (squad) {
                  onSelectSquad?.(squad)
                }
              }}
            >
              {data.map((entry) => (
                <Cell
                  key={entry.squad}
                  fill={entry.compliance >= 75 ? '#0d9488' : entry.compliance >= 50 ? '#6366f1' : '#ef4444'}
                  className="cursor-pointer"
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 grid gap-2 border-t border-slate-200 pt-4">
        {data.map((team, index) => (
          <div key={team.squad} className="flex items-center justify-between text-sm">
            <span className="font-medium text-slate-700">{team.squad}</span>
            <span className="text-slate-500" data-testid={`team-rank-${team.squad}`}>
              {index + 1}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}
