import { expect, test } from '@playwright/test'

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

const epicsPayload = {
  scope: {
    sprint_snapshot_id: 1,
    jira_sprint_id: '100',
    sprint_name: 'Sprint 10',
    sprint_state: 'active',
    sync_timestamp: '2026-02-10T12:00:00Z',
  },
  count: 2,
  epics: [
    {
      jira_key: 'ABC-201',
      summary: 'Compliant epic',
      status_name: 'In Progress',
      resolution_name: '',
      is_done: false,
      is_compliant: true,
      jira_url: 'https://example.atlassian.net/browse/ABC-201',
      teams: ['squad_platform'],
      missing_squad_labels: false,
      squad_label_warnings: [],
      compliance_reasons: [],
      nudge: {
        cooldown_active: false,
        seconds_remaining: 0,
        last_sent_at: null,
      },
      failing_dod_tasks: [],
    },
    {
      jira_key: 'ABC-202',
      summary: 'Non compliant epic',
      status_name: 'In Progress',
      resolution_name: '',
      is_done: false,
      is_compliant: false,
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

test('renders compliance dashboard and supports filters', async ({ page }) => {
  await page.route('**/api/health', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'ok', service: 'backend' }),
    })
  })

  await page.route('**/api/auth/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        authenticated: false,
        role_auth_enabled: false,
        user: null,
      }),
    })
  })

  await page.route('**/api/metrics**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(metricsPayload),
    })
  })

  await page.route('**/api/epics**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(epicsPayload),
    })
  })

  await page.route('**/api/nudges/history**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(nudgeHistoryPayload),
    })
  })

  await page.route('**/api/teams', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(teamsPayload),
    })
  })

  await page.route('**/api/sync/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(syncStatusPayload),
    })
  })

  await page.route('**/api/sync/run', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        detail: 'Sync finished.',
        run: {
          status: 'SUCCESS',
          sprint_snapshots: 1,
          epic_snapshots: 2,
          dod_task_snapshots: 3,
        },
      }),
    })
  })

  await page.route('**/api/teams/*/recipients', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        detail: 'Team recipients updated.',
        team: {
          key: 'squad_platform',
          display_name: 'Platform',
          notification_emails: ['alpha@example.com'],
          scrum_masters: ['scrum_platform'],
          is_active: true,
        },
      }),
    })
  })

  await page.route('**/api/teams/*/scrum-masters', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        detail: 'Team scrum masters updated.',
        team: {
          key: 'squad_platform',
          display_name: 'Platform',
          notification_emails: ['alpha@example.com'],
          scrum_masters: ['scrum_platform', 'scrum_backup'],
          is_active: true,
        },
      }),
    })
  })

  await page.route('**/api/epics/*/nudge**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'Nudge email sent.' }),
    })
  })

  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'DoD Compliance Dashboard' })).toBeVisible()
  await expect(page.getByTestId('health-badge')).toHaveText('Backend healthy')
  await expect(
    page.getByText('Sync data is stale (60 minutes old). Threshold is 30 minutes.'),
  ).toBeVisible()
  await expect(page.getByTestId('kpi-total-epics')).toHaveText('3')
  await expect(page.getByTestId('kpi-missing-squad-labels')).toHaveText('1')
  await expect(page.getByTestId('kpi-invalid-squad-labels')).toHaveText('1')
  await expect(page.getByTestId('team-rank-squad_platform')).toHaveText('#1')

  await page.getByTestId('filter-squad').fill('squad_platform')
  await page.getByTestId('filter-epic-status').selectOption('done')

  await page.getByTestId('nav-epics').click()
  await expect(page.getByTestId('non-compliant-count')).toHaveText('Showing 2 epic(s) for current filters.')
  await expect(page.getByTestId('nudge-button-ABC-202')).toBeVisible()
  await expect(page.getByText('Missing squad_ label')).toBeVisible()
  await expect(page.getByText('Invalid squad labels: squad')).toBeVisible()
  await expect(page.getByRole('link', { name: 'ABC-212' })).toHaveAttribute(
    'href',
    'https://example.atlassian.net/browse/ABC-212',
  )
  await page.getByTestId('nudge-button-ABC-202').click()
  await expect(page.getByTestId('nudge-modal')).toBeVisible()
  await expect(page.getByTestId('nudge-modal-preview')).toContainText('ABC-212')
  await page.getByTestId('nudge-modal-recipients').fill('team@example.com')
  await page.getByTestId('nudge-modal-confirm').click()

  await expect(page.getByTestId('toast-success').first()).toContainText('Nudge email sent.')

  await page.getByTestId('nav-sync').click()
  await page.getByTestId('sync-project-key').fill('ABC')
  await page.getByTestId('sync-run-button').click()
  await expect(page.getByText('Sync SUCCESS: sprints=1, epics=2, dod_tasks=3')).toBeVisible()

  await page.getByTestId('nav-teams').click()
  await page.getByTestId('team-recipients-squad_platform').fill('alpha@example.com')
  await page.getByTestId('save-team-squad_platform').click()
  await expect(page.getByText('Team recipients updated.')).toBeVisible()

  await page.getByTestId('team-scrum-masters-squad_platform').fill('scrum_platform, scrum_backup')
  await page.getByTestId('save-team-scrum-squad_platform').click()
  await expect(page.getByText('Team scrum masters updated.')).toBeVisible()

  await page.getByTestId('nav-nudges').click()
  await expect(page.getByText('scrummaster@example.com')).toBeVisible()
})

