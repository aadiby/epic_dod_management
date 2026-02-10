# Local Development

## Overview
- Backend: Django
- Frontend: React + Vite
- Default development database: SQLite3
- Optional development database: PostgreSQL via Docker profile
- Python dependencies must be installed in `backend/.venv` (no global or user-level installs)

## Prerequisites
- Python 3.9+
- Node.js 22+
- npm 11+
- Docker Desktop (optional for containerized local run)

## Environment setup
1. Copy environment template:

```bash
cp .env.example .env
```

2. Keep SQLite enabled for local development:

```env
USE_SQLITE=1
ENABLE_ROLE_AUTH=0
ENABLE_HTTPS=0
ENABLE_LDAP_AUTH=0
SYNC_STALE_THRESHOLD_MINUTES=30
```

Optional authorization mode:
- Set `ENABLE_ROLE_AUTH=1` to require authenticated users with one of these Django group names:
  - `dod_admin`
  - `dod_scrum_master`
  - `dod_viewer`
- `dod_scrum_master` access is restricted to teams assigned via `Team.scrum_masters`.
- `dod_admin` is required for manual sync (`POST /api/sync/run`) and team recipient updates.
- Set `ENABLE_LDAP_AUTH=1` only when LDAP settings are configured and LDAP dependencies are installed.
- When LDAP is enabled, set these role mapping DNs so users are placed in app roles at login:
  - `LDAP_ADMIN_GROUP_DN`
  - `LDAP_SCRUM_MASTER_GROUP_DN`
  - `LDAP_VIEWER_GROUP_DN`

## Run locally without Docker
### Backend
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

If your editor shows `from django.core.management.base import ...` as unresolved, set the Python interpreter to `backend/.venv/bin/python`.

### Create local users for role-auth visual testing
Use this when `ENABLE_ROLE_AUTH=1`.

1. Create a superuser (maps to admin role automatically):

```bash
cd backend
source .venv/bin/activate
python manage.py createsuperuser
```

2. Seed non-superuser role test accounts and squad assignment:

```bash
cd backend
source .venv/bin/activate
python manage.py shell <<'PY'
from django.contrib.auth.models import Group, User
from compliance.models import Team

GROUP_ADMIN = "dod_admin"
GROUP_SCRUM_MASTER = "dod_scrum_master"
GROUP_VIEWER = "dod_viewer"

for group_name in [GROUP_ADMIN, GROUP_SCRUM_MASTER, GROUP_VIEWER]:
    Group.objects.get_or_create(name=group_name)

def upsert_user(username, email, password, group_name):
    user, _ = User.objects.get_or_create(username=username, defaults={"email": email})
    user.email = email
    user.is_staff = False
    user.is_superuser = False
    user.set_password(password)
    user.save()
    user.groups.clear()
    user.groups.add(Group.objects.get(name=group_name))
    return user

admin_user = upsert_user("demo_admin", "demo_admin@example.com", "password123", GROUP_ADMIN)
scrum_user = upsert_user("demo_scrum", "demo_scrum@example.com", "password123", GROUP_SCRUM_MASTER)
viewer_user = upsert_user("demo_viewer", "demo_viewer@example.com", "password123", GROUP_VIEWER)

team, _ = Team.objects.get_or_create(
    key="squad_platform",
    defaults={"display_name": "Platform", "notification_emails": ["platform@example.com"]},
)
team.scrum_masters.add(scrum_user)
team.save()

print("Created/updated users:")
print("  demo_admin / password123  -> dod_admin")
print("  demo_scrum / password123  -> dod_scrum_master (assigned to squad_platform)")
print("  demo_viewer / password123 -> dod_viewer")
print("Superuser keeps full admin access via is_superuser=True.")
PY
```

3. Visual validation guide (frontend at `http://localhost:5173`):
- `demo_viewer`: read-only pages, no nudge actions, no admin pages.
- `demo_scrum`: can view scoped squad data and send nudges only for managed squads.
- `demo_admin` or superuser: can access all pages including `Teams` and `Sync`.

### Optional background scheduler (local)
Use a second and third terminal when you want periodic Jira sync every `SYNC_INTERVAL_MINUTES`:

```bash
cd backend
source .venv/bin/activate
celery -A config worker --loglevel=info
```

```bash
cd backend
source .venv/bin/activate
celery -A config beat --loglevel=info
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

Open:
- Frontend: `http://localhost:5173`
- Backend API health: `http://localhost:8000/api/health`

## Run with Docker Compose (SQLite default)
```bash
docker compose up --build
```

This starts `backend`, `frontend`, `redis`, `celery_worker`, and `celery_beat`.

## Run with Docker Compose over HTTPS (private network)
1. Update `.env` for secure-mode backend behavior:

```env
ENABLE_HTTPS=1
CSRF_TRUSTED_ORIGINS=https://localhost:8443
```

2. Start secure profile:

```bash
docker compose --profile secure up --build
```

This adds `reverse_proxy` (Nginx TLS terminator) and exposes:
- `https://localhost:8443` (primary app entrypoint)
- `http://localhost:8080` (redirects to HTTPS)

Important:
- When `ENABLE_HTTPS=1`, open the frontend on `https://localhost:8443`.
- Do not use `http://localhost:5173` in this mode; API calls may be redirected to an internal container hostname (for example `https://backend:8000/...`) that your browser cannot resolve.
- If you switched between secure and non-secure modes and still see `backend:8000` errors in browser devtools, clear site data for `localhost` (or use a private window) and reload.

