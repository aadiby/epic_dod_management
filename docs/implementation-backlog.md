# DoD Compliance Webapp Implementation Backlog

## Planning assumptions
- Sprint length: 2 weeks
- Team capacity baseline: 35-45 story points per sprint
- Environments: dev, staging, prod
- Jira access from app runtime network is available; local developer machines may not have Jira network access

## Global non-functional acceptance criteria
- All backend endpoints are covered by auth + permission checks.
- All business-critical rules have unit and integration tests.
- Frontend has component tests for all core dashboard flows.
- End-to-end tests cover login, filtering, compliance drill-down, and nudge flow.
- CI blocks merge on failing lint/type/tests.

## Sprint 1 - Foundation and Skeleton
### Story S1-1: Monorepo scaffold and docker-compose baseline (8 SP)
Acceptance criteria:
- Backend Django project starts with health endpoint `/api/health`.
- Frontend React app starts and can call backend health API.
- `docker-compose` starts `frontend`, `backend`, `db`, `redis` successfully.
- `.env.example` documents required variables.
Test cases:
- Backend unit: health endpoint returns 200 and JSON payload.
- Integration: compose smoke test validates all services become healthy.
- Frontend unit: health status component renders healthy state from mocked API.
- E2E smoke (Playwright): load home page and verify health badge appears.

### Story S1-2: CI pipeline baseline (5 SP)
Acceptance criteria:
- CI runs backend lint + tests, frontend lint + tests, and Playwright smoke.
- Merge is blocked on failed checks.
Test cases:
- Pipeline test: intentional failing unit test fails pipeline.
- Pipeline test: successful branch passes all checks.

### Story S1-3: Base data model (7 SP)
Acceptance criteria:
- Django models created for `SprintSnapshot`, `EpicSnapshot`, `DoDTaskSnapshot`, `Team`, `NudgeLog`.
- Initial migration applied in compose environment.
- Admin pages enabled for model inspection.
Test cases:
- Backend unit: model constraints and indexes validated.
- Integration: migration up/down runs cleanly in CI DB.

## Sprint 2 - Jira Integration and Sync
### Story S2-1: Jira client adapter with token auth (8 SP)
Acceptance criteria:
- Jira adapter reads credentials from env and initializes official `jira` client.
- Adapter has methods for active sprint issues, epic lookup, child issue lookup, remote links.
- Adapter errors are normalized into application exceptions.
Test cases:
- Unit: adapter initialization fails with clear error on missing config.
- Unit: mocked Jira responses map to internal DTOs.
- Contract test: saved fixtures validate parser against real Jira payload shapes.

### Story S2-2: Scheduled sync job (8 SP)
Acceptance criteria:
- Celery beat triggers Jira sync every 15 minutes.
- Sync writes immutable snapshot records with timestamp.
- Sync is idempotent for same Jira issue update version.
Test cases:
- Unit: idempotency logic skips unchanged issues.
- Integration: celery task writes snapshots into DB.
- Integration: repeated task run does not duplicate unchanged snapshot rows.

### Story S2-3: Team extraction from `squad_` labels (5 SP)
Acceptance criteria:
- Team labels are parsed from issues and attached to epic snapshot.
- Epic with multiple squad labels is supported.
- Unknown/missing squad labels are flagged.
Test cases:
- Unit: label parser handles case, spacing, multiple labels.
- Integration: parsed teams appear in API response.

## Sprint 3 - Compliance Engine and Metrics API
### Story S3-1: DoD rule engine (10 SP)
Acceptance criteria:
- DoD task detection uses summary prefix `DoD - `.
- Task compliance requires done resolution/status + at least one evidence link.
- Epic compliance requires all DoD tasks compliant and at least one DoD task exists.
- Response includes non-compliance reasons per task.
Test cases:
- Unit: rule matrix for done/not-done, link/no-link combinations.
- Unit: category extraction from DoD summary.
- Integration: epic compliance computed from snapshot fixtures.

### Story S3-2: Dashboard metrics endpoints (8 SP)
Acceptance criteria:
- Endpoint returns global compliance percentage.
- Endpoint returns compliance by team and by DoD category.
- Filters: sprint, squad(s), category, epic status.
Test cases:
- API tests: filter combinations return expected sets.
- API tests: percentage calculations are correct for edge cases (0 epics, no DoD tasks).

### Story S3-3: Non-compliance detail endpoint (5 SP)
Acceptance criteria:
- Endpoint returns epics with failing DoD tasks and reason list.
- Includes direct Jira URLs for epic and tasks.
Test cases:
- API tests: failing reasons serialized correctly.
- Security tests: unauthorized user cannot access out-of-scope squads.

## Sprint 4 - Dashboard UI and Drill-down
### Story S4-1: Filters and KPI cards (8 SP)
Acceptance criteria:
- User can filter by sprint, squads, DoD category.
- KPI cards show compliant/non-compliant counts and compliance percentage.
- Loading and error states are handled.
Test cases:
- Frontend unit: filter state reducer logic.
- Component tests: KPI cards update with filter changes via mocked API.
- E2E: user applies filters and sees updated metrics.

### Story S4-2: Epic compliance table and detail panel (8 SP)
Acceptance criteria:
- Table lists epics with status, team tags, compliance status.
- Detail panel shows failing DoD tasks and missing evidence links.
- Links open Jira issue pages.
Test cases:
- Component tests: row rendering for compliant and non-compliant epics.
- E2E: open detail panel and verify reason text + links.

