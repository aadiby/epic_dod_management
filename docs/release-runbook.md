# Release Runbook

## Scope
Operational checklist for deploying, validating, rolling back, and rotating secrets for the DoD dashboard.

## Deployment prerequisites
- Production `.env` configured (Jira, LDAP, SMTP, HTTPS, role auth).
- TLS termination in place (reverse proxy with internal CA or trusted self-signed cert).
- Database backup policy active.
- CI green for backend tests, frontend tests, e2e, and security scans.

## Deployment procedure
1. Pull the release tag/commit on deployment host.
2. Update environment secrets in deployment `.env`.
3. Build and start services:

```bash
docker compose --profile secure up --build -d
```

4. Run database migrations:

```bash
docker compose exec backend python manage.py migrate
```

5. Validate HTTPS and health:

```bash
STRICT_TLS=1 ./scripts/smoke_https_profile.sh dod-dashboard.internal 80 443 /api/health
```

6. Validate app login and role access for:
- `dod_admin`
- `dod_scrum_master`
- `dod_viewer`

7. Validate sync + dashboard freshness:
- Trigger manual sync from `/sync` page.
- Confirm `/api/sync/status` freshness reports `fresh`.

## Rollback procedure
1. Identify previous stable release tag.
2. Checkout previous release on deployment host.
3. Rebuild/start previous release:

```bash
docker compose --profile secure up --build -d
```

4. Run smoke checks and confirm user login + dashboard data.
5. If rollback includes DB schema mismatch, restore DB backup from pre-release snapshot.

## Secrets rotation
- Rotate:
  - `JIRA_API_KEY`
  - LDAP bind password (`LDAP_BIND_PASSWORD`)
  - SMTP credentials (`EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`)
  - Django secret key (`DJANGO_SECRET_KEY`)
- Update `.env` securely on deployment host.
- Restart services:

```bash
docker compose --profile secure up -d
```

- Validate:
  - auth login works
  - manual sync works
  - nudge email send works

## Staging dry-run checklist
- Fresh deploy from scratch succeeds.
- LDAP login success/failure behavior verified.
- HTTPS redirect and secure cookies verified.
- Manual sync success and stale->fresh transition verified.
- Nudge flow verified end-to-end.
- `benchmark_performance` executed and results recorded.

## Pilot sign-off checklist
- Scrum master pilot confirms navigation + core flows.
- Admin pilot confirms team management + sync workflows.
- No critical auth/sync/email issues for agreed pilot period.
