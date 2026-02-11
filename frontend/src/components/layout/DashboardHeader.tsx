import { Activity, RefreshCw, RotateCw, LogOut } from 'lucide-react'

import type { HealthStatus, UserRole } from '../../types'
import { cn } from '../../lib/utils'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'

type DashboardHeaderProps = {
  title: string
  subtitle: string
  healthStatus: HealthStatus
  healthMessage: string
  sessionLoading: boolean
  username?: string
  role?: UserRole
  roleAuthEnabled: boolean
  isAuthenticated: boolean
  onRefresh: () => void
  onRunSync?: () => void
  syncDisabled?: boolean
  showSyncButton?: boolean
  onSignOut?: () => void
}

function healthTone(status: HealthStatus): 'success' | 'warning' | 'error' | 'neutral' {
  if (status === 'healthy') {
    return 'success'
  }
  if (status === 'unhealthy') {
    return 'error'
  }
  return 'warning'
}

export function DashboardHeader({
  title,
  subtitle,
  healthStatus,
  healthMessage,
  sessionLoading,
  username,
  role,
  roleAuthEnabled,
  isAuthenticated,
  onRefresh,
  onRunSync,
  syncDisabled,
  showSyncButton,
  onSignOut,
}: DashboardHeaderProps) {
  return (
    <header className="rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 lg:text-3xl">{title}</h1>
          <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={healthTone(healthStatus)} className="gap-1.5" >
            <Activity className="h-3.5 w-3.5" />
            <span data-testid="health-badge">{healthMessage}</span>
          </Badge>

          {sessionLoading && <Badge tone="warning">Session loading...</Badge>}
          {!sessionLoading && roleAuthEnabled && username && role && (
            <Badge tone="neutral" data-testid="session-role-badge">
              {username} ({role})
            </Badge>
          )}

          {showSyncButton && onRunSync && (
            <Button
              type="button"
              className="gap-2 bg-indigo-600 border-indigo-600 hover:bg-indigo-700"
              disabled={Boolean(syncDisabled)}
              onClick={onRunSync}
            >
              <RotateCw className={cn('h-4 w-4', syncDisabled ? '' : 'animate-pulse')} />
              Sync
            </Button>
          )}

          <Button
            type="button"
            className="gap-2"
            onClick={onRefresh}
            data-testid="refresh-dashboard"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh data
          </Button>

          {!sessionLoading && roleAuthEnabled && isAuthenticated && onSignOut && (
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:shadow-sm"
              onClick={onSignOut}
              data-testid="logout-button"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
