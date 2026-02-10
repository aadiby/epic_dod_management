# DoD Compliance Webapp Architecture

## System context
- Source systems: Jira (epics, stories, tasks, remote links), LDAP (authentication and role mapping).
- Users: Admin, Scrum Master, Viewer.
- Outputs: web dashboard, nudge emails, audit logs.

## Runtime components
- Frontend (`React + Vite`):
  - Role-aware pages: overview, non-compliant epics, nudge history, teams, sync.
  - Uses session auth and CSRF-protected API calls.
- Backend (`Django + DRF`):
  - Compliance APIs (`/api/metrics`, `/api/epics/non-compliant`, `/api/nudges/history`).
  - Auth/session APIs (`/api/auth/session`, `/api/auth/login`, `/api/auth/logout`).
  - Team config APIs and manual sync APIs.
- Background sync (`Celery worker + beat`):
  - Scheduled Jira snapshot sync.
  - Manual sync uses the same sync service path.
- Data store:
  - Development default: SQLite (`USE_SQLITE=1`).
  - Optional production/dev profile: Postgres.
- Reverse proxy (`nginx`, secure compose profile):
  - HTTPS termination for private-network deployment.

## Data model overview
- `SprintSnapshot`
  - Immutable snapshot of sprint metadata plus `issue_versions` map used for idempotency.
- `EpicSnapshot`
  - Immutable epic state, teams, Jira link, and squad label quality flags (`missing_squad_labels`, `squad_label_warnings`).
- `DoDTaskSnapshot`
  - Immutable DoD task state, task Jira URL, evidence link, and computed non-compliance reasons.
- `Team`
  - Team key (`squad_*`), notification recipients, scrum master assignments.
- `NudgeLog`
  - Outbound nudge audit trail (actor, recipients, preview, timestamp).
- `SyncRun`
  - Sync execution history and outcomes.

## Sync flow
1. Fetch active sprint issues from Jira.
2. Group by sprint and epic.
3. Build per-sprint issue version map.
4. Compare against the latest snapshot for that Jira sprint:
   - unchanged -> skip snapshot creation (idempotent behavior),
   - changed -> create new immutable sprint/epic/task snapshots.
5. Compute DoD task compliance and squad-label quality metadata.

## Compliance and ranking rules
- DoD task detection: summary starts with `DoD - `.
- DoD task compliant only when:
  - done (resolution/status category done), and
  - evidence link exists.
- Epic compliant only when all scoped DoD tasks are compliant and at least one DoD task exists.
- Team leaderboard ranking:
  - compliance percentage desc,
  - compliant epics desc,
  - total epics desc,
  - team key asc.

## Security model
- Session auth + CSRF for all state-changing endpoints.
- Optional LDAP auth backend with role-group synchronization.
- Role authorization:
  - Admin: global access + manual sync/team management.
  - Scrum Master: scoped dashboard/nudge access for assigned squads.
  - Viewer: read-only.
- HTTPS profile with secure cookie/HSTS/proxy-aware settings.

## Observability
- Structured audit logs include correlation ID and user identity fields when available.
- Alert events emitted for:
  - stale/missing snapshot freshness (`alert.sync.stale`),
  - sync execution failures (`alert.sync.failed`).

## Deployment topology (recommended)
- `frontend` and `backend` containers behind `reverse_proxy`.
- `celery_worker` and `celery_beat` for sync jobs.
- `redis` broker for Celery.
- optional `postgres` service for production-like persistence.
