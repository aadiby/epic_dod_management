import { useEffect, useMemo, useState } from 'react'
import { BrowserRouter, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import './App.css'

type HealthStatus = 'loading' | 'healthy' | 'unhealthy'
type EpicStatus = 'all' | 'open' | 'done'
type UserRole = 'admin' | 'scrum_master' | 'viewer' | 'none'

type MetricsResponse = {
  scope: {
    sprint_snapshot_id: number
    jira_sprint_id: string
    sprint_name: string
    sprint_state: string
    sync_timestamp: string
  } | null
  summary: {
    total_epics: number
    compliant_epics: number
    non_compliant_epics: number
    compliance_percentage: number
    epics_with_missing_squad_labels?: number
    epics_with_invalid_squad_labels?: number
  }
  by_team: Array<{
    rank: number
    team: string
    total_epics: number
    compliant_epics: number
    non_compliant_epics: number
    compliance_percentage: number
  }>
  by_category: Array<{
    category: string
    total_tasks: number
    compliant_tasks: number
    non_compliant_tasks: number
    compliance_percentage: number
  }>
}

type NonCompliantResponse = {
  scope: {
    sprint_snapshot_id: number
    jira_sprint_id: string
    sprint_name: string
    sprint_state: string
    sync_timestamp: string
  } | null
  count: number
  epics: Array<{
    jira_key: string
    summary: string
    status_name: string
    resolution_name: string
    is_done: boolean
    jira_url: string
    teams: string[]
    compliance_reasons: string[]
    missing_squad_labels?: boolean
    squad_label_warnings?: string[]
    nudge?: {
      cooldown_active: boolean
      seconds_remaining: number
      last_sent_at: string | null
    }
    failing_dod_tasks: Array<{
      jira_key: string
      summary: string
      category: string
      is_done: boolean
      jira_url?: string
      has_evidence_link: boolean
      evidence_link: string
      non_compliance_reason: string
    }>
  }>
}

type NudgeHistoryResponse = {
  scope: {
    sprint_snapshot_id: number
    jira_sprint_id: string
    sprint_name: string
    sprint_state: string
    sync_timestamp: string
  } | null
  count: number
  total_count: number
  nudges: Array<{
    epic_key: string
    epic_summary: string
    team: string | null
    epic_teams: string[]
    triggered_by: string
    recipient_emails: string[]
    sent_at: string
  }>
}

type TeamConfig = {
  key: string
  display_name: string
  notification_emails: string[]
  scrum_masters?: string[]
  is_active: boolean
}

type TeamsResponse = {
  count: number
  teams: TeamConfig[]
}

type SyncStatusResponse = {
  server_time: string
  latest_run: {
    id: number
    started_at: string
    finished_at: string | null
    status: 'RUNNING' | 'SUCCESS' | 'FAILED'
    trigger: string
    triggered_by: string
    project_key: string
    sprint_snapshots: number
    epic_snapshots: number
    dod_task_snapshots: number
    error_message: string
  } | null
  latest_snapshot: {
    id: number
    jira_sprint_id: string
    sprint_name: string
    sprint_state: string
    sync_timestamp: string
  } | null
  freshness: {
    status: 'fresh' | 'stale' | 'missing'
    is_stale: boolean
    stale_threshold_minutes: number
    age_seconds: number | null
    age_minutes: number | null
    last_snapshot_at: string | null
    message: string
  }
}

type AuthSessionResponse = {
  authenticated: boolean
  role_auth_enabled: boolean
  user: {
    username: string
    email: string
    role: UserRole
    managed_squads: string[]
  } | null
}

type DashboardPageProps = {
  loading: boolean
  error: string | null
  metrics: MetricsResponse | null
}

type ToastKind = 'success' | 'error'

type ToastMessage = {
  id: number
  kind: ToastKind
  text: string
}

function getCookieValue(name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : ''
}

function getDashboardGate(props: DashboardPageProps) {
  const { loading, error, metrics } = props

  if (loading) {
    return <p className="info-message">Loading dashboard data...</p>
  }

  if (error) {
    return <p className="error-message">{error}</p>
  }

  if (!metrics?.scope) {
    return <p className="info-message">No sprint snapshot data available yet. Run Jira sync first.</p>
  }

  return null
}

function OverviewPage({ loading, error, metrics }: DashboardPageProps) {
  const gate = getDashboardGate({ loading, error, metrics })
  if (gate) {
    return gate
  }

  return (
    <>
      <section className="scope-panel">
        <h2>{metrics?.scope?.sprint_name}</h2>
        <p>
          Sprint ID: {metrics?.scope?.jira_sprint_id} | State: {metrics?.scope?.sprint_state}
        </p>
      </section>

      <section className="kpi-grid">
        <article className="kpi-card">
          <h3>Total Epics</h3>
          <p data-testid="kpi-total-epics">{metrics?.summary.total_epics ?? 0}</p>
        </article>
        <article className="kpi-card">
          <h3>Compliant</h3>
          <p data-testid="kpi-compliant-epics">{metrics?.summary.compliant_epics ?? 0}</p>
        </article>
        <article className="kpi-card">
          <h3>Non-compliant</h3>
          <p data-testid="kpi-non-compliant-epics">{metrics?.summary.non_compliant_epics ?? 0}</p>
        </article>
        <article className="kpi-card">
          <h3>Compliance %</h3>
          <p data-testid="kpi-compliance-rate">{metrics?.summary.compliance_percentage ?? 0}%</p>
        </article>
        <article className="kpi-card">
          <h3>Missing squad labels</h3>
          <p data-testid="kpi-missing-squad-labels">
            {metrics?.summary.epics_with_missing_squad_labels ?? 0}
          </p>
        </article>
        <article className="kpi-card">
          <h3>Invalid squad labels</h3>
          <p data-testid="kpi-invalid-squad-labels">
            {metrics?.summary.epics_with_invalid_squad_labels ?? 0}
          </p>
        </article>
      </section>

      <section className="table-panel">
        <h2>Team Compliance</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Team</th>
                <th>Total epics</th>
                <th>Compliant</th>
                <th>Non-compliant</th>
                <th>Rate %</th>
              </tr>
            </thead>
            <tbody>
              {(metrics?.by_team.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={6}>No team data.</td>
                </tr>
              )}
              {metrics?.by_team.map((team) => (
                <tr key={team.team} data-testid={`team-row-${team.team}`}>
                  <td data-testid={`team-rank-${team.team}`}>{team.rank}</td>
                  <td>{team.team}</td>
                  <td>{team.total_epics}</td>
                  <td>{team.compliant_epics}</td>
                  <td>{team.non_compliant_epics}</td>
                  <td>{team.compliance_percentage}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="table-panel">
        <h2>DoD Category Compliance</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th>Total tasks</th>
                <th>Compliant</th>
                <th>Non-compliant</th>
                <th>Rate %</th>
              </tr>
            </thead>
            <tbody>
              {(metrics?.by_category.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={5}>No category data.</td>
                </tr>
              )}
              {metrics?.by_category.map((category) => (
                <tr key={category.category}>
                  <td>{category.category}</td>
                  <td>{category.total_tasks}</td>
                  <td>{category.compliant_tasks}</td>
                  <td>{category.non_compliant_tasks}</td>
                  <td>{category.compliance_percentage}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}

type EpicsPageProps = DashboardPageProps & {
  nonCompliant: NonCompliantResponse | null
  nudgeFeedback: Record<string, string>
  nudgeInFlight: Record<string, boolean>
  onRequestNudge: (epicKey: string) => void
  canNudge: boolean
}

function EpicsPage({
  loading,
  error,
  metrics,
  nonCompliant,
  nudgeFeedback,
  nudgeInFlight,
  onRequestNudge,
  canNudge,
}: EpicsPageProps) {
  const gate = getDashboardGate({ loading, error, metrics })
  if (gate) {
    return gate
  }

  return (
    <section className="table-panel">
      <h2>Non-compliant Epics</h2>
      {!canNudge && <p className="nudge-note">Your role has read-only access. Nudge action is disabled.</p>}
      <p data-testid="non-compliant-count">{nonCompliant?.count ?? 0} epic(s) require action.</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Epic</th>
              <th>Teams</th>
              <th>Reasons</th>
              <th>Failing DoD Tasks</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {(nonCompliant?.epics.length ?? 0) === 0 && (
              <tr>
                <td colSpan={5}>No non-compliant epics.</td>
              </tr>
            )}
            {nonCompliant?.epics.map((epic) => (
              <tr key={epic.jira_key}>
                <td>
                  <a href={epic.jira_url} target="_blank" rel="noreferrer">
                    {epic.jira_key}
                  </a>
                  <div>{epic.summary}</div>
                </td>
                <td>{epic.teams.join(', ') || '-'}</td>
                <td>
                  <div>{epic.compliance_reasons.join(', ')}</div>
                  {epic.missing_squad_labels && <div className="nudge-note">Missing squad_ label</div>}
                  {(epic.squad_label_warnings?.length ?? 0) > 0 && (
                    <div className="nudge-note">
                      Invalid squad labels: {(epic.squad_label_warnings ?? []).join(', ')}
                    </div>
                  )}
                </td>
                <td>
                  <ul className="task-list">
                    {epic.failing_dod_tasks.length === 0 && <li>No failing DoD tasks.</li>}
                    {epic.failing_dod_tasks.map((task) => (
                      <li key={task.jira_key}>
                        <strong>
                          {task.jira_url ? (
                            <a href={task.jira_url} target="_blank" rel="noreferrer">
                              {task.jira_key}
                            </a>
                          ) : (
                            task.jira_key
                          )}
                        </strong>
                        : {task.summary}
                        <div className="nudge-note">
                          {task.has_evidence_link && task.evidence_link ? (
                            <a href={task.evidence_link} target="_blank" rel="noreferrer">
                              Evidence link
                            </a>
                          ) : (
                            'Evidence link missing'
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </td>
                <td>
                  <button
                    type="button"
                    className="nudge-button"
                    data-testid={`nudge-button-${epic.jira_key}`}
                    disabled={
                      !canNudge ||
                      Boolean(nudgeInFlight[epic.jira_key]) ||
                      Boolean(epic.nudge?.cooldown_active)
                    }
                    onClick={() => onRequestNudge(epic.jira_key)}
                  >
                    {nudgeInFlight[epic.jira_key] ? 'Sending...' : 'Review & nudge'}
                  </button>
                  {epic.nudge?.cooldown_active && (
                    <div className="nudge-note">
                      Cooldown: {Math.ceil(epic.nudge.seconds_remaining / 60)} min remaining
                    </div>
                  )}
                  {nudgeFeedback[epic.jira_key] && (
                    <div className="nudge-note">{nudgeFeedback[epic.jira_key]}</div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

type NudgeHistoryPageProps = DashboardPageProps & {
  nudgeHistory: NudgeHistoryResponse | null
}

function NudgeHistoryPage({ loading, error, metrics, nudgeHistory }: NudgeHistoryPageProps) {
  const gate = getDashboardGate({ loading, error, metrics })
  if (gate) {
    return gate
  }

  return (
    <section className="table-panel">
      <h2>Nudge History</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Sent at</th>
              <th>Epic</th>
              <th>Teams</th>
              <th>Triggered by</th>
              <th>Recipients</th>
            </tr>
          </thead>
          <tbody>
            {(nudgeHistory?.nudges.length ?? 0) === 0 && (
              <tr>
                <td colSpan={5}>No nudge history for this filter.</td>
              </tr>
            )}
            {nudgeHistory?.nudges.map((entry) => (
              <tr key={`${entry.epic_key}-${entry.sent_at}`}>
                <td>{new Date(entry.sent_at).toLocaleString()}</td>
                <td>{entry.epic_key}</td>
                <td>{entry.epic_teams.join(', ') || '-'}</td>
                <td>{entry.triggered_by}</td>
                <td>{entry.recipient_emails.join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

type TeamsPageProps = {
  teams: TeamConfig[]
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
}

function TeamsPage({
  teams,
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
}: TeamsPageProps) {
  return (
    <section className="table-panel">
      <h2>Team Notification Recipients</h2>
      {!canManageTeams && (
        <p className="nudge-note">Admin role is required to update recipients. View-only mode is active.</p>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Team</th>
              <th>Recipients (comma separated)</th>
              <th>Scrum masters (usernames)</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {teams.length === 0 && (
              <tr>
                <td colSpan={4}>No teams found.</td>
              </tr>
            )}
            {teams.map((team) => (
              <tr key={team.key}>
                <td>{team.display_name || team.key}</td>
                <td>
                  <input
                    className="recipient-input"
                    data-testid={`team-recipients-${team.key}`}
                    value={teamDrafts[team.key] ?? ''}
                    onChange={(event) => onDraftChange(team.key, event.target.value)}
                    disabled={!canManageTeams}
                  />
                  {teamFeedback[team.key] && <div className="nudge-note">{teamFeedback[team.key]}</div>}
                </td>
                <td>
                  <input
                    className="recipient-input"
                    data-testid={`team-scrum-masters-${team.key}`}
                    value={teamScrumDrafts[team.key] ?? ''}
                    onChange={(event) => onScrumDraftChange(team.key, event.target.value)}
                    disabled={!canManageTeams}
                  />
                  {teamScrumFeedback[team.key] && (
                    <div className="nudge-note">{teamScrumFeedback[team.key]}</div>
                  )}
                </td>
                <td>
                  <button
                    type="button"
                    className="nudge-button"
                    data-testid={`save-team-${team.key}`}
                    disabled={!canManageTeams || Boolean(teamSaveState[team.key])}
                    onClick={() => onSave(team.key)}
                  >
                    {teamSaveState[team.key] ? 'Saving...' : 'Save Recipients'}
                  </button>
                  <button
                    type="button"
                    className="nudge-button"
                    data-testid={`save-team-scrum-${team.key}`}
                    disabled={!canManageTeams || Boolean(teamScrumSaveState[team.key])}
                    onClick={() => onSaveScrumMasters(team.key)}
                  >
                    {teamScrumSaveState[team.key] ? 'Saving...' : 'Save Scrum Masters'}
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

type SyncPageProps = {
  syncProjectKey: string
  syncRunning: boolean
  syncFeedback: string
  syncStatus: SyncStatusResponse | null
  onProjectChange: (value: string) => void
  onRunSync: () => void
  canRunSync: boolean
}

function SyncPage({
  syncProjectKey,
  syncRunning,
  syncFeedback,
  syncStatus,
  onProjectChange,
  onRunSync,
  canRunSync,
}: SyncPageProps) {
  return (
    <section className="table-panel">
      <h2>Jira Sync Control</h2>
      <p className="panel-intro">Run manual snapshot sync and monitor the latest run status.</p>
      {!canRunSync && <p className="nudge-note">Admin role is required to run manual sync.</p>}
      <div className="sync-controls">
        <input
          className="recipient-input"
          placeholder="Project key (optional)"
          value={syncProjectKey}
          onChange={(event) => onProjectChange(event.target.value)}
          data-testid="sync-project-key"
          disabled={!canRunSync}
        />
        <button
          type="button"
          className="nudge-button"
          data-testid="sync-run-button"
          disabled={!canRunSync || syncRunning}
          onClick={onRunSync}
        >
          {syncRunning ? 'Running sync...' : 'Run Sync'}
        </button>
      </div>
      {syncFeedback && <p className="nudge-note">{syncFeedback}</p>}
      <div className="nudge-note">
        Latest run:{' '}
        {syncStatus?.latest_run
          ? `${syncStatus.latest_run.status} at ${new Date(syncStatus.latest_run.started_at).toLocaleString()}`
          : 'No sync run yet.'}
      </div>
      {syncStatus?.latest_snapshot && (
        <div className="nudge-note">
          Latest snapshot: {syncStatus.latest_snapshot.sprint_name} ({syncStatus.latest_snapshot.sprint_state})
        </div>
      )}
    </section>
  )
}

type LoginPageProps = {
  username: string
  password: string
  loginError: string
  loginSubmitting: boolean
  onUsernameChange: (value: string) => void
  onPasswordChange: (value: string) => void
  onSubmit: () => void
}

function LoginPage({
  username,
  password,
  loginError,
  loginSubmitting,
  onUsernameChange,
  onPasswordChange,
  onSubmit,
}: LoginPageProps) {
  return (
    <section className="table-panel auth-panel">
      <h2>Sign In</h2>
      <p className="panel-intro">Authenticate to access the dashboard.</p>
      <div className="auth-form">
        <label>
          Username
          <input
            data-testid="login-username"
            value={username}
            onChange={(event) => onUsernameChange(event.target.value)}
            autoComplete="username"
          />
        </label>
        <label>
          Password
          <input
            data-testid="login-password"
            type="password"
            value={password}
            onChange={(event) => onPasswordChange(event.target.value)}
            autoComplete="current-password"
          />
        </label>
        <button
          type="button"
          className="refresh-button"
          data-testid="login-submit"
          disabled={loginSubmitting}
          onClick={onSubmit}
        >
          {loginSubmitting ? 'Signing in...' : 'Sign in'}
        </button>
      </div>
      {loginError && (
        <p className="error-message" data-testid="login-error">
          {loginError}
        </p>
      )}
    </section>
  )
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
  const [nudgeModalEpicKey, setNudgeModalEpicKey] = useState<string | null>(null)
  const [nudgeModalRecipients, setNudgeModalRecipients] = useState('')
  const [nudgeModalError, setNudgeModalError] = useState('')
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const [, setToastCounter] = useState(0)

  const roleAuthEnabled = Boolean(session?.role_auth_enabled)
  const isAuthenticated = Boolean(session?.authenticated)
  const currentRole = session?.user?.role ?? 'none'
  const requiresLogin = !sessionLoading && roleAuthEnabled && !isAuthenticated

  const canNudge = !roleAuthEnabled || currentRole === 'admin' || currentRole === 'scrum_master'
  const showAdminPages = !roleAuthEnabled || currentRole === 'admin'
  const canManageTeams = showAdminPages
  const canRunSync = showAdminPages

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
        const response = await fetch('/api/health', {
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
        const response = await fetch('/api/auth/session', {
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

        // Backward-compatible fallback for environments without auth endpoint wiring.
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
          fetch(`/api/metrics${queryString}`, {
            signal: controller.signal,
            credentials: 'same-origin',
          }),
          fetch(`/api/epics/non-compliant${queryString}`, {
            signal: controller.signal,
            credentials: 'same-origin',
          }),
          fetch(`/api/nudges/history${historyQueryString}`, {
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
        const response = await fetch('/api/sync/status', {
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
        const response = await fetch('/api/teams', {
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

  const badgeClass = useMemo(() => {
    if (status === 'healthy') {
      return 'status-badge status-badge--ok'
    }

    if (status === 'unhealthy') {
      return 'status-badge status-badge--error'
    }

    return 'status-badge status-badge--loading'
  }, [status])

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

  const parseRecipients = (raw: string): string[] =>
    raw
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0)

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

  const buildNudgePreview = (epic: NonCompliantResponse['epics'][number], recipients: string[]) => {
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

  const pushToast = (kind: ToastKind, text: string) => {
    setToastCounter((previousCounter) => {
      const nextId = previousCounter + 1
      setToasts((current) => [...current, { id: nextId, kind, text }])
      window.setTimeout(() => {
        setToasts((current) => current.filter((item) => item.id !== nextId))
      }, 4500)
      return nextId
    })
  }

  const sendNudge = async (epicKey: string, explicitRecipients: string[] = []) => {
    if (!canNudge) {
      setNudgeFeedback((prev) => ({ ...prev, [epicKey]: 'Your role cannot send nudges.' }))
      pushToast('error', 'Your role cannot send nudges.')
      return false
    }

    setNudgeInFlight((prev) => ({ ...prev, [epicKey]: true }))
    setNudgeFeedback((prev) => ({ ...prev, [epicKey]: '' }))

    try {
      const params = new URLSearchParams()
      if (metrics?.scope?.sprint_snapshot_id) {
        params.set('sprint_snapshot_id', String(metrics.scope.sprint_snapshot_id))
      }
      const query = params.toString()
      const response = await fetch(
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
    const ok = await sendNudge(selectedNudgeEpic.jira_key, recipients)
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

    const recipients = (teamDrafts[teamKey] || '')
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0)

    try {
      const response = await fetch(`/api/teams/${encodeURIComponent(teamKey)}/recipients`, {
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
      setRefreshCounter((prev) => prev + 1)
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Failed to save recipients.'
      setTeamFeedback((prev) => ({ ...prev, [teamKey]: text }))
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

    const scrumMasters = (teamScrumDrafts[teamKey] || '')
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0)

    try {
      const response = await fetch(`/api/teams/${encodeURIComponent(teamKey)}/scrum-masters`, {
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
      setRefreshCounter((prev) => prev + 1)
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Failed to save scrum masters.'
      setTeamScrumFeedback((prev) => ({ ...prev, [teamKey]: text }))
    } finally {
      setTeamScrumSaveState((prev) => ({ ...prev, [teamKey]: false }))
    }
  }

  const runSync = async () => {
    if (!canRunSync) {
      setSyncFeedback('Admin role required.')
      return
    }

    setSyncRunning(true)
    setSyncFeedback('')

    try {
      const response = await fetch('/api/sync/run', {
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
      setRefreshCounter((prev) => prev + 1)
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Failed to run sync.'
      setSyncFeedback(text)
    } finally {
      setSyncRunning(false)
    }
  }

  const loginUser = async () => {
    setLoginSubmitting(true)
    setLoginError('')

    try {
      const response = await fetch('/api/auth/login', {
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
      await fetch('/api/auth/logout', {
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
    <main className="app-shell">
      {toasts.length > 0 && (
        <section className="toast-stack" data-testid="toast-stack" aria-live="polite" aria-atomic="true">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`toast toast--${toast.kind}`}
              data-testid={`toast-${toast.kind}`}
              role="status"
            >
              {toast.text}
            </div>
          ))}
        </section>
      )}
      <header className="app-header">
        <div>
          <h1>DoD Compliance Dashboard</h1>
          <p>Track active sprint Definition of Done adherence per squad.</p>
        </div>
        <div className="header-actions">
          <span className={badgeClass} data-testid="health-badge">
            {message}
          </span>
          {sessionLoading && <span className="status-badge status-badge--loading">Session loading...</span>}
          {!sessionLoading && roleAuthEnabled && session?.user && (
            <span className="status-badge status-badge--loading" data-testid="session-role-badge">
              {session.user.username} ({session.user.role})
            </span>
          )}
          <button
            type="button"
            className="refresh-button"
            onClick={() => {
              setRefreshCounter((prev) => prev + 1)
              setAuthRefreshCounter((prev) => prev + 1)
            }}
            data-testid="refresh-dashboard"
          >
            Refresh data
          </button>
          {!sessionLoading && roleAuthEnabled && isAuthenticated && (
            <button
              type="button"
              className="refresh-button"
              onClick={() => {
                void logoutUser()
              }}
              data-testid="logout-button"
            >
              Sign out
            </button>
          )}
        </div>
      </header>

      {!requiresLogin && (
        <nav className="top-nav" aria-label="Primary">
          <NavLink to="/" end className="nav-link" data-testid="nav-overview">
            Overview
          </NavLink>
          <NavLink to="/epics" className="nav-link" data-testid="nav-epics">
            Non-compliant Epics
          </NavLink>
          <NavLink to="/nudges" className="nav-link" data-testid="nav-nudges">
            Nudge History
          </NavLink>
          {showAdminPages && (
            <NavLink to="/teams" className="nav-link" data-testid="nav-teams">
              Teams
            </NavLink>
          )}
          {showAdminPages && (
            <NavLink to="/sync" className="nav-link" data-testid="nav-sync">
              Sync
            </NavLink>
          )}
        </nav>
      )}

      {!requiresLogin && staleSyncMessage && (
        <section
          className="error-message freshness-banner"
          data-testid="sync-freshness-banner"
          role="status"
        >
          {staleSyncMessage}
        </section>
      )}

      {showFilterPanel && (
        <section className="filter-panel">
          <h2>Filters</h2>
          <div className="filter-grid">
            <label>
              Squads
              <input
                value={squadFilter}
                onChange={(event) => setSquadFilter(event.target.value)}
                placeholder="squad_platform,squad_mobile"
                data-testid="filter-squad"
              />
            </label>
            <label>
              DoD Category
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
                data-testid="filter-category"
              >
                <option value="">All categories</option>
                {categoryOptions.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Epic status
              <select
                value={epicStatusFilter}
                onChange={(event) => setEpicStatusFilter(event.target.value as EpicStatus)}
                data-testid="filter-epic-status"
              >
                <option value="all">All</option>
                <option value="open">Open</option>
                <option value="done">Done</option>
              </select>
            </label>
          </div>
        </section>
      )}

      {!requiresLogin && selectedNudgeEpic && (
        <div className="modal-backdrop" data-testid="nudge-modal">
          <section className="modal-card" role="dialog" aria-modal="true" aria-label="Nudge confirmation">
            <h2>Confirm Nudge</h2>
            <p className="panel-intro">
              Review recipients and message preview before sending the nudge for{' '}
              <strong>{selectedNudgeEpic.jira_key}</strong>.
            </p>
            <label>
              Recipients (comma separated, optional)
              <input
                className="recipient-input"
                data-testid="nudge-modal-recipients"
                value={nudgeModalRecipients}
                onChange={(event) => setNudgeModalRecipients(event.target.value)}
                placeholder="team@example.com, scrum.master@example.com"
              />
            </label>
            <pre className="modal-preview" data-testid="nudge-modal-preview">
              {buildNudgePreview(selectedNudgeEpic, parseRecipients(nudgeModalRecipients))}
            </pre>
            {nudgeModalError && <p className="error-message">{nudgeModalError}</p>}
            <div className="modal-actions">
              <button
                type="button"
                className="refresh-button"
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
                className="nudge-button"
                data-testid="nudge-modal-confirm"
                onClick={() => {
                  void confirmNudge()
                }}
                disabled={Boolean(nudgeInFlight[selectedNudgeEpic.jira_key])}
              >
                {nudgeInFlight[selectedNudgeEpic.jira_key] ? 'Sending...' : 'Send nudge'}
              </button>
            </div>
          </section>
        </div>
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
              element={<OverviewPage loading={dashboardLoading} error={dashboardError} metrics={metrics} />}
            />
            <Route
              path="/epics"
              element={
                <EpicsPage
                  loading={dashboardLoading}
                  error={dashboardError}
                  metrics={metrics}
                  nonCompliant={nonCompliant}
                  nudgeFeedback={nudgeFeedback}
                  nudgeInFlight={nudgeInFlight}
                  canNudge={canNudge}
                  onRequestNudge={(epicKey) => {
                    requestNudge(epicKey)
                  }}
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
                />
              }
            />
            <Route
              path="/teams"
              element={
                showAdminPages ? (
                  <TeamsPage
                    teams={teams}
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
