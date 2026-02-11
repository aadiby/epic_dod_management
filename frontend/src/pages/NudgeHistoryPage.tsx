import { useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { DataTable } from '../components/table/DataTable'
import { EmptyState } from '../components/states/EmptyState'
import { LoadingState } from '../components/states/LoadingState'
import { deriveNudgesByDay } from '../lib/mockTransform'
import { formatDate, formatDateTime } from '../lib/utils'
import type { MetricsResponse, NudgeHistoryEntry, NudgeHistoryResponse } from '../types'

type NudgeHistoryPageProps = {
  loading: boolean
  error: string | null
  metrics: MetricsResponse | null
  nudgeHistory: NudgeHistoryResponse | null
  onViewDetails: (entry: NudgeHistoryEntry) => void
}

type NudgeRow = {
  id: string
  sentAt: string
  epic: string
  team: string
  triggeredBy: string
  recipients: string
  status: string
  raw: NudgeHistoryEntry
}

export function NudgeHistoryPage({
  loading,
  error,
  metrics,
  nudgeHistory,
  onViewDetails,
}: NudgeHistoryPageProps) {
  const [teamFilter, setTeamFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  const teams = useMemo(() => {
    const values = new Set((nudgeHistory?.nudges ?? []).flatMap((entry) => entry.epic_teams))
    return Array.from(values).sort((a, b) => a.localeCompare(b))
  }, [nudgeHistory?.nudges])

  const rows = useMemo<NudgeRow[]>(() => {
    const baseRows = (nudgeHistory?.nudges ?? []).map((entry) => ({
      id: `${entry.epic_key}-${entry.sent_at}`,
      sentAt: entry.sent_at,
      epic: entry.epic_key,
      team: entry.epic_teams.join(', ') || '-',
      triggeredBy: entry.triggered_by,
      recipients: entry.recipient_emails.join(', '),
      status: 'sent',
      raw: entry,
    }))

    return baseRows.filter((entry) => {
      const teamMatch = teamFilter === 'all' || entry.team.includes(teamFilter)
      const statusMatch = statusFilter === 'all' || entry.status === statusFilter
      return teamMatch && statusMatch
    })
  }, [nudgeHistory?.nudges, statusFilter, teamFilter])

  const trendData = deriveNudgesByDay(nudgeHistory)

  const columns = useMemo<ColumnDef<NudgeRow, unknown>[]>(
    () => [
      {
        accessorKey: 'sentAt',
        header: 'Sent at',
        cell: ({ row }) => formatDateTime(row.original.sentAt),
      },
      {
        accessorKey: 'epic',
        header: 'Epic',
      },
      {
        accessorKey: 'team',
        header: 'Teams',
      },
      {
        accessorKey: 'triggeredBy',
        header: 'Triggered by',
      },
      {
        accessorKey: 'recipients',
        header: 'Recipients',
      },
      {
        id: 'action',
        header: 'Action',
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => (
          <button
            type="button"
            className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
            onClick={() => onViewDetails(row.original.raw)}
          >
            View details
          </button>
        ),
      },
    ],
    [onViewDetails],
  )

  if (loading) {
    return <LoadingState variant="table" />
  }

  if (error) {
    return <section className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-700">{error}</section>
  }

  if (!metrics?.scope) {
    return (
      <EmptyState
        title="No nudge history"
        description="No sprint snapshot data available yet. Run Jira sync first."
      />
    )
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Nudges Over Time</h3>
            <p className="text-sm text-slate-500">Daily trend for nudge activity</p>
          </div>
          <div className="flex gap-2">
            <select
              value={teamFilter}
              onChange={(event) => setTeamFilter(event.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
            >
              <option value="all">All squads</option>
              {teams.map((team) => (
                <option key={team} value={team}>
                  {team}
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
            >
              <option value="all">All status</option>
              <option value="sent">Sent</option>
            </select>
          </div>
        </div>

        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={trendData}>
              <CartesianGrid strokeDasharray="4 4" stroke="#e2e8f0" />
              <XAxis dataKey="date" tickFormatter={formatDate} />
              <YAxis allowDecimals={false} />
              <Tooltip labelFormatter={(label: unknown) => formatDate(typeof label === 'string' ? label : '')} />
              <Bar dataKey="count" fill="#6366f1" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <DataTable
        title="Nudge History"
        description="Search, sort, and inspect full nudge payloads."
        data={rows}
        columns={columns}
        searchPlaceholder="Search by epic, user, team, recipient..."
        emptyMessage="No nudge history for this filter."
      />
    </div>
  )
}