The reverse proxy auto-generates a self-signed cert when missing and stores it in the `nginx_certs` volume.

### HTTPS smoke test command
Run this after the secure profile is up:

```bash
./scripts/smoke_https_profile.sh
```

Arguments:
- `./scripts/smoke_https_profile.sh <host> <http_port> <https_port> <health_path>`
- Example for production ports: `./scripts/smoke_https_profile.sh dod-dashboard.internal 80 443 /api/health`

TLS behavior:
- Default uses `curl -k` (for self-signed/private certs).
- To require trusted TLS, run: `STRICT_TLS=1 ./scripts/smoke_https_profile.sh dod-dashboard.internal 80 443 /api/health`

## Optional: Run with PostgreSQL instead of SQLite
1. Set in `.env`:

```env
USE_SQLITE=0
```

2. Start with Postgres profile:

```bash
docker compose --profile postgres up --build
```

## Local test commands
### Backend
```bash
cd backend
source .venv/bin/activate
python manage.py check
python manage.py test
```

### Frontend
```bash
cd frontend
npm run lint
npm run test
npm run build
npm run test:e2e
```

### Performance baseline harness
```bash
cd backend
source .venv/bin/activate
python manage.py benchmark_performance --api-iterations 50 --epics 120 --dod-tasks-per-epic 3
```

## Jira snapshot sync command
When Jira credentials are configured in `.env`, run:

```bash
cd backend
source .venv/bin/activate
python manage.py sync_jira_snapshots --project-key <JIRA_PROJECT_KEY>
```

## Capture Jira API payloads for troubleshooting
Use this in the secure business network where Jira access works.  
It captures real Jira responses to JSON files so you can share them for debugging.

Wrapper script:

```bash
./scripts/capture_jira_payloads.sh \
  --project-key <JIRA_PROJECT_KEY> \
  --include-children \
  --max-results 200 \
  --remote-links-limit 50 \
  --output-dir ./backend/jira_capture_output
```

Direct management command (equivalent):

```bash
cd backend
source .venv/bin/activate
python manage.py capture_jira_payloads \
  --project-key <JIRA_PROJECT_KEY> \
  --include-children \
  --max-results 200 \
  --remote-links-limit 50 \
  --output-dir ./jira_capture_output
```

Behavior notes:
- The command now exits non-zero if any Jira API calls fail, but still writes `errors.json` and the other payload files.
- Use `--allow-partial` if you want it to succeed even with API failures.
- If Jira returns no active sprint issues, payload files can still be empty with `errors=0`; add `--project-key` and/or `--epic-key`, or use `--fail-on-empty` to make that condition fail.

Generated files:
- `manifest.json`
- `active_sprint_issues.json`
- `epic_details.json`
- `child_issues_by_epic.json`
- `remote_links.json`
- `errors.json`

Optional:
- add `--epic-key ABC-123 --epic-key ABC-456` to force child issue capture for specific epics.

## Available backend endpoints
- `GET /api/health`
- `GET /api/auth/session`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/metrics`
- `GET /api/epics/non-compliant`
- `POST /api/epics/<JIRA_KEY>/nudge`
- `GET /api/nudges/history`
- `GET /api/teams`
- `POST /api/teams/<TEAM_KEY>/recipients`
- `POST /api/teams/<TEAM_KEY>/scrum-masters`
- `GET /api/sync/status`
- `POST /api/sync/run`

When `ENABLE_ROLE_AUTH=1`:
- Read endpoints require an authenticated user in one of: `dod_admin`, `dod_scrum_master`, `dod_viewer`.
- `POST /api/epics/<JIRA_KEY>/nudge` is allowed for `dod_admin` and in-scope `dod_scrum_master`.
- `POST /api/teams/<TEAM_KEY>/recipients`, `POST /api/teams/<TEAM_KEY>/scrum-masters`, and `POST /api/sync/run` require `dod_admin`.

Supported query parameters for compliance endpoints:
- `sprint_snapshot_id=<id>`
- `squad=squad_platform,squad_mobile`
- `category=automated_tests`
- `epic_status=all|open|done`
- `sprint_snapshot_id=<id>` for nudge POST as well

## Team recipient management
- Recipients are persisted per team in the local DB (`Team.notification_emails`).
- Use the frontend “Team Notification Recipients” section or call:

```bash
curl -X POST http://localhost:8000/api/teams/squad_platform/recipients \
  -H "Content-Type: application/json" \
  -d '{"recipients": ["team@example.com"]}'
```

## Common troubleshooting
- Docker daemon not running:
  - Start Docker Desktop and rerun compose commands.
- Frontend cannot reach backend:
  - Ensure backend is running on `8000` and `VITE_PROXY_TARGET` points to it.
- DB mismatch when switching engines:
  - If switching between SQLite and Postgres, rerun migrations.

## Observability events
- Backend emits structured audit log events on logger `dod.audit` for:
  - auth login/logout flows
  - manual/scheduled sync flows
  - nudge send/reject flows
- Every API response includes `X-Request-ID`.
- Pass `X-Request-ID` from callers/proxies to correlate frontend, proxy, and backend logs.
