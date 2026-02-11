import { Info } from 'lucide-react'

import { ComplianceBySquadChart } from '../components/charts/ComplianceBySquadChart'
import { KpiStrip } from '../components/kpi/KpiStrip'
import { EmptyState } from '../components/states/EmptyState'
import { LoadingState } from '../components/states/LoadingState'
import { formatDateTime } from '../lib/utils'
import type { ComplianceStatusFilter, EpicOverviewItem, EpicsResponse, MetricsResponse } from '../types'

const EPIC_REASON_LABELS: Record<string, string> = {
  incomplete_dod_tasks: 'Incomplete DoD tasks',
  no_dod_tasks: 'No DoD tasks',
}

const TASK_REASON_LABELS: Record<string, string> = {
  missing_evidence_link: 'Missing evidence links',
  task_not_done: 'DoD tasks not done',
}

function toIssueTypes(epic: EpicOverviewItem): string[] {
  const issues = new Set<string>()
  for (const reason of epic.compliance_reasons) {
    issues.add(EPIC_REASON_LABELS[reason] ?? reason)
  }
  if (epic.missing_squad_labels) {
    issues.add('Missing squad labels')
  }
  if ((epic.squad_label_warnings?.length ?? 0) > 0) {
    issues.add('Invalid squad labels')
  }
  for (const task of epic.failing_dod_tasks) {
    if (task.non_compliance_reason) {
      issues.add(TASK_REASON_LABELS[task.non_compliance_reason] ?? task.non_compliance_reason)
    }
  }
  return Array.from(issues).sort((a, b) => a.localeCompare(b))
}

type OverviewPageProps = {
  loading: boolean
  error: string | null
  metrics: MetricsResponse | null
  epics: EpicsResponse | null
  onRunSync: () => void
  onLearnSnapshot: () => void
  onSelectSquad: (squad: string) => void
  onOpenEpics: (filter: ComplianceStatusFilter) => void
}

export function OverviewPage({
  loading,
  error,
  metrics,
  epics,
  onRunSync,
  onLearnSnapshot,
  onSelectSquad,
  onOpenEpics,
}: OverviewPageProps) {
  if (loading) {
    return <LoadingState variant="overview" />
  }

  if (error) {
    return (
      <section className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-700">
        <p className="font-semibold">{error}</p>
      </section>
    )
  }

  if (!metrics?.scope) {
    return (
      <EmptyState
        title="No sprint snapshot yet"
        description="No sprint snapshot data available yet. Run Jira sync first."
        primaryCtaLabel="Run Sync"
        onPrimaryCta={onRunSync}
        secondaryLinkLabel="What is a sprint snapshot?"
        onSecondaryClick={onLearnSnapshot}
      />
    )
  }

  const issuesBySquad = new Map<string, Set<string>>()
  for (const epic of epics?.epics ?? []) {
    if (epic.is_compliant) {
      continue
    }
    const issueTypes = toIssueTypes(epic)
    for (const squad of epic.teams) {
      const current = issuesBySquad.get(squad) ?? new Set<string>()
      for (const issue of issueTypes) {
        current.add(issue)
      }
      issuesBySquad.set(squad, current)
    }
  }

  const bySquad = [...metrics.by_team]
    .sort((a, b) => a.rank - b.rank)
    .map((team) => ({
      squad: team.team,
      compliance: team.compliance_percentage,
      totalEpics: team.total_epics,
      nonCompliant: team.non_compliant_epics,
      issueTypes: Array.from(issuesBySquad.get(team.team) ?? []).sort((a, b) => a.localeCompare(b)),
    }))

  const kpis = [
    {
      label: 'Total epics',
      value: String(metrics.summary.total_epics),
      hint: 'All epics in latest snapshot scope',
      onClick: () => onOpenEpics('all'),
    },
    {
      label: 'Compliant epics',
      value: String(metrics.summary.compliant_epics),
      hint: 'Meet DoD requirements',
      onClick: () => onOpenEpics('compliant'),
    },
    {
      label: 'Non-compliant epics',
      value: String(metrics.summary.non_compliant_epics),
      hint: 'Require action',
      onClick: () => onOpenEpics('non_compliant'),
    },
    {
      label: 'Missing squad labels',
      value: String(metrics.summary.epics_with_missing_squad_labels ?? 0),
      hint: 'Epics missing squad labels',
      onClick: () => onOpenEpics('non_compliant'),
    },
    {
      label: 'Invalid squad labels',
      value: String(metrics.summary.epics_with_invalid_squad_labels ?? 0),
      hint: 'Epics with malformed squad labels',
      onClick: () => onOpenEpics('non_compliant'),
    },
  ]

  const isAggregateScope = metrics.scope.scope_mode === 'aggregate'
  const sprintCount = metrics.scope.sprint_snapshot_count ?? metrics.scope.sprint_snapshot_ids?.length ?? 0

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{metrics.scope.sprint_name}</h2>
        {isAggregateScope ? (
          <p className="mt-1 text-sm text-slate-600">
            Aggregated across {sprintCount} active sprint snapshot{ sprintCount === 1 ? '' : 's' }.
          </p>
        ) : (
          <p className="mt-1 text-sm text-slate-600">
            Sprint ID: {metrics.scope.jira_sprint_id} | State: {metrics.scope.sprint_state}
          </p>
        )}
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
          <Info className="h-3.5 w-3.5" />
          Last synced {formatDateTime(metrics.scope.sync_timestamp)}
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Compliance overview</h3>
        <KpiStrip
          kpis={kpis}
          testIds={{
            'Total epics': 'kpi-total-epics',
            'Compliant epics': 'kpi-compliant-epics',
            'Non-compliant epics': 'kpi-non-compliant-epics',
            'Missing squad labels': 'kpi-missing-squad-labels',
            'Invalid squad labels': 'kpi-invalid-squad-labels',
          }}
        />
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Compliance by squad</h3>
        <div className="grid gap-4">
          <ComplianceBySquadChart data={bySquad} onSelectSquad={onSelectSquad} />
        </div>
      </section>
    </div>
  )
}
