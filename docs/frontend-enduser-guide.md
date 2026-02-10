# End-User Frontend Guide

## Purpose
This guide explains how scrum masters, viewers, and admins use the DoD Compliance Dashboard.

## Access
- Open the web app URL provided by your team.
- If LDAP authentication is enabled, log in with your corporate credentials.
- Your visible actions depend on role:
  - Viewer: read-only.
  - Scrum Master: scoped read + nudge for managed squads.
  - Admin: full access including team recipients and manual sync.

## Navigation overview
Use the top navigation bar:
- `Overview`
- `Non-compliant Epics`
- `Nudge History`
- `Teams`
- `Sync`

Use `Refresh data` in the header to reload latest snapshots/metrics.

## Shared filters
Filters appear on dashboard pages:
- `Squads`: comma-separated squad labels (example `squad_platform,squad_mobile`).
- `DoD Category`: filter by task category.
- `Epic status`: `All`, `Open`, or `Done`.

Filters affect:
- Overview metrics and tables.
- Non-compliant epics list.
- Nudge history list.

## Page-by-page usage
### 1. Overview
Use this page to understand current sprint compliance:
- KPI cards:
  - Total Epics
  - Compliant
  - Non-compliant
  - Compliance %
  - Missing squad labels
  - Invalid squad labels
- Team Compliance table: team ranking by compliance.
- DoD Category table: compliance by DoD category.

Typical workflow:
- Apply filters for your squads.
- Check compliance %.
- Move to `Non-compliant Epics` for action.

### 2. Non-compliant Epics
Use this page to find actionable gaps:
- Each epic row shows:
  - Epic key and summary.
  - Teams.
  - Compliance reasons.
  - Squad-label quality warnings (missing/invalid labels).
  - Failing DoD tasks.
  - Direct links to Jira task pages and evidence link status.
- Action button: `Nudge team`.

Nudge behavior:
- Clicking `Review & nudge` opens a confirmation dialog.
- Dialog shows recipients and a preview of the nudge message body.
- You can edit recipients before sending.
- Button is disabled while sending.
- Cooldown may block repeated nudges for the same epic.
- Success/failure message appears below the action.

### 3. Nudge History
Use this page to audit reminder activity:
- Shows time sent, epic, teams, actor, and recipients.
- Honors current squad filter.

### 4. Teams
Admin-focused page for recipient management:
- Edit comma-separated recipient emails per team.
- Edit scrum master usernames per team.
- Click `Save Recipients` to store notification recipients.
- Click `Save Scrum Masters` to store squad ownership assignments.
- Changes apply to future nudges.

### 5. Sync
Admin-focused page for Jira data refresh:
- Optional `Project key`.
- Click `Run Sync` for manual refresh.
- See latest run result and snapshot summary.

## Recommended end-user flow
1. Open `Overview` and apply your squad/category filters.
2. Check compliance KPIs and identify risk areas.
3. Open `Non-compliant Epics` and review failing DoD tasks.
4. Send nudges where needed.
5. Confirm in `Nudge History`.
6. If data looks stale, ask admin to run manual sync from `Sync`.

## Common issues
- No data visible:
  - Filters may be too strict.
  - Latest sprint snapshot may not exist yet.
  - If role auth is enabled, you may not be assigned to squads.
- Nudge button unavailable:
  - Epic may be under cooldown.
  - Your role may not allow nudge action.
- Cannot access Teams/Sync actions:
  - Admin role is required.
