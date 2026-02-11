import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'

import { Badge } from '../components/ui/Badge'
import { DataTable } from '../components/table/DataTable'
import { EmptyState } from '../components/states/EmptyState'
import { LoadingState } from '../components/states/LoadingState'
import { formatDateTime } from '../lib/utils'
import type { MetricsResponse, NonCompliantEpic, NonCompliantResponse } from '../types'

type NonCompliantEpicsPageProps = {
  loading: boolean
  error: string | null
  metrics: MetricsResponse | null
  nonCompliant: NonCompliantResponse | null
  nudgeFeedback: Record<string, string>
  nudgeInFlight: Record<string, boolean>
  canNudge: boolean
  onRequestNudge: (epicKey: string) => void
  onViewDetails: (epic: NonCompliantEpic) => void
}

type EpicRow = {
  key: string
  epic: NonCompliantEpic
  squad: string
  status: string
  category: string
  violationsCount: number
  lastUpdated: string
}

export function NonCompliantEpicsPage({
  loading,
  error,
  metrics,
  nonCompliant,
  nudgeFeedback,
  nudgeInFlight,
  canNudge,
  onRequestNudge,
  onViewDetails,
}: NonCompliantEpicsPageProps) {
  const rows: EpicRow[] = useMemo(
    () =>
      (nonCompliant?.epics ?? []).map((epic) => ({
        key: epic.jira_key,
        epic,
        squad: epic.teams.join(', ') || '-',
        status: epic.status_name || (epic.is_done ? 'Done' : 'Open'),
        category: Array.from(new Set(epic.failing_dod_tasks.map((task) => task.category))).join(', ') || '-',
        violationsCount: epic.failing_dod_tasks.length,
        lastUpdated: epic.nudge?.last_sent_at || metrics?.scope?.sync_timestamp || '',
      })),
    [metrics?.scope?.sync_timestamp, nonCompliant?.epics],
  )

  const columns = useMemo<ColumnDef<EpicRow, unknown>[]>(
    () => [
      {
        accessorKey: 'key',
        header: 'Epic',
        cell: ({ row }) => {
          const epic = row.original.epic
          return (
            <div className="space-y-1">
              <a
                href={epic.jira_url}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-indigo-600 hover:text-indigo-800"
              >
                {epic.jira_key}
              </a>
              <p className="text-slate-600">{epic.summary}</p>
            </div>
          )
        },
      },
      {
        accessorKey: 'squad',
        header: 'Squad',
      },
      {
        accessorKey: 'status',
        header: 'Epic status',
        cell: ({ row }) => <Badge tone={row.original.epic.is_done ? 'success' : 'warning'}>{row.original.status}</Badge>,
      },
      {
        accessorKey: 'category',
        header: 'DoD category',
        cell: ({ row }) => (
          <div className="space-y-1">
            <Badge tone="neutral">{row.original.category}</Badge>
            {row.original.epic.missing_squad_labels && (
              <p className="text-xs text-amber-700">Missing squad_ label</p>
            )}
            {(row.original.epic.squad_label_warnings?.length ?? 0) > 0 && (
              <p className="text-xs text-amber-700">
                Invalid squad labels: {(row.original.epic.squad_label_warnings ?? []).join(', ')}
              </p>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'violationsCount',
        header: 'Violations',
        cell: ({ row }) => {
          const tasks = row.original.epic.failing_dod_tasks
          if (tasks.length === 0) {
            return <span className="text-slate-500">No failing DoD tasks.</span>
          }
          return (
            <ul className="space-y-1.5">
              {tasks.slice(0, 3).map((task) => (
                <li key={task.jira_key} className="text-xs text-slate-600">
                  <strong>
                    {task.jira_url ? (
                      <a href={task.jira_url} target="_blank" rel="noreferrer" className="text-indigo-600">
                        {task.jira_key}
                      </a>
                    ) : (
                      task.jira_key
                    )}
                  </strong>{' '}
                  {task.summary}
                  <div>
                    {task.has_evidence_link && task.evidence_link ? (
                      <a href={task.evidence_link} target="_blank" rel="noreferrer" className="text-indigo-600">
                        Evidence link
                      </a>
                    ) : (
                      'Evidence link missing'
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )
        },
      },
      {
        accessorKey: 'lastUpdated',
        header: 'Last updated',
        cell: ({ row }) => formatDateTime(row.original.lastUpdated),
      },
      {
        id: 'action',
        header: 'Action',
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => {
          const epic = row.original.epic
          return (
            <div className="space-y-2">
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                onClick={() => onViewDetails(epic)}
              >
                View details
              </button>
              <button
                type="button"
                className="block rounded-lg border border-teal-600 bg-teal-50 px-2.5 py-1.5 text-xs font-semibold text-teal-700 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-100 disabled:text-slate-500"
                data-testid={`nudge-button-${epic.jira_key}`}
                disabled={!canNudge || Boolean(nudgeInFlight[epic.jira_key]) || Boolean(epic.nudge?.cooldown_active)}
                onClick={() => onRequestNudge(epic.jira_key)}
              >
                {nudgeInFlight[epic.jira_key] ? 'Sending...' : 'Review & nudge'}
              </button>
              {epic.nudge?.cooldown_active && (
                <p className="text-xs text-slate-500">
                  Cooldown: {Math.ceil(epic.nudge.seconds_remaining / 60)} min remaining
                </p>
              )}
              {nudgeFeedback[epic.jira_key] && (
                <p className="text-xs text-slate-500">{nudgeFeedback[epic.jira_key]}</p>
              )}
            </div>
          )
        },
      },
    ],
    [canNudge, nudgeFeedback, nudgeInFlight, onRequestNudge, onViewDetails],
  )

  if (loading) {
    return <LoadingState variant="table" />
  }

  if (error) {
    return (
      <section className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-700">{error}</section>
    )
  }

  if (!metrics?.scope) {
    return (
      <EmptyState
        title="No sprint data"
        description="No sprint snapshot data available yet. Run Jira sync first."
      />
    )
  }

  return (
    <div className="space-y-4">
      {!canNudge && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Your role has read-only access. Nudge action is disabled.
        </p>
      )}

      <p className="text-sm text-slate-600" data-testid="non-compliant-count">
        {nonCompliant?.count ?? 0} epic(s) require action.
      </p>

      <DataTable
        title="Non-compliant Epics"
        description="Sortable, searchable table with epic drilldowns."
        data={rows}
        columns={columns}
        searchPlaceholder="Search epics, squad, status..."
        emptyMessage="No non-compliant epics."
      />
    </div>
  )
}
