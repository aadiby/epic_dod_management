# API Reference

Base path: `/api`

## Health

### `GET /health`
- Purpose: basic backend liveness.
- Response: `200 { "status": "ok" }` (service fields may vary).

## Authentication

### `GET /auth/session`
- Returns current session state and resolved role.
- Response includes:
  - `authenticated`
  - `role_auth_enabled`
  - `user` (`username`, `email`, `role`, `managed_squads`)

### `POST /auth/login`
- Body:
  - `username` (string, required)
  - `password` (string, required)
- Response: session payload on success.

### `POST /auth/logout`
- Logs out current session.

## Compliance dashboard

### `GET /metrics`
- Query params:
  - `sprint_snapshot_id` (optional)
  - `squad` (comma-separated list, optional)
  - `category` (DoD category, optional)
  - `epic_status` (`all|open|done`, optional)
- Response:
  - `scope`
    - default (without `sprint_snapshot_id`): aggregated latest snapshot per active sprint (`sprint_state=active`)
    - include `scope_mode` (`single|aggregate`), `sprint_snapshot_count`, and `sprint_snapshot_ids`
  - `summary`:
    - `total_epics`
    - `compliant_epics`
    - `non_compliant_epics`
    - `compliance_percentage`
    - `epics_with_missing_squad_labels`
    - `epics_with_invalid_squad_labels`
  - `by_team` (ranked leaderboard rows)
  - `by_category`

### `GET /epics/non-compliant`
- Query params:
  - `sprint_snapshot_id` (optional)
  - `squad` (comma-separated list, optional)
  - `category` (optional)
  - `epic_status` (`all|open|done`, optional)
- Response:
  - `scope`
  - `count`
  - `epics[]` with:
    - scope metadata per epic (`sprint_snapshot_id`, `jira_sprint_id`, `sprint_name`)
    - epic metadata (`jira_key`, `summary`, `jira_url`, `teams`)
    - squad label flags (`missing_squad_labels`, `squad_label_warnings`)
    - `compliance_reasons`
    - `failing_dod_tasks[]`:
      - `jira_key`, `jira_url`, `summary`, `category`,
      - `is_done`, `has_evidence_link`, `evidence_link`,
      - `non_compliance_reason`
    - `nudge` cooldown state

### `GET /nudges/history`
- Query params:
  - `sprint_snapshot_id` (optional)
  - `squad` (comma-separated list, optional)
  - `limit` (1..200, optional, default `50`)
- Response: sent nudge log entries for scoped data.
  - each entry includes `sprint_snapshot_id` and `sprint_name`

### `POST /epics/{jira_key}/nudge`
- Body (optional):
  - `recipients` (array of emails)
- Behavior:
  - rejects compliant epics
  - enforces cooldown
  - records `NudgeLog`
- Response: send detail + recipients + updated nudge cooldown state.

## Team configuration

### `GET /teams`
- Returns team records with recipients and scrum masters.

### `POST /teams/{team_key}/recipients`
- Body:
  - `recipients` (array of emails)

### `POST /teams/{team_key}/scrum-masters`
- Body:
  - `scrum_masters` (array of usernames)

## Sync operations

### `GET /sync/status`
- Returns:
  - `latest_run`
  - `latest_snapshot`
  - `freshness`:
    - `status` (`fresh|stale|missing`)
    - `is_stale`
    - `stale_threshold_minutes`
    - `age_seconds`, `age_minutes`
    - `last_snapshot_at`
    - `message`
- Emits alert audit event when freshness is stale/missing.

### `POST /sync/run`
- Body:
  - `project_key` (optional)
- Triggers manual sync execution.

## Authorization notes
- With `ENABLE_ROLE_AUTH=0`, endpoints are open in dev mode.
- With `ENABLE_ROLE_AUTH=1`:
  - authenticated session required,
  - role checks applied per endpoint and squad scope.

## Error patterns
- `400`: validation/configuration error.
- `401`: authentication required / invalid credentials.
- `403`: role/scope forbidden.
- `404`: scoped resource not found.
- `429`: nudge cooldown active.
- `500`: runtime failure.