test('shows dashboard error when backend metrics endpoint fails', async ({ page }) => {
  await page.route('**/api/health', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'ok', service: 'backend' }),
    })
  })

  await page.route('**/api/auth/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        authenticated: false,
        role_auth_enabled: false,
        user: null,
      }),
    })
  })

  await page.route('**/api/teams', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(teamsPayload),
    })
  })

  await page.route('**/api/sync/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(syncStatusPayload),
    })
  })

  await page.route('**/api/metrics**', async (route) => {
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'error' }),
    })
  })

  await page.route('**/api/epics**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(epicsPayload),
    })
  })

  await page.route('**/api/nudges/history**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(nudgeHistoryPayload),
    })
  })

  await page.goto('/')

  await expect(page.getByText('Unable to load dashboard data.')).toBeVisible()
})

test('enforces login when role auth is enabled and shows admin navigation after sign-in', async ({
  page,
}) => {
  let authenticated = false

  const authPayload = () => ({
    authenticated,
    role_auth_enabled: true,
    user: authenticated
      ? {
          username: 'admin_user',
          email: 'admin@example.com',
          role: 'admin',
          managed_squads: [],
        }
      : null,
  })

  await page.route('**/api/health', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'ok', service: 'backend' }),
    })
  })

  await page.route('**/api/auth/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(authPayload()),
    })
  })

  await page.route('**/api/auth/login', async (route) => {
    authenticated = true
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(authPayload()),
    })
  })

  await page.route('**/api/metrics**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(metricsPayload),
    })
  })

  await page.route('**/api/epics**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(epicsPayload),
    })
  })

  await page.route('**/api/nudges/history**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(nudgeHistoryPayload),
    })
  })

  await page.route('**/api/teams', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(teamsPayload),
    })
  })

  await page.route('**/api/sync/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(syncStatusPayload),
    })
  })

  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible()
  await page.getByTestId('login-username').fill('admin_user')
  await page.getByTestId('login-password').fill('password123')
  await page.getByTestId('login-submit').click()

  await expect(page.getByTestId('session-role-badge')).toHaveText('admin_user (admin)')
  await expect(page.getByTestId('nav-overview')).toBeVisible()
  await expect(page.getByTestId('nav-teams')).toBeVisible()
  await expect(page.getByTestId('nav-sync')).toBeVisible()
})

test('shows scrum master scoped view and hides admin-only pages when role auth is enabled', async ({
  page,
}) => {
  const scrumMetricsPayload = {
    ...metricsPayload,
    summary: {
      ...metricsPayload.summary,
      total_epics: 1,
      compliant_epics: 0,
      non_compliant_epics: 1,
      compliance_percentage: 0,
      epics_with_missing_squad_labels: 1,
      epics_with_invalid_squad_labels: 1,
    },
    by_team: [metricsPayload.by_team[0]],
  }

  const scrumHistoryPayload = {
    ...nudgeHistoryPayload,
    nudges: [],
    count: 0,
    total_count: 0,
  }

  await page.route('**/api/health', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'ok', service: 'backend' }),
    })
  })

  await page.route('**/api/auth/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        authenticated: true,
        role_auth_enabled: true,
        user: {
          username: 'scrum_user',
          email: 'scrum@example.com',
          role: 'scrum_master',
          managed_squads: ['squad_platform'],
        },
      }),
    })
  })

  await page.route('**/api/metrics**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(scrumMetricsPayload),
    })
  })

  await page.route('**/api/epics**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(epicsPayload),
    })
  })

  await page.route('**/api/nudges/history**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(scrumHistoryPayload),
    })
  })

  await page.route('**/api/teams', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(teamsPayload),
    })
  })

  await page.route('**/api/sync/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(syncStatusPayload),
    })
  })

  await page.goto('/')

  await expect(page.getByTestId('session-role-badge')).toHaveText('scrum_user (scrum_master)')
  await expect(page.getByTestId('nav-overview')).toBeVisible()
  await expect(page.getByTestId('nav-epics')).toBeVisible()
  await expect(page.getByTestId('nav-nudges')).toBeVisible()
  await expect(page.getByTestId('nav-teams')).toHaveCount(0)
  await expect(page.getByTestId('nav-sync')).toHaveCount(0)
  await expect(page.getByTestId('team-rank-squad_platform')).toHaveText('#1')
})