### Story S4-3: Team leaderboard view (5 SP)
Acceptance criteria:
- Teams ranked by compliance percentage.
- Supports same filters as main dashboard.
Test cases:
- Frontend unit: sorting and tie-break rules.
- E2E: leaderboard order changes when filters change.

## Sprint 5 - Nudge Workflow and Emailing
### Story S5-1: Nudge email backend service (8 SP)
Acceptance criteria:
- Backend can send email for a non-compliant epic to configured squad recipients.
- Email includes epic key, failing DoD tasks, missing links, Jira URLs.
- Nudge actions are recorded in `NudgeLog` with actor and timestamp.
Test cases:
- Unit: email template rendering with sample payload.
- Integration: SMTP mock verifies send request.
- API tests: nudge action writes log entry.

### Story S5-2: Nudge UI flow (5 SP)
Acceptance criteria:
- User can trigger nudge from epic detail panel.
- Confirmation modal previews recipients + email body summary.
- Success/failure toast shown.
Test cases:
- Component tests: modal validation and submit state.
- E2E: trigger nudge on a non-compliant epic and verify success state.

### Story S5-3: Anti-spam controls (5 SP)
Acceptance criteria:
- Cooldown policy (e.g. max one nudge per epic per 24h).
- UI indicates recent nudge and disabled action when cooldown active.
Test cases:
- Unit: cooldown policy evaluation.
- API tests: second nudge attempt within cooldown blocked.
- E2E: disabled nudge button after initial send.

## Sprint 6 - LDAP, Authorization, and HTTPS
### Story S6-1: LDAP authentication integration (8 SP)
Acceptance criteria:
- Users authenticate through LDAP.
- Session login/logout works in web UI.
- LDAP failures are logged without exposing sensitive details.
Test cases:
- Integration: mock LDAP bind success/failure paths.
- E2E: login flow with seeded LDAP test user.

### Story S6-2: Role and squad authorization (8 SP)
Acceptance criteria:
- Roles: Admin, Scrum Master, Viewer.
- Scrum Masters can only view and nudge assigned squads.
- Admin can view all squads and configuration pages.
Test cases:
- API tests: role matrix for each endpoint.
- E2E: user from Squad A cannot see Squad B data.

### Story S6-3: TLS and secure deployment settings (5 SP)
Acceptance criteria:
- HTTPS enabled at reverse proxy.
- Secure cookie flags, HSTS, and proxy SSL headers configured.
- Security checklist verified for Django prod settings.
Test cases:
- Integration: HTTPS endpoint responds with valid cert in staging.
- Security test: HTTP redirects to HTTPS.

## Sprint 7 - Hardening, Observability, and Release
### Story S7-1: Observability and audit dashboards (8 SP)
Acceptance criteria:
- Structured logs for sync runs, auth events, nudge events.
- Basic operational dashboard for sync success/failure and freshness.
- Alert when sync stale > 30 minutes.
Test cases:
- Integration: simulated sync failure emits alert event.
- Integration: log fields include correlation ID and user ID where relevant.

### Story S7-2: Full regression and performance baseline (8 SP)
Acceptance criteria:
- Full test suite stable in CI.
- Dashboard API p95 response < 500ms with agreed sample dataset.
- Sync job completes under agreed SLA.
Test cases:
- Performance test: API load test with representative dataset.
- E2E regression: full critical user journey suite passes.

### Story S7-3: Production release readiness (5 SP)
Acceptance criteria:
- Runbook completed for deploy, rollback, secrets rotation.
- Compose deployment docs validated by a dry run.
- Pilot sign-off checklist completed.
Test cases:
- Ops dry run: staging deployment from scratch succeeds.
- Disaster recovery drill: rollback procedure tested.

## Sprint 8 - Configuration and User Documentation
### Story S8-1: LDAP and HTTPS configuration documentation (5 SP)
Acceptance criteria:
- Deployment documentation defines LDAP setup, group mapping, and role behavior (`dod_admin`, `dod_scrum_master`, `dod_viewer`).
- Deployment documentation defines HTTPS reverse proxy setup for private-network usage.
- HTTPS documentation explicitly allows self-signed or internal CA certificates (public CA signing not required in private network).
- Documentation includes post-configuration verification checklist for authentication and TLS.
Test cases:
- Ops validation: follow the LDAP doc in a staging-like environment and verify login + role assignment.
- Ops validation: follow the HTTPS doc and verify HTTP->HTTPS redirect and secure cookie behavior.

### Story S8-2: End-user frontend usage guide (5 SP)
Acceptance criteria:
- User guide documents page navigation and expected data on each page.
- User guide documents common workflows: filtering, reviewing non-compliant epics, sending nudges, checking nudge history.
- User guide documents role-specific capabilities (viewer, scrum master, admin).
- User guide includes troubleshooting section for common user-facing errors.
Test cases:
- UAT walkthrough: scrum master completes core workflow using only the guide.
- UAT walkthrough: admin completes team recipient and manual sync workflow using only the guide.

## Backlog items spanning all sprints
- Security scanning: dependency vulnerability checks on every PR.
- Test data management: reproducible fixtures for Jira payloads.
- Documentation updates: architecture, API docs, onboarding, operations.

## Definition of done for each story
- Code merged with passing CI checks.
- Acceptance criteria demonstrated in staging.
- Required tests added and passing.
- Documentation updated.
- Observability hooks added where relevant.
