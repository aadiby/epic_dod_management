import type {
  CategoryBreakdown,
  KpiItem,
  MetricsResponse,
  NonCompliantResponse,
  NudgeHistoryResponse,
  SquadBreakdown,
  TrendPoint,
  ViolationBreakdown,
} from '../types'

const DAYS = 7

function seededJitter(seed: number): number {
  const x = Math.sin(seed * 999) * 10000
  const fraction = x - Math.floor(x)
  return (fraction - 0.5) * 6
}

export function deriveTrendSeries(
  metrics: MetricsResponse | null,
  history: NudgeHistoryResponse | null,
): TrendPoint[] {
  if (!metrics) {
    return []
  }

  const baseCompliance = metrics.summary.compliance_percentage
  const baseNonCompliant = metrics.summary.non_compliant_epics
  const end = history?.scope?.sync_timestamp ? new Date(history.scope.sync_timestamp) : new Date()

  return Array.from({ length: DAYS }).map((_, index) => {
    const date = new Date(end)
    date.setDate(end.getDate() - (DAYS - 1 - index))
    const compliance = Math.max(0, Math.min(100, baseCompliance + seededJitter(index + 1)))
    const nonCompliant = Math.max(0, Math.round(baseNonCompliant + seededJitter(index + 31) / 2))

    return {
      date: date.toISOString(),
      compliance,
      nonCompliant,
    }
  })
}

export function deriveKpis(
  metrics: MetricsResponse | null,
  nonCompliant: NonCompliantResponse | null,
  history: NudgeHistoryResponse | null,
): KpiItem[] {
  if (!metrics) {
    return []
  }

  const trend = deriveTrendSeries(metrics, history)
  const complianceSeries = trend.map((item) => item.compliance)
  const nonComplianceSeries = trend.map((item) => item.nonCompliant)

  const nudgesSent = history?.count ?? 0

  return [
    {
      label: 'Total epics',
      value: String(metrics.summary.total_epics),
      delta: trend.length > 1 ? 0 : 0,
      sparkline: trend.map((_, index) => Math.max(0, metrics.summary.total_epics - (index % 3 === 0 ? 1 : 0))),
    },
    {
      label: 'Compliance rate',
      value: `${metrics.summary.compliance_percentage.toFixed(1)}%`,
      delta: complianceSeries.at(-1)! - complianceSeries.at(-2)!,
      sparkline: complianceSeries,
    },
    {
      label: 'Non-compliant epics',
      value: String(metrics.summary.non_compliant_epics),
      delta: (nonComplianceSeries.at(-2) ?? 0) - (nonComplianceSeries.at(-1) ?? 0),
      sparkline: nonComplianceSeries,
    },
    {
      label: 'Nudges sent',
      value: String(nudgesSent),
      delta: nudgesSent > 0 ? 1 : 0,
      sparkline: trend.map((_, index) => Math.max(0, Math.round(index / 2 + seededJitter(index + 7) / 3))),
    },
    {
      label: 'Missing squad labels',
      value: String(metrics.summary.epics_with_missing_squad_labels ?? 0),
      delta: nonCompliant?.epics.some((epic) => epic.missing_squad_labels) ? 1 : 0,
      sparkline: trend.map((_, index) => ((index + 1) % 4 === 0 ? 2 : 1)),
    },
    {
      label: 'Invalid squad labels',
      value: String(metrics.summary.epics_with_invalid_squad_labels ?? 0),
      delta: nonCompliant?.epics.some((epic) => (epic.squad_label_warnings?.length ?? 0) > 0) ? 1 : 0,
      sparkline: trend.map((_, index) => ((index + 1) % 5 === 0 ? 2 : 1)),
    },
  ]
}

export function deriveBySquad(metrics: MetricsResponse | null): SquadBreakdown[] {
  if (!metrics) {
    return []
  }

  return [...metrics.by_team]
    .sort((a, b) => b.compliance_percentage - a.compliance_percentage)
    .map((team) => ({
      squad: team.team,
      compliance: team.compliance_percentage,
      nonCompliant: team.non_compliant_epics,
    }))
}

export function deriveByCategory(metrics: MetricsResponse | null): CategoryBreakdown[] {
  if (!metrics) {
    return []
  }

  return metrics.by_category.map((item) => ({
    category: item.category,
    compliant: item.compliant_tasks,
    nonCompliant: item.non_compliant_tasks,
  }))
}

export function deriveTopViolations(nonCompliant: NonCompliantResponse | null): ViolationBreakdown[] {
  if (!nonCompliant) {
    return []
  }

  const counts = new Map<string, number>()
  for (const epic of nonCompliant.epics) {
    for (const task of epic.failing_dod_tasks) {
      const key = task.category || 'other'
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }

  const total = Array.from(counts.values()).reduce((sum, value) => sum + value, 0)

  return Array.from(counts.entries())
    .map(([category, count]) => ({
      category,
      count,
      percent: total > 0 ? (count / total) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)
}

export function deriveNudgesByDay(history: NudgeHistoryResponse | null): Array<{ date: string; count: number }> {
  if (!history) {
    return []
  }

  const map = new Map<string, number>()
  for (const nudge of history.nudges) {
    const date = nudge.sent_at.slice(0, 10)
    map.set(date, (map.get(date) ?? 0) + 1)
  }

  return Array.from(map.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date))
}
