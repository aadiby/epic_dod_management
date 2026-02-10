from __future__ import annotations

import re
import os
from dataclasses import dataclass
from typing import Any

from django.db import transaction
from django.utils import timezone

from compliance.models import DoDTaskSnapshot, EpicSnapshot, SprintSnapshot, Team

from .adapter import JiraClientAdapter

DOD_PREFIX = "DoD - "
SQUAD_PREFIX = "squad_"
CATEGORY_NON_ALNUM_RE = re.compile(r"[^a-z0-9]+")


@dataclass
class SyncSummary:
    sprint_snapshots: int
    epic_snapshots: int
    dod_task_snapshots: int


class JiraSnapshotSyncService:
    def __init__(self, adapter: JiraClientAdapter):
        self.adapter = adapter

    def sync_active_sprint(self, project_key: str | None = None) -> SyncSummary:
        issues = self.adapter.search_active_sprint_issues(project_key=project_key)
        if not issues:
            return SyncSummary(sprint_snapshots=0, epic_snapshots=0, dod_task_snapshots=0)

        sync_ts = timezone.now()
        sprints = self._extract_sprints(issues)

        created_sprints = 0
        created_epics = 0
        created_dod_tasks = 0

        for sprint in sprints:
            sprint_id = str(sprint["id"])
            issues_in_sprint = self._issues_in_sprint(issues=issues, sprint_id=sprint_id)
            if not issues_in_sprint:
                continue

            by_key = {issue.key: issue for issue in issues_in_sprint}
            for issue in issues_in_sprint:
                epic_key = self._extract_epic_key(issue)
                if epic_key and epic_key not in by_key:
                    by_key[epic_key] = self.adapter.get_issue(epic_key)

            issue_versions = self._build_issue_versions(list(by_key.values()))
            if self._should_skip_sprint_snapshot(sprint_id=sprint_id, issue_versions=issue_versions):
                continue

            with transaction.atomic():
                sprint_snapshot = SprintSnapshot.objects.create(
                    jira_sprint_id=sprint_id,
                    sprint_name=sprint["name"],
                    sprint_state=sprint.get("state", "active"),
                    sync_timestamp=sync_ts,
                    issue_versions=issue_versions,
                )

                result = self._sync_sprint_epics(
                    sprint_snapshot=sprint_snapshot,
                    issues_in_sprint=issues_in_sprint,
                    issue_by_key=by_key,
                )

                created_sprints += 1
                created_epics += result["epics"]
                created_dod_tasks += result["dod_tasks"]

        return SyncSummary(
            sprint_snapshots=created_sprints,
            epic_snapshots=created_epics,
            dod_task_snapshots=created_dod_tasks,
        )

    def _sync_sprint_epics(
        self,
        sprint_snapshot: SprintSnapshot,
        issues_in_sprint: list[Any],
        issue_by_key: dict[str, Any],
    ) -> dict[str, int]:
        epic_map: dict[str, list[Any]] = {}

        for issue in issues_in_sprint:
            epic_key = self._extract_epic_key(issue)
            if epic_key:
                epic_map.setdefault(epic_key, []).append(issue)

        created_epics = 0
        created_dod_tasks = 0

        for epic_key, linked_issues in epic_map.items():
            epic_issue = issue_by_key.get(epic_key) or self.adapter.get_issue(epic_key)
            team_keys, missing_squad_labels, squad_label_warnings = self._extract_team_metadata(
                [epic_issue, *linked_issues]
            )

            epic_snapshot = EpicSnapshot.objects.create(
                sprint_snapshot=sprint_snapshot,
                jira_issue_id=str(epic_issue.id),
                jira_key=epic_issue.key,
                summary=getattr(epic_issue.fields, "summary", ""),
                status_name=getattr(getattr(epic_issue.fields, "status", None), "name", "Unknown"),
                resolution_name=getattr(
                    getattr(epic_issue.fields, "resolution", None), "name", ""
                )
                or "",
                is_done=self._is_done(epic_issue),
                jira_url=f"{self.adapter.config.base_url}/browse/{epic_issue.key}",
                missing_squad_labels=missing_squad_labels,
                squad_label_warnings=squad_label_warnings,
            )
            created_epics += 1

            for team_key in team_keys:
                team, _ = Team.objects.get_or_create(key=team_key)
                epic_snapshot.teams.add(team)

            for issue in linked_issues:
                if self._is_dod_task(issue):
                    link_url = self._first_remote_link(issue.key)
                    is_done = self._is_done(issue)
                    has_link = bool(link_url)
                    DoDTaskSnapshot.objects.create(
                        epic_snapshot=epic_snapshot,
                        jira_issue_id=str(issue.id),
                        jira_key=issue.key,
                        summary=getattr(issue.fields, "summary", ""),
                        category=self._extract_dod_category(getattr(issue.fields, "summary", "")),
                        status_name=getattr(getattr(issue.fields, "status", None), "name", "Unknown"),
                        resolution_name=getattr(
                            getattr(issue.fields, "resolution", None), "name", ""
                        )
                        or "",
                        is_done=is_done,
                        jira_url=f"{self.adapter.config.base_url}/browse/{issue.key}",
                        has_evidence_link=has_link,
                        evidence_link=link_url or "",
                        non_compliance_reason=self._non_compliance_reason(is_done, has_link),
                    )
                    created_dod_tasks += 1

        return {"epics": created_epics, "dod_tasks": created_dod_tasks}

    def _extract_sprints(self, issues: list[Any]) -> list[dict[str, Any]]:
        seen: set[str] = set()
        sprints: list[dict[str, Any]] = []

        for issue in issues:
            for sprint in self._issue_sprints(issue):
                sprint_id = str(sprint.get("id"))
                if sprint_id and sprint_id not in seen:
                    seen.add(sprint_id)
                    sprints.append(sprint)

        return sprints

    def _issue_sprints(self, issue: Any) -> list[dict[str, Any]]:
        raw_sprints = getattr(issue.fields, "sprint", None)
        if raw_sprints:
            if not isinstance(raw_sprints, list):
                raw_sprints = [raw_sprints]

            normalized: list[dict[str, Any]] = []
            for item in raw_sprints:
                sprint = self._normalize_sprint(item)
                if sprint:
                    normalized.append(sprint)
            if normalized:
                return normalized

        fallback = getattr(issue.fields, "customfield_10020", None)
        if isinstance(fallback, list):
            normalized = []
            for item in fallback:
                sprint = self._normalize_sprint(item)
                if sprint:
                    normalized.append(sprint)
            return normalized

        return []

    def _issues_in_sprint(self, issues: list[Any], sprint_id: str) -> list[Any]:
        return [
            issue
            for issue in issues
            if sprint_id in {str(value.get("id")) for value in self._issue_sprints(issue)}
        ]

    def _build_issue_versions(self, issues: list[Any]) -> dict[str, str]:
        issue_versions: dict[str, str] = {}
        for issue in issues:
            key = str(getattr(issue, "key", "")).strip()
            if not key:
                continue
            issue_versions[key] = self._issue_version_token(issue)
        return dict(sorted(issue_versions.items()))

    def _issue_version_token(self, issue: Any) -> str:
        fields = getattr(issue, "fields", None)
        updated = getattr(fields, "updated", None)
        if isinstance(updated, str) and updated.strip():
            return updated.strip()

        if isinstance(updated, (int, float)):
            return str(updated)

        version = getattr(issue, "version", None)
        if version is not None:
            return str(version)

        status_name = getattr(getattr(fields, "status", None), "name", "") or ""
        resolution_name = getattr(getattr(fields, "resolution", None), "name", "") or ""
        summary = getattr(fields, "summary", "") or ""
        return f"fallback:{status_name}|{resolution_name}|{summary}"

    def _should_skip_sprint_snapshot(self, sprint_id: str, issue_versions: dict[str, str]) -> bool:
        latest_snapshot = (
            SprintSnapshot.objects.filter(jira_sprint_id=sprint_id)
            .order_by("-sync_timestamp", "-id")
            .first()
        )
        if latest_snapshot is None:
            return False
        previous_versions = latest_snapshot.issue_versions or {}
        return previous_versions == issue_versions

    def _normalize_sprint(self, sprint: Any) -> dict[str, Any] | None:
        if isinstance(sprint, dict):
            sprint_id = sprint.get("id")
            if sprint_id is None:
                return None

            return {
                "id": sprint_id,
                "name": sprint.get("name", f"Sprint {sprint_id}"),
                "state": sprint.get("state", "active"),
            }

        sprint_id = getattr(sprint, "id", None)
        if sprint_id is None:
            return None

        return {
            "id": sprint_id,
            "name": getattr(sprint, "name", f"Sprint {sprint_id}"),
            "state": getattr(sprint, "state", "active"),
        }

    def _extract_epic_key(self, issue: Any) -> str | None:
        issue_type = getattr(getattr(issue.fields, "issuetype", None), "name", "")
        if issue_type.lower() == "epic":
            return issue.key

        parent = getattr(issue.fields, "parent", None)
        if parent is not None:
            parent_fields = getattr(parent, "fields", None)
            parent_type = getattr(getattr(parent_fields, "issuetype", None), "name", "")
            if parent_type.lower() == "epic":
                return getattr(parent, "key", None)

        configured_field = os.getenv("JIRA_EPIC_LINK_FIELD", "customfield_10014")
        epic_link = getattr(issue.fields, configured_field, None)
        if isinstance(epic_link, str) and epic_link.strip():
            return epic_link.strip()

        return None

    def _is_dod_task(self, issue: Any) -> bool:
        summary = getattr(issue.fields, "summary", "") or ""
        return summary.startswith(DOD_PREFIX)

    def _extract_team_metadata(self, issues: list[Any]) -> tuple[set[str], bool, list[str]]:
        teams: set[str] = set()
        warnings: set[str] = set()

        for issue in issues:
            labels = getattr(issue.fields, "labels", []) or []
            for label in labels:
                if not isinstance(label, str):
                    continue
                raw = label.strip()
                if not raw:
                    continue
                normalized = raw.lower()
                if normalized.startswith(SQUAD_PREFIX):
                    team_name = normalized[len(SQUAD_PREFIX) :].strip()
                    if team_name:
                        teams.add(f"{SQUAD_PREFIX}{team_name}")
                    else:
                        warnings.add(raw)
                elif normalized.startswith("squad"):
                    warnings.add(raw)

        return teams, len(teams) == 0, sorted(warnings)

    def _extract_dod_category(self, summary: str) -> str:
        raw = summary[len(DOD_PREFIX) :].strip().lower()
        normalized = CATEGORY_NON_ALNUM_RE.sub("_", raw).strip("_")
        return normalized or "general"

    def _is_done(self, issue: Any) -> bool:
        resolution_name = (
            getattr(getattr(issue.fields, "resolution", None), "name", "") or ""
        ).strip()
        if resolution_name.lower() == "done":
            return True

        status_category = getattr(
            getattr(getattr(issue.fields, "status", None), "statusCategory", None),
            "key",
            "",
        )
        return str(status_category).lower() == "done"

    def _first_remote_link(self, issue_key: str) -> str | None:
        links = self.adapter.get_issue_remote_links(issue_key)
        for link in links:
            obj = getattr(link, "object", None)
            url = getattr(obj, "url", None)
            if isinstance(url, str) and url.strip():
                return url.strip()

        return None

    def _non_compliance_reason(self, is_done: bool, has_link: bool) -> str:
        reasons: list[str] = []
        if not is_done:
            reasons.append("task_not_done")
        if not has_link:
            reasons.append("missing_evidence_link")
        return ",".join(reasons)
