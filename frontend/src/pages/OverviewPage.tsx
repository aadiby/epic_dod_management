import { Info } from 'lucide-react'

import { CategoryBreakdownChart } from '../components/charts/CategoryBreakdownChart'
import { ComplianceBySquadChart } from '../components/charts/ComplianceBySquadChart'
import { TopViolations } from '../components/charts/TopViolations'
import { TrendChart } from '../components/charts/TrendChart'
import { KpiStrip } from '../components/kpi/KpiStrip'
import { EmptyState } from '../components/states/EmptyState'
import { LoadingState } from '../components/states/LoadingState'
import {
  deriveByCategory,
  deriveBySquad,
  deriveKpis,
  deriveTopViolations,
  deriveTrendSeries,
} from '../lib/mockTransform'
import { formatDateTime } from '../lib/utils'
import type { MetricsResponse, NonCompliantResponse, NudgeHistoryResponse } from '../types'

type OverviewPageProps = {
  loading: boolean
  error: string | null
  metrics: MetricsResponse | null
  nonCompliant: NonCompliantResponse | null
  nudgeHistory: NudgeHistoryResponse | null
  onRunSync: () => void
  onLearnSnapshot: () => void
  onSelectSquad: (squad: string) => void
}

export function OverviewPage({
  loading,
  error,
  metrics,
  nonCompliant,
  nudgeHistory,
  onRunSync,
  onLearnSnapshot,
  onSelectSquad,
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

  const kpis = deriveKpis(metrics, nonCompliant, nudgeHistory)
  const trend = deriveTrendSeries(metrics, nudgeHistory)
  const bySquad = deriveBySquad(metrics)
  const byCategory = deriveByCategory(metrics)
  const topViolations = deriveTopViolations(nonCompliant)
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
            'Compliance rate': 'kpi-compliance-rate',
            'Missing squad labels': 'kpi-missing-squad-labels',
            'Invalid squad labels': 'kpi-invalid-squad-labels',
          }}
        />
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Breakdowns</h3>
        <div className="grid gap-4 xl:grid-cols-2">
          <ComplianceBySquadChart data={bySquad} onSelectSquad={onSelectSquad} />
          <TrendChart data={trend} />
          <CategoryBreakdownChart data={byCategory} />
          <TopViolations data={topViolations} />
        </div>
      </section>
    </div>
  )
}
