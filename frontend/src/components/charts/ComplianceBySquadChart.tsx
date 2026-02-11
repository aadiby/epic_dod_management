import { Badge } from '../ui/Badge'

import { formatPercent } from '../../lib/utils'

type ComplianceBySquadChartProps = {
  data: Array<{
    squad: string
    compliance: number
    totalEpics: number
    nonCompliant: number
    issueTypes: string[]
  }>
  onSelectSquad?: (squad: string) => void
}

export function ComplianceBySquadChart({ data, onSelectSquad }: ComplianceBySquadChartProps) {
  return (
    <section className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
      <header className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Compliance by Squad</h3>
          <p className="text-sm text-slate-500">Latest snapshot issues by squad</p>
        </div>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Squad</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Compliance</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Epics</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Issues</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Action</th>
            </tr>
          </thead>
          <tbody>
            {data.map((team, index) => (
              <tr key={team.squad} className="border-b border-slate-100 align-top">
                <td className="px-3 py-3 text-sm font-medium text-slate-800">
                  {team.squad}
                  <span className="ml-2 text-xs text-slate-500" data-testid={`team-rank-${team.squad}`}>
                    #{index + 1}
                  </span>
                </td>
                <td className="px-3 py-3 text-sm text-slate-700">{formatPercent(team.compliance)}</td>
                <td className="px-3 py-3 text-sm text-slate-700">
                  {team.nonCompliant}/{team.totalEpics} non-compliant
                </td>
                <td className="px-3 py-3 text-sm text-slate-700">
                  {team.issueTypes.length === 0 ? (
                    <Badge tone="success">No issues</Badge>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {team.issueTypes.map((issue) => (
                        <Badge key={`${team.squad}-${issue}`} tone="warning">
                          {issue}
                        </Badge>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-3 py-3 text-right">
                  <button
                    type="button"
                    className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                    onClick={() => onSelectSquad?.(team.squad)}
                  >
                    View squad
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
