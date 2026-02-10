import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App'

const metricsPayload = {
  scope: {
    sprint_snapshot_id: 1,
    jira_sprint_id: '100',
    sprint_name: 'Sprint 10',
    sprint_state: 'active',
    sync_timestamp: '2026-02-10T12:00:00Z',
  },
  summary: {
    total_epics: 3,
    compliant_epics: 1,
    non_compliant_epics: 2,
    compliance_percentage: 33.33,
    epics_with_missing_squad_labels: 1,
    epics_with_invalid_squad_labels: 1,
  },
  by_team: [
    {
      rank: 1,
      team: 'squad_platform',
      total_epics: 2,
      compliant_epics: 1,
      non_compliant_epics: 1,
      compliance_percentage: 50,
    },
    {
      rank: 2,
      team: 'squad_mobile',
      total_epics: 1,
      compliant_epics: 0,
      non_compliant_epics: 1,
      compliance_percentage: 0,
    },
  ],
  by_category: [
    {
      category: 'automated_tests',
      total_tasks: 2,
      compliant_tasks: 1,
      non_compliant_tasks: 1,
      compliance_percentage: 50,
    },
  ],
}

const nonCompliantPayload = {
  scope: {
    sprint_snapshot_id: 1,
    jira_sprint_id: '100',
    sprint_name: 'Sprint 10',
    sprint_state: 'active',
    sync_timestamp: '2026-02-10T12:00:00Z',
  },
  count: 1,
  epics: [
    {
      jira_key: 'ABC-202',
      summary: 'Non compliant epic',
      status_name: 'In Progress',
      resolution_name: '',
      is_done: false,
      jira_url: 'https://example.atlassian.net/browse/ABC-202',
      teams: ['squad_platform'],
      missing_squad_labels: true,
      squad_label_warnings: ['squad'],
      compliance_reasons: ['incomplete_dod_tasks'],
      nudge: {
        cooldown_active: false,
        seconds_remaining: 0,
        last_sent_at: null,
      },
      failing_dod_tasks: [
        {
          jira_key: 'ABC-212',
          summary: 'DoD - Automated tests',
          category: 'automated_tests',
          is_done: true,
          jira_url: 'https://example.atlassian.net/browse/ABC-212',
          has_evidence_link: false,
          evidence_link: '',
          non_compliance_reason: 'missing_evidence_link',
        },
      ],
    },
  ],
}

const nudgeHistoryPayload = {
  scope: {
    sprint_snapshot_id: 1,
    jira_sprint_id: '100',
    sprint_name: 'Sprint 10',
    sprint_state: 'active',
    sync_timestamp: '2026-02-10T12:00:00Z',
  },
  count: 1,
  total_count: 1,
  nudges: [
    {
      epic_key: 'ABC-202',
      epic_summary: 'Non compliant epic',
      team: 'squad_platform',
      epic_teams: ['squad_platform'],
      triggered_by: 'scrummaster@example.com',
      recipient_emails: ['team@example.com'],
      sent_at: '2026-02-10T12:30:00Z',
    },
  ],
}

const teamsPayload = {
  count: 1,
  teams: [
    {
      key: 'squad_platform',
      display_name: 'Platform',
      notification_emails: ['team@example.com'],
      scrum_masters: ['scrum_platform'],
      is_active: true,
    },
  ],
}

const syncStatusPayload = {
  server_time: '2026-02-10T12:45:00Z',
  latest_run: {
    id: 5,
    started_at: '2026-02-10T12:40:00Z',
    finished_at: '2026-02-10T12:41:00Z',
    status: 'SUCCESS',
    trigger: 'manual',
    triggered_by: 'scrummaster@example.com',
    project_key: 'ABC',
    sprint_snapshots: 1,
    epic_snapshots: 2,
    dod_task_snapshots: 3,
    error_message: '',
  },
  latest_snapshot: {
    id: 1,
    jira_sprint_id: '100',
    sprint_name: 'Sprint 10',
    sprint_state: 'active',
    sync_timestamp: '2026-02-10T12:41:00Z',
  },
  freshness: {
    status: 'stale',
    is_stale: true,
    stale_threshold_minutes: 30,
    age_seconds: 3600,
    age_minutes: 60,
    last_snapshot_at: '2026-02-10T12:41:00Z',
    message: 'Latest snapshot is stale (>30 minutes old).',
  },
}

