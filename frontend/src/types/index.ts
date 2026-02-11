export type HealthStatus = 'loading' | 'healthy' | 'unhealthy'
export type EpicStatus = 'all' | 'open' | 'done'
export type ComplianceStatusFilter = 'all' | 'non_compliant' | 'compliant'
export type UserRole = 'admin' | 'scrum_master' | 'viewer' | 'none'

export type MetricsResponse = {
  scope: {
    scope_mode?: 'single' | 'aggregate'
    sprint_snapshot_count?: number
    sprint_snapshot_ids?: number[]
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

export type EpicOverviewItem = {
  sprint_snapshot_id?: number
  jira_sprint_id?: string
  sprint_name?: string
  jira_key: string
  summary: string
  status_name: string
  resolution_name: string
  is_done: boolean
  is_compliant: boolean
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
}

export type EpicsResponse = {
  scope: {
    scope_mode?: 'single' | 'aggregate'
    sprint_snapshot_count?: number
    sprint_snapshot_ids?: number[]
    sprint_snapshot_id: number
    jira_sprint_id: string
    sprint_name: string
    sprint_state: string
    sync_timestamp: string
  } | null
  count: number
  epics: EpicOverviewItem[]
}

export type NonCompliantEpic = EpicOverviewItem
export type NonCompliantResponse = EpicsResponse

export type NudgeHistoryEntry = {
  sprint_snapshot_id?: number
  sprint_name?: string
  epic_key: string
  epic_summary: string
  team: string | null
  epic_teams: string[]
  triggered_by: string
  recipient_emails: string[]
  sent_at: string
}

export type NudgeHistoryResponse = {
  scope: {
    scope_mode?: 'single' | 'aggregate'
    sprint_snapshot_count?: number
    sprint_snapshot_ids?: number[]
    sprint_snapshot_id: number
    jira_sprint_id: string
    sprint_name: string
    sprint_state: string
    sync_timestamp: string
  } | null
  count: number
  total_count: number
  nudges: NudgeHistoryEntry[]
}

export type TeamConfig = {
  key: string
  display_name: string
  notification_emails: string[]
  scrum_masters?: string[]
  is_active: boolean
}

export type TeamsResponse = {
  count: number
  teams: TeamConfig[]
}

export type SyncStatusResponse = {
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

export type AuthSessionResponse = {
  authenticated: boolean
  role_auth_enabled: boolean
  user: {
    username: string
    email: string
    role: UserRole
    managed_squads: string[]
  } | null
}

export type DashboardPageProps = {
  loading: boolean
  error: string | null
  metrics: MetricsResponse | null
}

export type KpiItem = {
  label: string
  value: string
  delta: number
  sparkline: number[]
}

export type TrendPoint = {
  date: string
  compliance: number
  nonCompliant: number
}

export type SquadBreakdown = {
  squad: string
  compliance: number
  nonCompliant: number
}

export type CategoryBreakdown = {
  category: string
  compliant: number
  nonCompliant: number
}

export type ViolationBreakdown = {
  category: string
  count: number
  percent: number
}

export type DrawerLink = {
  label: string
  href: string
}

export type DrawerChecklistItem = {
  title: string
  subtitle?: string
  href?: string
}

export type DrawerHistoryItem = {
  title: string
  description: string
  timestamp?: string
}

export type DrawerDetail = {
  id: string
  title: string
  status: string
  statusTone?: 'success' | 'warning' | 'error' | 'neutral'
  summary?: string
  metadata?: Array<{ label: string; value: string }>
  failedChecks?: DrawerChecklistItem[]
  history?: DrawerHistoryItem[]
  links?: DrawerLink[]
}
