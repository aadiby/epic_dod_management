# DoD Compliance Dashboard

Initial Sprint 1 scaffold for a Django + React webapp.

Detailed local setup is documented in `/Users/aliadiby/Documents/projects/jurgen_demo/docs/local-development.md`.

Additional documentation:
- Roadmap: `/Users/aliadiby/Documents/projects/jurgen_demo/docs/implementation-backlog.md`
- LDAP + HTTPS configuration: `/Users/aliadiby/Documents/projects/jurgen_demo/docs/ldap-https-configuration.md`
- Frontend end-user flow: `/Users/aliadiby/Documents/projects/jurgen_demo/docs/frontend-enduser-guide.md`
- Performance baseline: `/Users/aliadiby/Documents/projects/jurgen_demo/docs/performance-baseline.md`
- Release runbook: `/Users/aliadiby/Documents/projects/jurgen_demo/docs/release-runbook.md`
- Architecture: `/Users/aliadiby/Documents/projects/jurgen_demo/docs/architecture.md`
- API reference: `/Users/aliadiby/Documents/projects/jurgen_demo/docs/api-reference.md`

## Services
- Backend: Django REST API (`/api/health`)
- Frontend: React + Vite dashboard shell
- Data infrastructure: PostgreSQL + Redis (compose)
- Background jobs: Celery worker + Celery beat (compose)

## Local run
1. Copy `.env.example` to `.env` and adapt values.
2. Start services:

```bash
docker compose up --build
```

SQLite is the default development database (`USE_SQLITE=1`).
Role-based authorization is optional in dev (`ENABLE_ROLE_AUTH=0` by default).

3. Open:
- Frontend: `http://localhost:5173`
- Backend health: `http://localhost:8000/api/health`

## Optional HTTPS reverse proxy (private network)
1. Set secure mode in `.env`:

```env
ENABLE_HTTPS=1
CSRF_TRUSTED_ORIGINS=https://localhost:8443
ALLOWED_HOSTS=localhost,127.0.0.1,backend
```

2. Start with secure profile:

```bash
docker compose --profile secure up --build
```

3. Open:
- App over HTTPS: `https://localhost:8443`
- HTTP redirect check: `http://localhost:8080`

The secure profile generates a self-signed certificate in the `nginx_certs` Docker volume when none exists.

4. Run smoke validation:

```bash
./scripts/smoke_https_profile.sh
```

Periodic Jira sync is executed by Celery beat (default every 15 minutes) and processed by Celery worker.
Session auth endpoints are available at `/api/auth/session`, `/api/auth/login`, and `/api/auth/logout`.

## Optional Postgres in development
To run with Postgres instead of SQLite:
1. Set `USE_SQLITE=0` in `.env`.
2. Start compose with the Postgres profile:

```bash
docker compose --profile postgres up --build
```

## Local tests (without docker)

Backend:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python manage.py test
```

Frontend:

```bash
cd frontend
npm install
npm run lint
npm run test
npm run test:e2e
```
