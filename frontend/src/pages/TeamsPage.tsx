import { Badge } from '../components/ui/Badge'
import { EmptyState } from '../components/states/EmptyState'
import { formatPercent } from '../lib/utils'
import type { MetricsResponse, TeamConfig } from '../types'

type TeamsPageProps = {
  teams: TeamConfig[]
  metrics: MetricsResponse | null
  teamDrafts: Record<string, string>
  teamScrumDrafts: Record<string, string>
  teamSaveState: Record<string, boolean>
  teamScrumSaveState: Record<string, boolean>
  teamFeedback: Record<string, string>
  teamScrumFeedback: Record<string, string>
  onDraftChange: (teamKey: string, value: string) => void
  onScrumDraftChange: (teamKey: string, value: string) => void
  onSave: (teamKey: string) => void
  onSaveScrumMasters: (teamKey: string) => void
  canManageTeams: boolean
  onViewTeam: (team: TeamConfig) => void
}

function complianceForTeam(metrics: MetricsResponse | null, key: string): number {
  const team = metrics?.by_team.find((entry) => entry.team === key)
  return team?.compliance_percentage ?? 0
}

export function TeamsPage({
  teams,
  metrics,
  teamDrafts,
  teamScrumDrafts,
  teamSaveState,
  teamScrumSaveState,
  teamFeedback,
  teamScrumFeedback,
  onDraftChange,
  onScrumDraftChange,
  onSave,
  onSaveScrumMasters,
  canManageTeams,
  onViewTeam,
}: TeamsPageProps) {
  if (teams.length === 0) {
    return <EmptyState title="No teams found" description="Sync Jira data to populate teams." />
  }

  return (
    <div className="space-y-4">
      {!canManageTeams && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Admin role is required to update recipients. View-only mode is active.
        </p>
      )}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {teams.map((team) => {
          const compliance = complianceForTeam(metrics, team.key)

          return (
            <article
              key={team.key}
              className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">{team.display_name || team.key}</h3>
                  <p className="text-xs text-slate-500">{team.key}</p>
                </div>
                <Badge tone={team.is_active ? 'success' : 'neutral'}>{team.is_active ? 'Active' : 'Inactive'}</Badge>
              </div>

              <div className="mb-4">
                <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                  <span>Compliance</span>
                  <span>{formatPercent(compliance)}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100">
                  <div
                    className="h-2 rounded-full bg-gradient-to-r from-teal-500 to-indigo-500"
                    style={{ width: `${Math.min(100, Math.max(0, compliance))}%` }}
                  />
                </div>
              </div>

              <div className="space-y-3">
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Recipients
                  <input
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700"
                    data-testid={`team-recipients-${team.key}`}
                    value={teamDrafts[team.key] ?? ''}
                    onChange={(event) => onDraftChange(team.key, event.target.value)}
                    disabled={!canManageTeams}
                  />
                </label>
                {teamFeedback[team.key] && <p className="text-xs text-slate-500">{teamFeedback[team.key]}</p>}

                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Scrum masters
                  <input
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700"
                    data-testid={`team-scrum-masters-${team.key}`}
                    value={teamScrumDrafts[team.key] ?? ''}
                    onChange={(event) => onScrumDraftChange(team.key, event.target.value)}
                    disabled={!canManageTeams}
                  />
                </label>
                {teamScrumFeedback[team.key] && (
                  <p className="text-xs text-slate-500">{teamScrumFeedback[team.key]}</p>
                )}

                <div className="flex flex-wrap gap-2 pt-2">
                  <button
                    type="button"
                    className="rounded-lg border border-teal-600 bg-teal-50 px-2.5 py-1.5 text-xs font-semibold text-teal-700 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-100 disabled:text-slate-500"
                    data-testid={`save-team-${team.key}`}
                    disabled={!canManageTeams || Boolean(teamSaveState[team.key])}
                    onClick={() => onSave(team.key)}
                  >
                    {teamSaveState[team.key] ? 'Saving...' : 'Save Recipients'}
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-teal-600 bg-teal-50 px-2.5 py-1.5 text-xs font-semibold text-teal-700 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-100 disabled:text-slate-500"
                    data-testid={`save-team-scrum-${team.key}`}
                    disabled={!canManageTeams || Boolean(teamScrumSaveState[team.key])}
                    onClick={() => onSaveScrumMasters(team.key)}
                  >
                    {teamScrumSaveState[team.key] ? 'Saving...' : 'Save Scrum Masters'}
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                    onClick={() => onViewTeam(team)}
                  >
                    View details
                  </button>
                </div>
              </div>
            </article>
          )
        })}
      </section>
    </div>
  )
}