const authSessionPayload = {
  authenticated: false,
  role_auth_enabled: false,
  user: null,
}

function mockFetch(
  custom?: (url: string, init?: RequestInit) => Response | Promise<Response> | undefined,
) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = String(input)

    if (custom) {
      const maybe = custom(url, init)
      if (maybe) {
        return Promise.resolve(maybe)
      }
    }

    if (url.startsWith('/api/health')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ status: 'ok' }),
      } as Response)
    }

    if (url.startsWith('/api/auth/session')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => authSessionPayload,
      } as Response)
    }

    if (url.startsWith('/api/metrics')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => metricsPayload,
      } as Response)
    }

    if (url.startsWith('/api/epics/non-compliant')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => nonCompliantPayload,
      } as Response)
    }

    if (url.startsWith('/api/nudges/history')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => nudgeHistoryPayload,
      } as Response)
    }

    if (url.startsWith('/api/teams')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => teamsPayload,
      } as Response)
    }

    if (url.startsWith('/api/sync/status')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => syncStatusPayload,
      } as Response)
    }

    return Promise.reject(new Error(`Unhandled URL ${url}`))
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

beforeEach(() => {
  window.history.pushState({}, '', '/')
})

describe('App', () => {
  it('loads health and dashboard data', async () => {
    const fetchMock = mockFetch()

    render(<App />)

    expect(await screen.findByText('Backend healthy')).toBeInTheDocument()
    expect(await screen.findByText('Sprint 10')).toBeInTheDocument()
    expect(screen.getByTestId('kpi-total-epics')).toHaveTextContent('3')
    expect(screen.getByTestId('kpi-missing-squad-labels')).toHaveTextContent('1')
    expect(screen.getByTestId('kpi-invalid-squad-labels')).toHaveTextContent('1')

    fireEvent.click(screen.getByTestId('nav-epics'))
    expect(await screen.findByTestId('non-compliant-count')).toHaveTextContent(
      '1 epic(s) require action.',
    )
    expect(screen.getAllByText('ABC-202').length).toBeGreaterThan(0)
    expect(screen.getByText('Missing squad_ label')).toBeInTheDocument()
    expect(screen.getByText('Invalid squad labels: squad')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'ABC-212' })).toHaveAttribute(
      'href',
      'https://example.atlassian.net/browse/ABC-212',
    )
    expect(screen.getByText('Evidence link missing')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('nav-nudges'))
    expect(await screen.findByText('scrummaster@example.com')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalled()
  })

  it('reloads dashboard data when filters change', async () => {
    const metricsCalls: string[] = []

    mockFetch((url) => {
      if (url.startsWith('/api/metrics')) {
        metricsCalls.push(url)
      }
      return undefined
    })

    render(<App />)

    await screen.findByText('Sprint 10')

    fireEvent.change(screen.getByTestId('filter-squad'), {
      target: { value: 'squad_platform' },
    })

    await waitFor(() => {
      expect(metricsCalls.some((url) => url.includes('squad=squad_platform'))).toBe(true)
    })

    fireEvent.change(screen.getByTestId('filter-epic-status'), {
      target: { value: 'done' },
    })

    await waitFor(() => {
      expect(metricsCalls.some((url) => url.includes('epic_status=done'))).toBe(true)
    })

    fireEvent.change(screen.getByTestId('filter-category'), {
      target: { value: 'automated_tests' },
    })

    await waitFor(() => {
      expect(metricsCalls.some((url) => url.includes('category=automated_tests'))).toBe(true)
    })
  })

  it('shows error when dashboard request fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input)
      if (url.startsWith('/api/health')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ status: 'ok' }),
        } as Response)
      }

      if (url.startsWith('/api/auth/session')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => authSessionPayload,
        } as Response)
      }

      if (url.startsWith('/api/teams')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => teamsPayload,
        } as Response)
      }

      return Promise.resolve({
        ok: false,
        status: 500,
        json: async () => ({ detail: 'failed' }),
      } as Response)
    })

    render(<App />)

    expect(await screen.findByText('Unable to load dashboard data.')).toBeInTheDocument()
  })

  it('shows empty-scope message when no snapshots are available', async () => {
    mockFetch((url) => {
      if (url.startsWith('/api/metrics')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            scope: null,
            summary: {
              total_epics: 0,
              compliant_epics: 0,
              non_compliant_epics: 0,
              compliance_percentage: 0,
            },
            by_team: [],
            by_category: [],
          }),
        } as Response
      }

      if (url.startsWith('/api/epics/non-compliant')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ scope: null, count: 0, epics: [] }),
        } as Response
      }

      if (url.startsWith('/api/nudges/history')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ scope: null, count: 0, total_count: 0, nudges: [] }),
        } as Response
      }

      return undefined
    })

    render(<App />)

    expect(
      await screen.findByText('No sprint snapshot data available yet. Run Jira sync first.'),
    ).toBeInTheDocument()
  })

  it('sends nudge for non-compliant epic from confirmation modal', async () => {
    const fetchMock = mockFetch((url, init) => {
      if (url.startsWith('/api/epics/ABC-202/nudge')) {
        expect(init?.method).toBe('POST')
        return {
          ok: true,
          status: 200,
          json: async () => ({ detail: 'Nudge email sent.' }),
        } as Response
      }

      return undefined
    })

    render(<App />)

    await screen.findByText('Sprint 10')
    fireEvent.click(screen.getByTestId('nav-epics'))
    fireEvent.click(screen.getByTestId('nudge-button-ABC-202'))
    expect(await screen.findByTestId('nudge-modal')).toBeInTheDocument()
    expect(screen.getByTestId('nudge-modal-preview')).toHaveTextContent('ABC-212')
    fireEvent.change(screen.getByTestId('nudge-modal-recipients'), {
      target: { value: 'team@example.com' },
    })
    fireEvent.click(screen.getByTestId('nudge-modal-confirm'))

    expect(await screen.findByTestId('toast-success')).toHaveTextContent('Nudge email sent.')
    expect(
      fetchMock.mock.calls.some((call) => String(call[0]).startsWith('/api/epics/ABC-202/nudge')),
    ).toBe(true)
  })

  it('renders stale sync warning banner when freshness is stale', async () => {
    mockFetch()

    render(<App />)

    expect(
      await screen.findByText(
        'Sync data is stale (60 minutes old). Threshold is 30 minutes.',
      ),
    ).toBeInTheDocument()
  })

  it('shows ranked team leaderboard rows', async () => {
    mockFetch()

    render(<App />)
    await screen.findByText('Sprint 10')

    expect(screen.getByTestId('team-rank-squad_platform')).toHaveTextContent('1')
    expect(screen.getByTestId('team-rank-squad_mobile')).toHaveTextContent('2')
  })

  it('updates team notification recipients', async () => {
    const fetchMock = mockFetch((url, init) => {
      if (url.startsWith('/api/teams/squad_platform/recipients')) {
        expect(init?.method).toBe('POST')
        return {
          ok: true,
          status: 200,
          json: async () => ({
            detail: 'Team recipients updated.',
            team: {
              key: 'squad_platform',
              display_name: 'Platform',
              notification_emails: ['alpha@example.com', 'beta@example.com'],
              scrum_masters: ['scrum_platform'],
              is_active: true,
            },
          }),
        } as Response
      }

      return undefined
    })

    render(<App />)

    await screen.findByText('Sprint 10')
    fireEvent.click(screen.getByTestId('nav-teams'))

    fireEvent.change(screen.getByTestId('team-recipients-squad_platform'), {
      target: { value: 'alpha@example.com, beta@example.com' },
    })
    fireEvent.click(screen.getByTestId('save-team-squad_platform'))

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some((call) =>
          String(call[0]).startsWith('/api/teams/squad_platform/recipients'),
        ),
      ).toBe(true)
    })
  })

  it('runs jira sync from control panel', async () => {
    const fetchMock = mockFetch((url, init) => {
      if (url.startsWith('/api/sync/run')) {
        expect(init?.method).toBe('POST')
        return {
          ok: true,
          status: 200,
          json: async () => ({
            detail: 'Sync finished.',
            run: {
              status: 'SUCCESS',
              sprint_snapshots: 1,
              epic_snapshots: 2,
              dod_task_snapshots: 3,
            },
          }),
        } as Response
      }

      return undefined
    })

    render(<App />)

    await screen.findByText('Sprint 10')
    fireEvent.click(screen.getByTestId('nav-sync'))
    fireEvent.change(screen.getByTestId('sync-project-key'), {
      target: { value: 'ABC' },
    })
    fireEvent.click(screen.getByTestId('sync-run-button'))

    expect(await screen.findByText('Sync SUCCESS: sprints=1, epics=2, dod_tasks=3')).toBeInTheDocument()

    await waitFor(() => {
      const syncCall = fetchMock.mock.calls.find((call) => String(call[0]).startsWith('/api/sync/run'))
      expect(syncCall).toBeTruthy()
      const init = syncCall?.[1]
      const payload = init?.body ? JSON.parse(String(init.body)) : null
      expect(payload).toEqual({ project_key: 'ABC' })
    })
  })

  it('updates team scrum master assignments', async () => {
    const fetchMock = mockFetch((url, init) => {
      if (url.startsWith('/api/teams/squad_platform/scrum-masters')) {
        expect(init?.method).toBe('POST')
        return {
          ok: true,
          status: 200,
          json: async () => ({
            detail: 'Team scrum masters updated.',
            team: {
              key: 'squad_platform',
              display_name: 'Platform',
              notification_emails: ['team@example.com'],
              scrum_masters: ['scrum_platform', 'scrum_backup'],
              is_active: true,
            },
          }),
        } as Response
      }

      return undefined
    })

    render(<App />)

    await screen.findByText('Sprint 10')
    fireEvent.click(screen.getByTestId('nav-teams'))
    fireEvent.change(screen.getByTestId('team-scrum-masters-squad_platform'), {
      target: { value: 'scrum_platform, scrum_backup' },
    })
    fireEvent.click(screen.getByTestId('save-team-scrum-squad_platform'))

    expect(await screen.findByText('Team scrum masters updated.')).toBeInTheDocument()
    await waitFor(() => {
      const call = fetchMock.mock.calls.find((item) =>
        String(item[0]).startsWith('/api/teams/squad_platform/scrum-masters'),
      )
      expect(call).toBeTruthy()
      const payload = call?.[1]?.body ? JSON.parse(String(call?.[1]?.body)) : null
      expect(payload).toEqual({ scrum_masters: ['scrum_platform', 'scrum_backup'] })
    })
  })

  it('shows login flow and loads dashboard after successful auth when role auth is enabled', async () => {
    let authenticated = false

    mockFetch((url, init) => {
      if (url.startsWith('/api/auth/session')) {
        return {
          ok: true,
          status: 200,
          json: async () =>
            authenticated
              ? {
                  authenticated: true,
                  role_auth_enabled: true,
                  user: {
                    username: 'admin_user',
                    email: 'admin@example.com',
                    role: 'admin',
                    managed_squads: [],
                  },
                }
              : {
                  authenticated: false,
                  role_auth_enabled: true,
                  user: null,
                },
        } as Response
      }

      if (url.startsWith('/api/auth/login')) {
        expect(init?.method).toBe('POST')
        authenticated = true
        return {
          ok: true,
          status: 200,
          json: async () => ({
            authenticated: true,
            role_auth_enabled: true,
            user: {
              username: 'admin_user',
              email: 'admin@example.com',
              role: 'admin',
              managed_squads: [],
            },
          }),
        } as Response
      }

      return undefined
    })

    render(<App />)

    expect(await screen.findByText('Sign In')).toBeInTheDocument()
    fireEvent.change(screen.getByTestId('login-username'), { target: { value: 'admin_user' } })
    fireEvent.change(screen.getByTestId('login-password'), { target: { value: 'password123' } })
    fireEvent.click(screen.getByTestId('login-submit'))

    expect(await screen.findByText('Sprint 10')).toBeInTheDocument()
    expect(screen.getByTestId('session-role-badge')).toHaveTextContent('admin_user (admin)')
    expect(screen.getByTestId('nav-sync')).toBeInTheDocument()
  })
})
