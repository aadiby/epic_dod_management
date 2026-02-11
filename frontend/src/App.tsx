import { useEffect, useMemo, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import * as Tabs from '@radix-ui/react-tabs'
import { toast, Toaster } from 'sonner'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'

import { DetailsDrawer } from './components/drawer/DetailsDrawer'
import { FilterBar } from './components/filters/FilterBar'
import { DashboardHeader } from './components/layout/DashboardHeader'
import { formatDateTime } from './lib/utils'
import { LoginPage } from './pages/LoginPage'
import { NudgeHistoryPage } from './pages/NudgeHistoryPage'
import { NonCompliantEpicsPage } from './pages/NonCompliantEpicsPage'
import { OverviewPage } from './pages/OverviewPage'
import { SyncPage } from './pages/SyncPage'
import { TeamsPage } from './pages/TeamsPage'
import type {
  AuthSessionResponse,
  DrawerDetail,
  EpicStatus,
  HealthStatus,
  MetricsResponse,
  NonCompliantEpic,
  NonCompliantResponse,
  NudgeHistoryEntry,
  NudgeHistoryResponse,
  SyncStatusResponse,
  TeamConfig,
  TeamsResponse,
} from './types'

function getCookieValue(name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : ''
}

function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return window.fetch(input, {
    cache: 'no-store',
    credentials: 'same-origin',
    ...(init ?? {}),
  })
}

