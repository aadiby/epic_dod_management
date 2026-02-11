import { AlertTriangle, CheckCircle2, Clock3, LoaderCircle } from 'lucide-react'

import { formatDateTime } from '../lib/utils'
import type { SyncStatusResponse } from '../types'

type SyncPageProps = {
  syncProjectKey: string
  syncRunning: boolean
  syncFeedback: string
  syncStatus: SyncStatusResponse | null
  onProjectChange: (value: string) => void
  onRunSync: () => void
  canRunSync: boolean
}

function durationText(startedAt: string, finishedAt: string | null): string {
  if (!finishedAt) {
    return 'Running'
  }
  const start = new Date(startedAt).getTime()
  const end = new Date(finishedAt).getTime()
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return '-'
  }
  return `${Math.max(0, Math.round((end - start) / 1000))}s`
}

export function SyncPage({
  syncProjectKey,
  syncRunning,
  syncFeedback,
  syncStatus,
  onProjectChange,
  onRunSync,
  canRunSync,
}: SyncPageProps) {
  const run = syncStatus?.latest_run
  const healthy = Boolean(syncStatus && !syncStatus.freshness.is_stale)

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Jira Sync Control</h2>
            <p className="text-sm text-slate-500">Run manual sync and inspect run timeline.</p>
          </div>
          {healthy ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" /> Healthy
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5" /> Needs attention
            </span>
          )}
        </div>

        {!canRunSync && (
          <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Admin role is required to run manual sync.
          </p>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-[240px_auto]">
          <input
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700"
            placeholder="Project key (default: CS0100)"
            value={syncProjectKey}
            onChange={(event) => onProjectChange(event.target.value)}
            data-testid="sync-project-key"
            disabled={!canRunSync}
          />
          <button
            type="button"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-teal-600 bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-300"
            data-testid="sync-run-button"
            disabled={!canRunSync || syncRunning}
            onClick={onRunSync}
          >
            {syncRunning ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Clock3 className="h-4 w-4" />}
            {syncRunning ? 'Running sync...' : 'Run Sync'}
          </button>
        </div>

        {syncFeedback && (
          <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            {syncFeedback}
          </p>
        )}

        {!healthy && (
          <p className="mt-3 text-sm text-amber-700">
            Diagnostic hint: ensure Jira credentials are valid and run a manual sync to refresh snapshots.
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm">
        <h3 className="text-base font-semibold text-slate-900">Sync Status Timeline</h3>
        <div className="mt-4 space-y-3 border-l border-slate-200 pl-4">
          <article className="relative rounded-xl border border-slate-200 bg-slate-50 p-3">
            <span className="absolute -left-[1.33rem] top-4 h-2.5 w-2.5 rounded-full bg-indigo-500" />
            <p className="text-sm font-semibold text-slate-800">Last sync run</p>
            <p className="text-sm text-slate-600">
              {run
                ? `${run.status} at ${formatDateTime(run.started_at)}`
                : 'No sync run yet.'}
            </p>
            {run && (
              <p className="mt-1 text-xs text-slate-500">Duration: {durationText(run.started_at, run.finished_at)}</p>
            )}
          </article>

          <article className="relative rounded-xl border border-slate-200 bg-slate-50 p-3">
            <span className="absolute -left-[1.33rem] top-4 h-2.5 w-2.5 rounded-full bg-teal-500" />
            <p className="text-sm font-semibold text-slate-800">Items processed</p>
            <p className="text-sm text-slate-600">
              {run
                ? `sprints=${run.sprint_snapshots}, epics=${run.epic_snapshots}, dod_tasks=${run.dod_task_snapshots}`
                : '-'}
            </p>
          </article>

          <article className="relative rounded-xl border border-slate-200 bg-slate-50 p-3">
            <span className="absolute -left-[1.33rem] top-4 h-2.5 w-2.5 rounded-full bg-rose-500" />
            <p className="text-sm font-semibold text-slate-800">Errors</p>
            <p className="text-sm text-slate-600">{run?.error_message || 'No errors reported.'}</p>
          </article>

          <article className="relative rounded-xl border border-slate-200 bg-slate-50 p-3">
            <span className="absolute -left-[1.33rem] top-4 h-2.5 w-2.5 rounded-full bg-amber-500" />
            <p className="text-sm font-semibold text-slate-800">Latest snapshot</p>
            <p className="text-sm text-slate-600">
              {syncStatus?.latest_snapshot
                ? `${syncStatus.latest_snapshot.sprint_name} (${syncStatus.latest_snapshot.sprint_state})`
                : 'No snapshot available.'}
            </p>
          </article>
        </div>
      </section>
    </div>
  )
}
