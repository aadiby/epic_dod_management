# LDAP and HTTPS Configuration Guide

## Purpose
This guide describes how to configure:
- LDAP authentication and role mapping for multi-user access.
- HTTPS termination for private-network deployment.

This project runs in a secure private network, so HTTPS certificates do not need to be publicly signed. Use either:
- An internal CA-issued certificate.
- A self-signed certificate trusted by client machines.

## Target architecture
- Reverse proxy (Nginx/Traefik) terminates TLS on `443`.
- Proxy forwards traffic to:
  - Frontend container/service.
  - Backend Django API container/service.
- Django trusts proxy TLS headers and uses secure cookies.
- LDAP authenticates users against corporate directory.

## LDAP configuration
### 1. Dependencies
Install and enable:
- `django-auth-ldap` Python package.
- System LDAP libraries in backend image (OpenLDAP + SASL headers/libs).

Example backend package additions:
- `django-auth-ldap`
- OS packages like `libldap2-dev` and `libsasl2-dev` (names may differ by base image).

This repository's backend image already installs LDAP build dependencies and backend requirements include `django-auth-ldap` and `python-ldap`.

### 2. Environment variables
Add to deployment `.env` (example names):
- `ENABLE_ROLE_AUTH=1`
- `LDAP_SERVER_URI=ldap://ldap.example.internal:389` or `ldaps://ldap.example.internal:636`
- `LDAP_BIND_DN=CN=svc_dod,OU=Service Accounts,DC=example,DC=internal`
- `LDAP_BIND_PASSWORD=<secret>`
- `LDAP_USER_BASE_DN=OU=Users,DC=example,DC=internal`
- `LDAP_GROUP_BASE_DN=OU=Groups,DC=example,DC=internal`
- `LDAP_REQUIRE_GROUP=CN=dod_users,OU=Groups,DC=example,DC=internal`
- `LDAP_ADMIN_GROUP_DN=CN=dod_admin,OU=Groups,DC=example,DC=internal`
- `LDAP_SCRUM_MASTER_GROUP_DN=CN=dod_scrum_master,OU=Groups,DC=example,DC=internal`
- `LDAP_VIEWER_GROUP_DN=CN=dod_viewer,OU=Groups,DC=example,DC=internal`

### 3. Django auth settings
Configure Django authentication backends to include LDAP backend before model backend.
This app maps LDAP groups to Django groups using env variables:
- `LDAP_ADMIN_GROUP_DN` -> Django group `dod_admin`
- `LDAP_SCRUM_MASTER_GROUP_DN` -> Django group `dod_scrum_master`
- `LDAP_VIEWER_GROUP_DN` -> Django group `dod_viewer`

Role group sync runs at login so authorization in API views remains accurate.
LDAP bind failures are logged as audit events while API responses stay generic (no sensitive bind details are returned).

### 4. Role behavior in this app
With `ENABLE_ROLE_AUTH=1`:
- `dod_admin`:
  - Full read access.
  - Can run manual sync (`POST /api/sync/run`).
  - Can update team recipients.
- `dod_scrum_master`:
  - Read access scoped to assigned teams (`Team.scrum_masters`).
  - Can nudge only epics in managed squads.
- `dod_viewer`:
  - Read-only dashboard access.
  - Cannot nudge, update recipients, or run manual sync.

## HTTPS configuration
### 1. Certificate strategy for private network
Use one:
- Internal CA certificate chain.
- Self-signed certificate installed in trusted store of user devices.

Publicly trusted certificates are optional in this network model.

For local/private-network container runs, this repository includes a Docker Compose `secure` profile with Nginx TLS termination and self-signed cert generation.

### 2. Reverse proxy requirements
Configure proxy to:
- Listen on `443` with TLS cert/key.
- Redirect `80` to `443`.
- Forward `X-Forwarded-Proto=https` and `X-Forwarded-For`.
- Forward API paths (`/api`) to Django backend.
- Forward frontend paths (`/`) to frontend app.

### 3. Django production security settings
Set and verify:
- `DEBUG=0`
- `CSRF_TRUSTED_ORIGINS=https://<host>`
- `ALLOWED_HOSTS=<host>`
- `SECURE_PROXY_SSL_HEADER=('HTTP_X_FORWARDED_PROTO', 'https')`
- `SECURE_SSL_REDIRECT=True`
- `SESSION_COOKIE_SECURE=True`
- `CSRF_COOKIE_SECURE=True`
- `SECURE_HSTS_SECONDS` (example: `31536000`)
- `SECURE_HSTS_INCLUDE_SUBDOMAINS=True` (if applicable)

### 4. Example operational checks
- Open `http://<host>` and confirm redirect to `https://<host>`.
- Open app in browser and confirm valid TLS trust for your private-network cert model.
- Confirm secure/session cookies are marked `Secure`.
- Confirm authenticated access works when `ENABLE_ROLE_AUTH=1`.

### 5. Local secure profile run (included)
1. Configure `.env`:
   - `ENABLE_HTTPS=1`
   - `CSRF_TRUSTED_ORIGINS=https://localhost:8443`
   - optional `TLS_CERT_CN=localhost` and port overrides (`HTTPS_HTTP_PORT`, `HTTPS_HTTPS_PORT`, `TLS_REDIRECT_PORT`)
2. Start:

```bash
docker compose --profile secure up --build
```

3. Validate:
   - `http://localhost:8080` redirects to `https://localhost:8443`
   - App and `/api/health` load over HTTPS through the proxy

4. Run automated smoke test:

```bash
./scripts/smoke_https_profile.sh
```

Production example:

```bash
STRICT_TLS=1 ./scripts/smoke_https_profile.sh dod-dashboard.internal 80 443 /api/health
```

## Validation checklist
- LDAP bind success with service account.
- LDAP user login success.
- Group-to-role mapping verified for admin, scrum master, viewer.
- Scrum master can only view managed squads.
- Viewer cannot run nudge/manual sync actions.
- HTTPS redirect works from port 80 to 443.
- API requests and UI load over HTTPS only.

## Troubleshooting
- Login fails for all users:
  - Verify LDAP bind DN/password and connectivity to LDAP host/port.
- User logs in but has no access:
  - Verify LDAP group membership and mapping to `dod_*` groups.
- Scrum master sees no data:
  - Verify `Team.scrum_masters` assignments in Django admin.
- Browser shows certificate warning:
  - Install internal CA root cert on client devices or trust self-signed cert.