function toSquadArray(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

function AppContent() {
  const location = useLocation()
  const navigate = useNavigate()

  const [status, setStatus] = useState<HealthStatus>('loading')
  const [message, setMessage] = useState('Checking backend connectivity...')
  const [session, setSession] = useState<AuthSessionResponse | null>(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [authRefreshCounter, setAuthRefreshCounter] = useState(0)
  const [loginUsername, setLoginUsername] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginSubmitting, setLoginSubmitting] = useState(false)
  const [loginError, setLoginError] = useState('')

  const [squadFilter, setSquadFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [epicStatusFilter, setEpicStatusFilter] = useState<EpicStatus>('all')

  const [metrics, setMetrics] = useState<MetricsResponse | null>(null)
  const [nonCompliant, setNonCompliant] = useState<NonCompliantResponse | null>(null)
  const [dashboardLoading, setDashboardLoading] = useState(true)
  const [dashboardError, setDashboardError] = useState<string | null>(null)
  const [refreshCounter, setRefreshCounter] = useState(0)

  const [nudgeFeedback, setNudgeFeedback] = useState<Record<string, string>>({})
  const [nudgeInFlight, setNudgeInFlight] = useState<Record<string, boolean>>({})
  const [nudgeHistory, setNudgeHistory] = useState<NudgeHistoryResponse | null>(null)

  const [teams, setTeams] = useState<TeamConfig[]>([])
  const [teamDrafts, setTeamDrafts] = useState<Record<string, string>>({})
  const [teamScrumDrafts, setTeamScrumDrafts] = useState<Record<string, string>>({})
  const [teamSaveState, setTeamSaveState] = useState<Record<string, boolean>>({})
  const [teamScrumSaveState, setTeamScrumSaveState] = useState<Record<string, boolean>>({})
  const [teamFeedback, setTeamFeedback] = useState<Record<string, string>>({})
  const [teamScrumFeedback, setTeamScrumFeedback] = useState<Record<string, string>>({})

  const [syncStatus, setSyncStatus] = useState<SyncStatusResponse | null>(null)
  const [syncRunning, setSyncRunning] = useState(false)
  const [syncFeedback, setSyncFeedback] = useState('')
  const [syncProjectKey, setSyncProjectKey] = useState('')

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerDetail, setDrawerDetail] = useState<DrawerDetail | null>(null)

  const [nudgeModalEpicKey, setNudgeModalEpicKey] = useState<string | null>(null)
  const [nudgeModalRecipients, setNudgeModalRecipients] = useState('')
  const [nudgeModalError, setNudgeModalError] = useState('')
  const [toastMessages, setToastMessages] = useState<Array<{ id: number; kind: 'success' | 'error'; text: string }>>(
    [],
  )

  const roleAuthEnabled = Boolean(session?.role_auth_enabled)
  const isAuthenticated = Boolean(session?.authenticated)
  const currentRole = session?.user?.role ?? 'none'
  const requiresLogin = !sessionLoading && roleAuthEnabled && !isAuthenticated

  const canNudge = !roleAuthEnabled || currentRole === 'admin' || currentRole === 'scrum_master'
  const showAdminPages = !roleAuthEnabled || currentRole === 'admin'
  const canManageTeams = showAdminPages
  const canRunSync = showAdminPages

  const selectedSquads = useMemo(() => toSquadArray(squadFilter), [squadFilter])

  const availableSquads = useMemo(() => {
    const values = new Set<string>()
    for (const team of metrics?.by_team ?? []) {
      values.add(team.team)
    }
    for (const epic of nonCompliant?.epics ?? []) {
      for (const team of epic.teams) {
        values.add(team)
      }
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b))
  }, [metrics?.by_team, nonCompliant?.epics])

  const jsonHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    const csrfToken = getCookieValue('csrftoken')
    if (csrfToken) {
      headers['X-CSRFToken'] = csrfToken
    }
    return headers
  }

  useEffect(() => {
    const controller = new AbortController()

    const loadHealth = async () => {
      try {
        const response = await apiFetch('/api/health', {
          signal: controller.signal,
          credentials: 'same-origin',
        })

        if (!response.ok) {
          throw new Error(`Unexpected status ${response.status}`)
        }

        const payload = (await response.json()) as { status?: string }
        if (payload.status !== 'ok') {
          throw new Error('Backend reported unhealthy state')
        }

        setStatus('healthy')
        setMessage('Backend healthy')
      } catch {
        if (controller.signal.aborted) {
          return
        }

        setStatus('unhealthy')
        setMessage('Backend unavailable')
      }
    }

    void loadHealth()

    return () => {
      controller.abort()
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    const loadSession = async () => {
      setSessionLoading(true)
      try {
        const response = await apiFetch('/api/auth/session', {
          signal: controller.signal,
          credentials: 'same-origin',
        })

        if (!response.ok) {
          throw new Error(`Session endpoint failed: ${response.status}`)
        }

        const payload = (await response.json()) as AuthSessionResponse
        setSession(payload)
      } catch {
        if (controller.signal.aborted) {
          return
        }

        setSession({
          authenticated: false,
          role_auth_enabled: false,
          user: null,
        })
      } finally {
        if (!controller.signal.aborted) {
          setSessionLoading(false)
        }
      }
    }

    void loadSession()

    return () => {
      controller.abort()
    }
  }, [authRefreshCounter])

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    if (squadFilter.trim()) {
      params.set('squad', squadFilter.trim())
    }
    if (categoryFilter) {
      params.set('category', categoryFilter)
    }
    if (epicStatusFilter !== 'all') {
      params.set('epic_status', epicStatusFilter)
    }
    const serialized = params.toString()
    return serialized ? `?${serialized}` : ''
  }, [squadFilter, categoryFilter, epicStatusFilter])

  const historyQueryString = useMemo(() => {
    const params = new URLSearchParams()
    if (squadFilter.trim()) {
      params.set('squad', squadFilter.trim())
    }
    const serialized = params.toString()
    return serialized ? `?${serialized}` : ''
  }, [squadFilter])

  useEffect(() => {
    const controller = new AbortController()

    const loadDashboard = async () => {
      if (sessionLoading) {
        return
      }

      if (roleAuthEnabled && !isAuthenticated) {
        setDashboardLoading(false)
        setDashboardError(null)
        setMetrics(null)
        setNonCompliant(null)
        setNudgeHistory(null)
        return
      }

      setDashboardLoading(true)
      setDashboardError(null)

      try {
        const [metricsResponse, nonCompliantResponse, historyResponse] = await Promise.all([
          apiFetch(`/api/metrics${queryString}`, {
            signal: controller.signal,
            credentials: 'same-origin',
          }),
          apiFetch(`/api/epics/non-compliant${queryString}`, {
            signal: controller.signal,
            credentials: 'same-origin',
          }),
          apiFetch(`/api/nudges/history${historyQueryString}`, {
            signal: controller.signal,
            credentials: 'same-origin',
          }),
        ])

        if (!metricsResponse.ok) {
          throw new Error(`Metrics endpoint failed with status ${metricsResponse.status}`)
        }
        if (!nonCompliantResponse.ok) {
          throw new Error(`Non-compliant endpoint failed with status ${nonCompliantResponse.status}`)
        }
        if (!historyResponse.ok) {
          throw new Error(`Nudge history endpoint failed with status ${historyResponse.status}`)
        }

        const [metricsPayload, nonCompliantPayload, historyPayload] = (await Promise.all([
          metricsResponse.json(),
          nonCompliantResponse.json(),
          historyResponse.json(),
        ])) as [MetricsResponse, NonCompliantResponse, NudgeHistoryResponse]

        setMetrics(metricsPayload)
        setNonCompliant(nonCompliantPayload)
        setNudgeHistory(historyPayload)
      } catch {
        if (controller.signal.aborted) {
          return
        }
        setDashboardError('Unable to load dashboard data.')
      } finally {
        if (!controller.signal.aborted) {
          setDashboardLoading(false)
        }
      }
    }

    void loadDashboard()

    return () => {
      controller.abort()
    }
  }, [queryString, historyQueryString, refreshCounter, sessionLoading, roleAuthEnabled, isAuthenticated])

  useEffect(() => {
    const controller = new AbortController()

    const loadSyncStatus = async () => {
      if (sessionLoading || (roleAuthEnabled && !isAuthenticated)) {
        setSyncStatus(null)
        return
      }

      try {
        const response = await apiFetch('/api/sync/status', {
          signal: controller.signal,
          credentials: 'same-origin',
        })
        if (!response.ok) {
          throw new Error(`Sync status failed with ${response.status}`)
        }
        const payload = (await response.json()) as SyncStatusResponse
        setSyncStatus(payload)
      } catch {
        if (controller.signal.aborted) {
          return
        }
      }
    }

    void loadSyncStatus()

    return () => {
      controller.abort()
    }
  }, [refreshCounter, sessionLoading, roleAuthEnabled, isAuthenticated])

  useEffect(() => {
    const controller = new AbortController()

    const loadTeams = async () => {
      if (sessionLoading || (roleAuthEnabled && !isAuthenticated)) {
        setTeams([])
        return
      }

      try {
        const response = await apiFetch('/api/teams', {
          signal: controller.signal,
          credentials: 'same-origin',
        })
        if (!response.ok) {
          throw new Error(`Teams endpoint failed with status ${response.status}`)
        }
        const payload = (await response.json()) as TeamsResponse
        setTeams(
          payload.teams.map((team) => ({
            ...team,
            scrum_masters: team.scrum_masters ?? [],
          })),
        )
      } catch {
        if (controller.signal.aborted) {
          return
        }
      }
    }

    void loadTeams()

    return () => {
      controller.abort()
    }
  }, [refreshCounter, sessionLoading, roleAuthEnabled, isAuthenticated])

  useEffect(() => {
    setTeamDrafts((previous) => {
      const next = { ...previous }
      for (const team of teams) {
        if (!(team.key in next)) {
          next[team.key] = team.notification_emails.join(', ')
        }
      }
      return next
    })
  }, [teams])

  useEffect(() => {
    setTeamScrumDrafts((previous) => {
      const next = { ...previous }
      for (const team of teams) {
        if (!(team.key in next)) {
          next[team.key] = (team.scrum_masters ?? []).join(', ')
        }
      }
      return next
    })
  }, [teams])

  const categoryOptions = useMemo(() => {
    const options = new Set(metrics?.by_category.map((item) => item.category) ?? [])
    if (categoryFilter) {
      options.add(categoryFilter)
    }
    return Array.from(options).sort((a, b) => a.localeCompare(b))
  }, [metrics, categoryFilter])

  const showFilterPanel =
    !requiresLogin &&
    (location.pathname === '/' || location.pathname === '/epics' || location.pathname === '/nudges')

  const selectedNudgeEpic = useMemo(
    () => nonCompliant?.epics.find((epic) => epic.jira_key === nudgeModalEpicKey) ?? null,
    [nonCompliant, nudgeModalEpicKey],
  )

  const staleSyncMessage = useMemo(() => {
    if (requiresLogin) {
      return ''
    }
    if (!syncStatus?.freshness?.is_stale) {
      return ''
    }
    if (syncStatus.freshness.status === 'missing') {
      return 'No sprint snapshot available yet. Run a sync to populate dashboard data.'
    }
    const ageMinutes = syncStatus.freshness.age_minutes ?? 0
    return `Sync data is stale (${ageMinutes} minutes old). Threshold is ${syncStatus.freshness.stale_threshold_minutes} minutes.`
  }, [requiresLogin, syncStatus])

  const tabValue = useMemo(() => {
    if (location.pathname === '/epics') {
      return '/epics'
    }
    if (location.pathname === '/nudges') {
      return '/nudges'
    }
    if (location.pathname === '/teams') {
      return '/teams'
    }
    if (location.pathname === '/sync') {
      return '/sync'
    }
    return '/'
  }, [location.pathname])

  const parseRecipients = (raw: string): string[] =>
    raw
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0)

  const pushToast = (kind: 'success' | 'error', text: string) => {
    if (import.meta.env.MODE !== 'test') {
      if (kind === 'success') {
        toast.success(text)
      } else {
        toast.error(text)
      }
    }

    const id = Date.now() + Math.floor(Math.random() * 1000)
    setToastMessages((current) => [...current, { id, kind, text }])
    window.setTimeout(() => {
      setToastMessages((current) => current.filter((item) => item.id !== id))
    }, 4500)
  }

  const defaultRecipientsForTeams = (teamKeys: string[]): string[] => {
    const values = new Set<string>()
    for (const teamKey of teamKeys) {
      const match = teams.find((team) => team.key === teamKey)
      if (!match) {
        continue
      }
      for (const email of match.notification_emails) {
        const normalized = email.trim()
        if (normalized) {
          values.add(normalized)
        }
      }
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b))
  }

  const buildNudgePreview = (epic: NonCompliantEpic, recipients: string[]) => {
    const lines = [
      `Epic: ${epic.jira_key} - ${epic.summary}`,
      `Teams: ${epic.teams.join(', ') || '-'}`,
      `Recipients: ${recipients.length > 0 ? recipients.join(', ') : '(defaults from backend)'}`,
      '',
      'Non-compliant DoD tasks:',
    ]

    if (epic.failing_dod_tasks.length === 0) {
      lines.push('- No failing DoD tasks.')
    } else {
      for (const task of epic.failing_dod_tasks) {
        lines.push(`- ${task.jira_key}: ${task.summary} (${task.non_compliance_reason || 'incomplete'})`)
      }
    }

    return lines.join('\n')
  }

  const openEpicDetail = (epic: NonCompliantEpic) => {
    const matchingHistory = (nudgeHistory?.nudges ?? []).filter((entry) => entry.epic_key === epic.jira_key)

    setDrawerDetail({
      id: epic.jira_key,
      title: epic.jira_key,
      status: epic.status_name || (epic.is_done ? 'Done' : 'Open'),
      statusTone: epic.is_done ? 'success' : 'warning',
      summary: epic.summary,
      metadata: [
        { label: 'Teams', value: epic.teams.join(', ') || '-' },
        { label: 'Reasons', value: epic.compliance_reasons.join(', ') || '-' },
        { label: 'Last nudge', value: formatDateTime(epic.nudge?.last_sent_at) },
      ],
      failedChecks: epic.failing_dod_tasks.map((task) => ({
        title: `${task.jira_key} (${task.category})`,
        subtitle: task.non_compliance_reason || task.summary,
        href: task.jira_url,
      })),
      history: matchingHistory.map((entry) => ({
        title: 'Nudge sent',
        description: `${entry.triggered_by} -> ${entry.recipient_emails.join(', ')}`,
        timestamp: formatDateTime(entry.sent_at),
      })),
      links: [{ label: 'Jira epic', href: epic.jira_url }],
    })
    setDrawerOpen(true)
  }

  const openNudgeDetail = (entry: NudgeHistoryEntry) => {
    setDrawerDetail({
      id: `${entry.epic_key}-${entry.sent_at}`,
      title: entry.epic_key,
      status: 'Nudge sent',
      statusTone: 'success',
      summary: entry.epic_summary,
      metadata: [
        { label: 'Teams', value: entry.epic_teams.join(', ') || '-' },
        { label: 'Triggered by', value: entry.triggered_by },
        { label: 'Recipients', value: entry.recipient_emails.join(', ') || '-' },
      ],
      history: [
        {
          title: 'Dispatched',
          description: `Payload sent to ${entry.recipient_emails.join(', ')}`,
          timestamp: formatDateTime(entry.sent_at),
        },
      ],
    })
    setDrawerOpen(true)
  }

  const openTeamDetail = (team: TeamConfig) => {
    const compliance = metrics?.by_team.find((entry) => entry.team === team.key)

    setDrawerDetail({
      id: team.key,
      title: team.display_name || team.key,
      status: team.is_active ? 'Active' : 'Inactive',
      statusTone: team.is_active ? 'success' : 'neutral',
      summary: `Team key ${team.key}`,
      metadata: [
        { label: 'Compliance', value: `${compliance?.compliance_percentage ?? 0}%` },
        { label: 'Recipients', value: team.notification_emails.join(', ') || '-' },
        { label: 'Scrum masters', value: (team.scrum_masters ?? []).join(', ') || '-' },
      ],
    })
    setDrawerOpen(true)
  }

  const openSquadDetail = (teamKey: string) => {
    const row = metrics?.by_team.find((item) => item.team === teamKey)
    if (!row) {
      return
    }

    setSquadFilter(teamKey)
    setDrawerDetail({
      id: teamKey,
      title: `Squad ${teamKey}`,
      status: `${row.compliance_percentage}% compliance`,
      statusTone: row.compliance_percentage >= 75 ? 'success' : row.compliance_percentage >= 50 ? 'warning' : 'error',
      summary: 'Chart selection applied as active squad filter.',
      metadata: [
        { label: 'Rank', value: String(row.rank) },
        { label: 'Total epics', value: String(row.total_epics) },
        { label: 'Compliant', value: String(row.compliant_epics) },
        { label: 'Non-compliant', value: String(row.non_compliant_epics) },
      ],
    })
    setDrawerOpen(true)
  }

  const sendNudge = async (
    epicKey: string,
    explicitRecipients: string[] = [],
    sprintSnapshotId?: number,
  ) => {
    if (!canNudge) {
      const text = 'Your role cannot send nudges.'
      setNudgeFeedback((prev) => ({ ...prev, [epicKey]: text }))
      pushToast('error', text)
      return false
    }

    setNudgeInFlight((prev) => ({ ...prev, [epicKey]: true }))
    setNudgeFeedback((prev) => ({ ...prev, [epicKey]: '' }))

    try {
      const params = new URLSearchParams()
      const resolvedSprintSnapshotId = sprintSnapshotId ?? metrics?.scope?.sprint_snapshot_id
      if (resolvedSprintSnapshotId) {
        params.set('sprint_snapshot_id', String(resolvedSprintSnapshotId))
      }
      const query = params.toString()
      const response = await apiFetch(
        `/api/epics/${encodeURIComponent(epicKey)}/nudge${query ? `?${query}` : ''}`,
        {
          method: 'POST',
          credentials: 'same-origin',
          headers: jsonHeaders(),
          body: JSON.stringify({ recipients: explicitRecipients }),
        },
      )

      const payload = (await response.json()) as { detail?: string }
      if (!response.ok) {
        throw new Error(payload.detail || `Nudge failed with status ${response.status}`)
      }

      setNudgeFeedback((prev) => ({
        ...prev,
        [epicKey]: payload.detail || 'Nudge sent.',
      }))
      pushToast('success', payload.detail || 'Nudge sent.')
      setRefreshCounter((prev) => prev + 1)
      return true
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Failed to send nudge.'
      setNudgeFeedback((prev) => ({
        ...prev,
        [epicKey]: text,
      }))
      pushToast('error', text)
      return false
    } finally {
      setNudgeInFlight((prev) => ({ ...prev, [epicKey]: false }))
    }
  }

  const requestNudge = (epicKey: string) => {
    if (!canNudge) {
      setNudgeFeedback((prev) => ({ ...prev, [epicKey]: 'Your role cannot send nudges.' }))
      return
    }

    const epic = nonCompliant?.epics.find((item) => item.jira_key === epicKey)
    if (!epic) {
      return
    }

    const defaults = defaultRecipientsForTeams(epic.teams)
    setNudgeModalEpicKey(epicKey)
    setNudgeModalRecipients(defaults.join(', '))
    setNudgeModalError('')
  }

  const confirmNudge = async () => {
    if (!selectedNudgeEpic) {
      return
    }

    const recipients = parseRecipients(nudgeModalRecipients)
    const ok = await sendNudge(selectedNudgeEpic.jira_key, recipients, selectedNudgeEpic.sprint_snapshot_id)
    if (ok) {
      setNudgeModalEpicKey(null)
      setNudgeModalRecipients('')
      setNudgeModalError('')
      return
    }

    setNudgeModalError('Failed to send nudge. Check the error in the epic row and retry.')
  }

  const saveTeamRecipients = async (teamKey: string) => {
    if (!canManageTeams) {
      setTeamFeedback((prev) => ({ ...prev, [teamKey]: 'Admin role required.' }))
      return
    }

    setTeamSaveState((prev) => ({ ...prev, [teamKey]: true }))
    setTeamFeedback((prev) => ({ ...prev, [teamKey]: '' }))

    const recipients = parseRecipients(teamDrafts[teamKey] || '')

    try {
      const response = await apiFetch(`/api/teams/${encodeURIComponent(teamKey)}/recipients`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: jsonHeaders(),
        body: JSON.stringify({ recipients }),
      })
      const payload = (await response.json()) as { detail?: string; team?: TeamConfig }
      if (!response.ok) {
        throw new Error(payload.detail || `Failed with status ${response.status}`)
      }

      setTeams((current) =>
        current.map((team) => (team.key === teamKey && payload.team ? payload.team : team)),
      )
      setTeamFeedback((prev) => ({ ...prev, [teamKey]: payload.detail || 'Saved.' }))
      pushToast('success', 'Team recipients saved.')
      setRefreshCounter((prev) => prev + 1)
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Failed to save recipients.'
      setTeamFeedback((prev) => ({ ...prev, [teamKey]: text }))
      pushToast('error', text)
    } finally {
      setTeamSaveState((prev) => ({ ...prev, [teamKey]: false }))
    }
  }

  const saveTeamScrumMasters = async (teamKey: string) => {
    if (!canManageTeams) {
      setTeamScrumFeedback((prev) => ({ ...prev, [teamKey]: 'Admin role required.' }))
      return
    }

    setTeamScrumSaveState((prev) => ({ ...prev, [teamKey]: true }))
    setTeamScrumFeedback((prev) => ({ ...prev, [teamKey]: '' }))

    const scrumMasters = parseRecipients(teamScrumDrafts[teamKey] || '')

    try {
      const response = await apiFetch(`/api/teams/${encodeURIComponent(teamKey)}/scrum-masters`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: jsonHeaders(),
        body: JSON.stringify({ scrum_masters: scrumMasters }),
      })
      const payload = (await response.json()) as { detail?: string; team?: TeamConfig }
      if (!response.ok) {
        throw new Error(payload.detail || `Failed with status ${response.status}`)
      }

      setTeams((current) =>
        current.map((team) =>
          team.key === teamKey && payload.team
            ? { ...payload.team, scrum_masters: payload.team.scrum_masters ?? [] }
            : team,
        ),
      )
      setTeamScrumFeedback((prev) => ({ ...prev, [teamKey]: payload.detail || 'Saved.' }))
      pushToast('success', 'Team scrum masters saved.')
      setRefreshCounter((prev) => prev + 1)
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Failed to save scrum masters.'
      setTeamScrumFeedback((prev) => ({ ...prev, [teamKey]: text }))
      pushToast('error', text)
    } finally {
      setTeamScrumSaveState((prev) => ({ ...prev, [teamKey]: false }))
    }
  }

  const runSync = async () => {
    if (!canRunSync) {
      setSyncFeedback('Admin role required.')
      pushToast('error', 'Admin role required.')
      return
    }

    setSyncRunning(true)
    setSyncFeedback('')

    try {
      const response = await apiFetch('/api/sync/run', {
        method: 'POST',
        credentials: 'same-origin',
        headers: jsonHeaders(),
        body: JSON.stringify({
          project_key: syncProjectKey.trim() || undefined,
        }),
      })

      const payload = (await response.json()) as {
        detail?: string
        run?: {
          status?: string
          sprint_snapshots?: number
          epic_snapshots?: number
          dod_task_snapshots?: number
        }
      }
      if (!response.ok) {
        throw new Error(payload.detail || `Sync failed with status ${response.status}`)
      }

      const run = payload.run
      if (run) {
        setSyncFeedback(
          `Sync ${run.status}: sprints=${run.sprint_snapshots}, epics=${run.epic_snapshots}, dod_tasks=${run.dod_task_snapshots}`,
        )
      } else {
        setSyncFeedback(payload.detail || 'Sync finished.')
      }
      pushToast('success', payload.detail || 'Sync completed.')
      setRefreshCounter((prev) => prev + 1)
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Failed to run sync.'
      setSyncFeedback(text)
      pushToast('error', text)
    } finally {
      setSyncRunning(false)
    }
  }

  const loginUser = async () => {
    setLoginSubmitting(true)
    setLoginError('')

    try {
      const response = await apiFetch('/api/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: jsonHeaders(),
        body: JSON.stringify({
          username: loginUsername,
          password: loginPassword,
        }),
      })

      const payload = (await response.json()) as AuthSessionResponse & { detail?: string }
      if (!response.ok) {
        throw new Error(payload.detail || `Login failed with status ${response.status}`)
      }

      setSession(payload)
      setLoginPassword('')
      setAuthRefreshCounter((prev) => prev + 1)
      setRefreshCounter((prev) => prev + 1)
      navigate('/', { replace: true })
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Login failed.'
      setLoginError(text)
    } finally {
      setLoginSubmitting(false)
    }
  }

  const logoutUser = async () => {
    try {
      await apiFetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: jsonHeaders(),
        body: JSON.stringify({}),
      })
    } catch {
      // Ignore logout failures and clear local session state.
    }

    setSession({ authenticated: false, role_auth_enabled: roleAuthEnabled, user: null })
    setAuthRefreshCounter((prev) => prev + 1)
    setRefreshCounter((prev) => prev + 1)
    navigate('/login', { replace: true })
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-[1500px] space-y-4 px-4 py-6 lg:px-6">
      {import.meta.env.MODE !== 'test' && <Toaster richColors position="top-right" closeButton />}
      {toastMessages.length > 0 && (
        <section className="fixed right-4 top-4 z-[60] grid w-[min(420px,calc(100vw-2rem))] gap-2">
          {toastMessages.map((item) => (
            <div
              key={item.id}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-md"
              data-testid={`toast-${item.kind}`}
            >
              {item.text}
            </div>
          ))}
        </section>
      )}

      <DashboardHeader
        title="DoD Compliance Dashboard"
        subtitle="Track active sprint Definition of Done adherence per squad."
        healthStatus={status}
        healthMessage={message}
        sessionLoading={sessionLoading}
        username={session?.user?.username}
        role={session?.user?.role}
        roleAuthEnabled={roleAuthEnabled}
        isAuthenticated={isAuthenticated}
        showSyncButton={!requiresLogin && showAdminPages}
        syncDisabled={!canRunSync || syncRunning}
        onRunSync={() => {
          void runSync()
        }}
        onRefresh={() => {
          setRefreshCounter((prev) => prev + 1)
          setAuthRefreshCounter((prev) => prev + 1)
        }}
        onSignOut={() => {
          void logoutUser()
        }}
      />

      {!requiresLogin && (
        <Tabs.Root
          value={tabValue}
          onValueChange={(value) => {
            if (value !== tabValue) {
              navigate(value)
            }
          }}
        >
          <Tabs.List className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200/60 bg-white p-2 shadow-sm sm:grid-cols-3 lg:grid-cols-5">
            <Tabs.Trigger
              value="/"
              className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 transition data-[state=active]:bg-teal-600 data-[state=active]:text-white"
              data-testid="nav-overview"
              onClick={() => {
                if (location.pathname !== '/') {
                  navigate('/')
                }
              }}
            >
              Overview
            </Tabs.Trigger>
            <Tabs.Trigger
              value="/epics"
              className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 transition data-[state=active]:bg-teal-600 data-[state=active]:text-white"
              data-testid="nav-epics"
              onClick={() => {
                if (location.pathname !== '/epics') {
                  navigate('/epics')
                }
              }}
            >
              Non-compliant Epics
            </Tabs.Trigger>
            <Tabs.Trigger
              value="/nudges"
              className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 transition data-[state=active]:bg-teal-600 data-[state=active]:text-white"
              data-testid="nav-nudges"
              onClick={() => {
                if (location.pathname !== '/nudges') {
                  navigate('/nudges')
                }
              }}
            >
              Nudge History
            </Tabs.Trigger>
            {showAdminPages && (
              <Tabs.Trigger
                value="/teams"
                className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 transition data-[state=active]:bg-teal-600 data-[state=active]:text-white"
                data-testid="nav-teams"
                onClick={() => {
                  if (location.pathname !== '/teams') {
                    navigate('/teams')
                  }
                }}
              >
                Teams
              </Tabs.Trigger>
            )}
            {showAdminPages && (
              <Tabs.Trigger
                value="/sync"
                className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 transition data-[state=active]:bg-teal-600 data-[state=active]:text-white"
                data-testid="nav-sync"
                onClick={() => {
                  if (location.pathname !== '/sync') {
                    navigate('/sync')
                  }
                }}
              >
                Sync
              </Tabs.Trigger>
            )}
          </Tabs.List>
        </Tabs.Root>
      )}

      {!requiresLogin && staleSyncMessage && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {staleSyncMessage}
        </section>
      )}

      {showFilterPanel && (
        <FilterBar
          availableSquads={availableSquads}
          selectedSquads={selectedSquads}
          rawSquadValue={squadFilter}
          categoryOptions={categoryOptions}
          categoryFilter={categoryFilter}
          epicStatusFilter={epicStatusFilter}
          onRawSquadChange={setSquadFilter}
          onSelectedSquadsChange={(value) => setSquadFilter(value.join(','))}
          onCategoryFilterChange={setCategoryFilter}
          onEpicStatusFilterChange={setEpicStatusFilter}
          onClearAll={() => {
            setSquadFilter('')
            setCategoryFilter('')
            setEpicStatusFilter('all')
          }}
        />
      )}

      <Routes>
        {requiresLogin ? (
          <>
            <Route
              path="/login"
              element={
                <LoginPage
                  username={loginUsername}
                  password={loginPassword}
                  loginError={loginError}
                  loginSubmitting={loginSubmitting}
                  onUsernameChange={setLoginUsername}
                  onPasswordChange={setLoginPassword}
                  onSubmit={() => {
                    void loginUser()
                  }}
                />
              }
            />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </>
        ) : (
          <>
            <Route
              path="/"
              element={
                <OverviewPage
                  loading={dashboardLoading}
                  error={dashboardError}
                  metrics={metrics}
                  nonCompliant={nonCompliant}
                  nudgeHistory={nudgeHistory}
                  onRunSync={() => {
                    void runSync()
                  }}
                  onLearnSnapshot={() => {
                    toast.info('A sprint snapshot captures Jira sprint, epic, and DoD task status at sync time.')
                  }}
                  onSelectSquad={openSquadDetail}
                />
              }
            />
            <Route
              path="/epics"
              element={
                <NonCompliantEpicsPage
                  loading={dashboardLoading}
                  error={dashboardError}
                  metrics={metrics}
                  nonCompliant={nonCompliant}
                  nudgeFeedback={nudgeFeedback}
                  nudgeInFlight={nudgeInFlight}
                  canNudge={canNudge}
                  onRequestNudge={requestNudge}
                  onViewDetails={openEpicDetail}
                />
              }
            />
            <Route
              path="/nudges"
              element={
                <NudgeHistoryPage
                  loading={dashboardLoading}
                  error={dashboardError}
                  metrics={metrics}
                  nudgeHistory={nudgeHistory}
                  onViewDetails={openNudgeDetail}
                />
              }
            />
            <Route
              path="/teams"
              element={
                showAdminPages ? (
                  <TeamsPage
                    teams={teams}
                    metrics={metrics}
                    teamDrafts={teamDrafts}
                    teamScrumDrafts={teamScrumDrafts}
                    teamSaveState={teamSaveState}
                    teamScrumSaveState={teamScrumSaveState}
                    teamFeedback={teamFeedback}
                    teamScrumFeedback={teamScrumFeedback}
                    canManageTeams={canManageTeams}
                    onDraftChange={(teamKey, value) => {
                      setTeamDrafts((prev) => ({ ...prev, [teamKey]: value }))
                    }}
                    onScrumDraftChange={(teamKey, value) => {
                      setTeamScrumDrafts((prev) => ({ ...prev, [teamKey]: value }))
                    }}
                    onSave={(teamKey) => {
                      void saveTeamRecipients(teamKey)
                    }}
                    onSaveScrumMasters={(teamKey) => {
                      void saveTeamScrumMasters(teamKey)
                    }}
                    onViewTeam={openTeamDetail}
                  />
                ) : (
                  <Navigate to="/" replace />
                )
              }
            />
            <Route
              path="/sync"
              element={
                showAdminPages ? (
                  <SyncPage
                    syncProjectKey={syncProjectKey}
                    syncRunning={syncRunning}
                    syncFeedback={syncFeedback}
                    syncStatus={syncStatus}
                    canRunSync={canRunSync}
                    onProjectChange={setSyncProjectKey}
                    onRunSync={() => {
                      void runSync()
                    }}
                  />
                ) : (
                  <Navigate to="/" replace />
                )
              }
            />
            <Route path="/login" element={<Navigate to="/" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        )}
      </Routes>

      <DetailsDrawer open={drawerOpen} onOpenChange={setDrawerOpen} detail={drawerDetail} />

      <Dialog.Root
        open={!requiresLogin && selectedNudgeEpic !== null}
        onOpenChange={(open) => {
          if (!open) {
            setNudgeModalEpicKey(null)
            setNudgeModalError('')
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-900/45" />
          <Dialog.Content
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
            data-testid="nudge-modal"
          >
            <Dialog.Title className="text-lg font-semibold text-slate-900">Confirm Nudge</Dialog.Title>
            {selectedNudgeEpic && (
              <>
                <Dialog.Description className="mt-1 text-sm text-slate-600">
                  Review recipients and message preview before sending the nudge for{' '}
                  <strong>{selectedNudgeEpic.jira_key}</strong>.
                </Dialog.Description>
                <label className="mt-4 block text-sm font-medium text-slate-700">
                  Recipients (comma separated, optional)
                  <input
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    data-testid="nudge-modal-recipients"
                    value={nudgeModalRecipients}
                    onChange={(event) => setNudgeModalRecipients(event.target.value)}
                    placeholder="team@example.com, scrum.master@example.com"
                  />
                </label>
                <pre
                  className="mt-3 max-h-56 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700"
                  data-testid="nudge-modal-preview"
                >
                  {buildNudgePreview(selectedNudgeEpic, parseRecipients(nudgeModalRecipients))}
                </pre>
                {nudgeModalError && (
                  <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    {nudgeModalError}
                  </p>
                )}
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                    data-testid="nudge-modal-cancel"
                    onClick={() => {
                      setNudgeModalEpicKey(null)
                      setNudgeModalError('')
                    }}
                    disabled={Boolean(nudgeInFlight[selectedNudgeEpic.jira_key])}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="rounded-xl border border-teal-600 bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
                    data-testid="nudge-modal-confirm"
                    onClick={() => {
                      void confirmNudge()
                    }}
                    disabled={Boolean(nudgeInFlight[selectedNudgeEpic.jira_key])}
                  >
                    {nudgeInFlight[selectedNudgeEpic.jira_key] ? 'Sending...' : 'Send nudge'}
                  </button>
                </div>
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </main>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  )
}

export default App
