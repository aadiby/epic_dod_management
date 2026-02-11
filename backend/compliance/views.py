from __future__ import annotations

import json
import logging
import os
from collections import defaultdict
from dataclasses import dataclass
from datetime import timedelta
from typing import Iterable

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import send_mail
from django.utils import timezone
from rest_framework import status
from rest_framework.authentication import SessionAuthentication
from rest_framework.response import Response
from rest_framework.views import APIView

from config.observability import audit_log

from .authz import ROLE_ADMIN, ROLE_NONE, ROLE_SCRUM_MASTER, ROLE_VIEWER, get_user_role
from .models import DoDTaskSnapshot, EpicSnapshot, NudgeLog, SprintSnapshot, Team

UserModel = get_user_model()


@dataclass
class EpicEvaluation:
    is_compliant: bool
    reasons: list[str]
    failing_tasks: list[DoDTaskSnapshot]
    scoped_tasks: list[DoDTaskSnapshot]


class ComplianceFilterMixin:
    def _role_auth_enabled(self) -> bool:
        return bool(getattr(settings, "ENABLE_ROLE_AUTH", False))

    def _require_read_access(self, request) -> Response | None:
        if not self._role_auth_enabled():
            return None

        user = getattr(request, "user", None)
        if user is None or not getattr(user, "is_authenticated", False):
            return Response(
                {"detail": "Authentication required."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        role = get_user_role(user)
        if role not in {ROLE_ADMIN, ROLE_SCRUM_MASTER, ROLE_VIEWER}:
            return Response(
                {"detail": "User has no dashboard role."},
                status=status.HTTP_403_FORBIDDEN,
            )

        return None

    def _require_admin_access(self, request) -> Response | None:
        guard = self._require_read_access(request)
        if guard is not None:
            return guard

        if self._role_auth_enabled() and get_user_role(request.user) != ROLE_ADMIN:
            return Response(
                {"detail": "Admin role required."},
                status=status.HTTP_403_FORBIDDEN,
            )

        return None

    def _managed_squad_keys(self, request) -> set[str] | None:
        if not self._role_auth_enabled():
            return None

        role = get_user_role(request.user)
        if role in {ROLE_ADMIN, ROLE_VIEWER}:
            return None

        if role == ROLE_SCRUM_MASTER:
            return set(
                Team.objects.filter(scrum_masters=request.user).values_list("key", flat=True)
            )

        return set()

    def _can_nudge_epic(self, request, epic: EpicSnapshot) -> bool:
        if not self._role_auth_enabled():
            return True

        role = get_user_role(request.user)
        if role == ROLE_ADMIN:
            return True
        if role != ROLE_SCRUM_MASTER:
            return False

        managed_squads = self._managed_squad_keys(request) or set()
        epic_team_keys = {team.key for team in epic.teams.all()}
        return len(epic_team_keys.intersection(managed_squads)) > 0

    def _parse_csv(self, raw: str | None) -> list[str]:
        if not raw:
            return []
        return [item.strip() for item in raw.split(",") if item.strip()]

    def _resolve_sprint_snapshots(self, request) -> list[SprintSnapshot]:
        sprint_id = (request.query_params.get("sprint_snapshot_id") or "").strip()
        queryset = SprintSnapshot.objects.order_by("-sync_timestamp", "-id")

        if sprint_id:
            snapshot = queryset.filter(id=sprint_id).first()
            return [snapshot] if snapshot is not None else []

        active_snapshots = list(
            SprintSnapshot.objects.filter(sprint_state__iexact="active").order_by(
                "jira_sprint_id",
                "-sync_timestamp",
                "-id",
            )
        )
        if active_snapshots:
            latest_per_sprint: dict[str, SprintSnapshot] = {}
            for snapshot in active_snapshots:
                if snapshot.jira_sprint_id not in latest_per_sprint:
                    latest_per_sprint[snapshot.jira_sprint_id] = snapshot
            return sorted(
                latest_per_sprint.values(),
                key=lambda snapshot: (snapshot.sync_timestamp, snapshot.id),
                reverse=True,
            )

        latest = queryset.first()
        if latest is None:
            return []

        # Fallback: if no active snapshots exist, use latest sync batch.
        return list(
            queryset.filter(sync_timestamp=latest.sync_timestamp).order_by("-sync_timestamp", "-id")
        )

    def _resolve_sprint_snapshot(self, request) -> SprintSnapshot | None:
        snapshots = self._resolve_sprint_snapshots(request)
        return snapshots[0] if snapshots else None

    def _base_epics_queryset(self, request, sprint_snapshots: list[SprintSnapshot]):
        squad_keys = self._parse_csv(request.query_params.get("squad"))
        epic_status = (request.query_params.get("epic_status") or "all").strip().lower()

        snapshot_ids = [snapshot.id for snapshot in sprint_snapshots]
        queryset = (
            EpicSnapshot.objects.filter(sprint_snapshot_id__in=snapshot_ids)
            .select_related("sprint_snapshot")
            .prefetch_related("teams", "dod_tasks", "nudge_logs")
            .order_by("jira_key", "-sprint_snapshot_id")
        )

        managed_squads = self._managed_squad_keys(request)
        if managed_squads is not None:
            if not managed_squads:
                return queryset.none()
            queryset = queryset.filter(teams__key__in=sorted(managed_squads)).distinct()

        if squad_keys:
            queryset = queryset.filter(teams__key__in=squad_keys).distinct()

        if epic_status == "done":
            queryset = queryset.filter(is_done=True)
        elif epic_status == "open":
            queryset = queryset.filter(is_done=False)

        return queryset

    def _task_is_compliant(self, task: DoDTaskSnapshot) -> bool:
        return task.is_done and task.has_evidence_link

    def _evaluate_epic(self, epic: EpicSnapshot, category_filter: str | None) -> EpicEvaluation | None:
        all_tasks = list(epic.dod_tasks.all())
        scoped_tasks = [
            task for task in all_tasks if not category_filter or task.category == category_filter
        ]

        if category_filter and not scoped_tasks:
            return None

        if not scoped_tasks:
            return EpicEvaluation(
                is_compliant=False,
                reasons=["no_dod_tasks"],
                failing_tasks=[],
                scoped_tasks=[],
            )

        failing_tasks = [task for task in scoped_tasks if not self._task_is_compliant(task)]
        reasons: list[str] = []
        if failing_tasks:
            reasons.append("incomplete_dod_tasks")

        return EpicEvaluation(
            is_compliant=not failing_tasks,
            reasons=reasons,
            failing_tasks=failing_tasks,
            scoped_tasks=scoped_tasks,
        )

    def _latest_nudge_log(self, epic: EpicSnapshot) -> NudgeLog | None:
        logs = list(epic.nudge_logs.all())
        if logs:
            return max(logs, key=lambda entry: entry.sent_at)
        return (
            NudgeLog.objects.filter(epic_snapshot=epic)
            .order_by("-sent_at")
            .first()
        )

    def _nudge_state(self, epic: EpicSnapshot) -> dict[str, object]:
        latest_nudge = self._latest_nudge_log(epic)
        if latest_nudge is None:
            return {
                "cooldown_active": False,
                "seconds_remaining": 0,
                "last_sent_at": None,
            }

        cooldown = timedelta(hours=settings.NUDGE_COOLDOWN_HOURS)
        expires_at = latest_nudge.sent_at + cooldown
        remaining = int((expires_at - timezone.now()).total_seconds())
        cooldown_active = remaining > 0

        return {
            "cooldown_active": cooldown_active,
            "seconds_remaining": max(remaining, 0),
            "last_sent_at": latest_nudge.sent_at.isoformat(),
        }

    def _resolve_recipients(self, epic: EpicSnapshot, explicit_recipients: list[str]) -> list[str]:
        if explicit_recipients:
            return sorted(set(explicit_recipients))

        # Prefer recipients configured directly on Team records.
        recipients: list[str] = []
        for team in epic.teams.all():
            recipients.extend(
                [str(item).strip() for item in (team.notification_emails or []) if str(item).strip()]
            )

        recipients = sorted(set(recipients))
        if recipients:
            return recipients

        team_recipients_raw = (settings.__dict__.get("NUDGE_TEAM_RECIPIENTS_JSON") or "").strip()
        if not team_recipients_raw:
            team_recipients_raw = os.getenv("NUDGE_TEAM_RECIPIENTS_JSON", "").strip()

        team_map: dict[str, list[str]] = {}
        if team_recipients_raw:
            try:
                parsed = json.loads(team_recipients_raw)
                if isinstance(parsed, dict):
                    for key, value in parsed.items():
                        if isinstance(value, list):
                            team_map[str(key)] = [str(item).strip() for item in value if str(item).strip()]
            except json.JSONDecodeError:
                team_map = {}

        recipients = []
        for team in epic.teams.all():
            recipients.extend(team_map.get(team.key, []))

        recipients = sorted(set(recipients))
        if recipients:
            return recipients

        defaults = self._parse_csv(os.getenv("NUDGE_DEFAULT_RECIPIENTS", ""))
        return sorted(set(defaults))

    def _scope_payload(self, sprint_snapshots: list[SprintSnapshot]) -> dict[str, object]:
        latest = sprint_snapshots[0]
        if len(sprint_snapshots) == 1:
            sprint_snapshot = latest
            return {
                "scope_mode": "single",
                "sprint_snapshot_count": 1,
                "sprint_snapshot_ids": [sprint_snapshot.id],
                "sprint_snapshot_id": sprint_snapshot.id,
                "jira_sprint_id": sprint_snapshot.jira_sprint_id,
                "sprint_name": sprint_snapshot.sprint_name,
                "sprint_state": sprint_snapshot.sprint_state,
                "sync_timestamp": sprint_snapshot.sync_timestamp.isoformat(),
            }

        return {
            "scope_mode": "aggregate",
            "sprint_snapshot_count": len(sprint_snapshots),
            "sprint_snapshot_ids": [snapshot.id for snapshot in sprint_snapshots],
            # Backward-compatible scalar fields for existing clients.
            "sprint_snapshot_id": latest.id,
            "jira_sprint_id": "aggregate",
            "sprint_name": f"All Active Sprints ({len(sprint_snapshots)})",
            "sprint_state": "mixed",
            "sync_timestamp": latest.sync_timestamp.isoformat(),
        }

    def _resolve_actor(self, request) -> str:
        user = getattr(request, "user", None)
        if user is not None and getattr(user, "is_authenticated", False):
            return getattr(user, "email", "") or getattr(user, "username", "") or "authenticated_user"

        header_actor = request.headers.get("X-Actor")
        if header_actor:
            return header_actor.strip()

        return "anonymous"

    def _non_compliant_epic_payload(
        self,
        epic: EpicSnapshot,
        evaluation: EpicEvaluation,
    ) -> dict[str, object]:
        return self._epic_payload(epic, evaluation)

    def _epic_payload(
        self,
        epic: EpicSnapshot,
        evaluation: EpicEvaluation,
    ) -> dict[str, object]:
        return {
            "sprint_snapshot_id": epic.sprint_snapshot_id,
            "jira_sprint_id": epic.sprint_snapshot.jira_sprint_id,
            "sprint_name": epic.sprint_snapshot.sprint_name,
            "jira_key": epic.jira_key,
            "summary": epic.summary,
            "status_name": epic.status_name,
            "resolution_name": epic.resolution_name,
            "is_done": epic.is_done,
            "is_compliant": evaluation.is_compliant,
            "jira_url": epic.jira_url,
            "teams": sorted([team.key for team in epic.teams.all()]),
            "missing_squad_labels": epic.missing_squad_labels,
            "squad_label_warnings": list(epic.squad_label_warnings or []),
            "compliance_reasons": evaluation.reasons,
            "failing_dod_tasks": [
                {
                    "jira_key": task.jira_key,
                    "summary": task.summary,
                    "category": task.category,
                    "is_done": task.is_done,
                    "jira_url": task.jira_url,
                    "has_evidence_link": task.has_evidence_link,
                    "evidence_link": task.evidence_link,
                    "non_compliance_reason": task.non_compliance_reason,
                }
                for task in evaluation.failing_tasks
            ],
            "nudge": self._nudge_state(epic),
        }


class MetricsView(ComplianceFilterMixin, APIView):
    authentication_classes = [SessionAuthentication]
    permission_classes = []

    def get(self, request):
        guard = self._require_read_access(request)
        if guard is not None:
            return guard

        sprint_snapshots = self._resolve_sprint_snapshots(request)
        category = request.query_params.get("category")

        if not sprint_snapshots:
            return Response(
                {
                    "scope": None,
                    "summary": {
                        "total_epics": 0,
                        "compliant_epics": 0,
                        "non_compliant_epics": 0,
                        "compliance_percentage": 0.0,
                        "epics_with_missing_squad_labels": 0,
                        "epics_with_invalid_squad_labels": 0,
                    },
                    "by_team": [],
                    "by_category": [],
                }
            )

        epics = list(self._base_epics_queryset(request, sprint_snapshots))

        evaluated: list[tuple[EpicSnapshot, EpicEvaluation]] = []
        for epic in epics:
            evaluation = self._evaluate_epic(epic, category_filter=category)
            if evaluation is None:
                continue
            evaluated.append((epic, evaluation))

        total_epics = len(evaluated)
        compliant_epics = sum(1 for _, evaluation in evaluated if evaluation.is_compliant)
        non_compliant_epics = total_epics - compliant_epics
        compliance_percentage = round((compliant_epics / total_epics) * 100, 2) if total_epics else 0.0
        epics_with_missing_squad_labels = sum(
            1 for epic, _ in evaluated if epic.missing_squad_labels
        )
        epics_with_invalid_squad_labels = sum(
            1 for epic, _ in evaluated if bool(epic.squad_label_warnings)
        )

        by_team = self._build_team_metrics(evaluated)
        by_category = self._build_category_metrics(evaluated, category_filter=category)

        return Response(
            {
                "scope": self._scope_payload(sprint_snapshots),
                "summary": {
                    "total_epics": total_epics,
                    "compliant_epics": compliant_epics,
                    "non_compliant_epics": non_compliant_epics,
                    "compliance_percentage": compliance_percentage,
                    "epics_with_missing_squad_labels": epics_with_missing_squad_labels,
                    "epics_with_invalid_squad_labels": epics_with_invalid_squad_labels,
                },
                "by_team": by_team,
                "by_category": by_category,
            }
        )

    def _build_team_metrics(self, evaluated: Iterable[tuple[EpicSnapshot, EpicEvaluation]]):
        counters: dict[str, dict[str, int]] = defaultdict(
            lambda: {"total_epics": 0, "compliant_epics": 0}
        )

        for epic, evaluation in evaluated:
            for team in epic.teams.all():
                counters[team.key]["total_epics"] += 1
                if evaluation.is_compliant:
                    counters[team.key]["compliant_epics"] += 1

        metrics = []
        for team_key, values in counters.items():
            total = values["total_epics"]
            compliant = values["compliant_epics"]
            metrics.append(
                {
                    "team": team_key,
                    "total_epics": total,
                    "compliant_epics": compliant,
                    "non_compliant_epics": total - compliant,
                    "compliance_percentage": round((compliant / total) * 100, 2) if total else 0.0,
                }
            )

        metrics.sort(
            key=lambda item: (
                -float(item["compliance_percentage"]),
                -int(item["compliant_epics"]),
                -int(item["total_epics"]),
                str(item["team"]),
            )
        )
        for index, item in enumerate(metrics, start=1):
            item["rank"] = index

        return metrics

    def _build_category_metrics(
        self,
        evaluated: Iterable[tuple[EpicSnapshot, EpicEvaluation]],
        category_filter: str | None,
    ):
        counters: dict[str, dict[str, int]] = defaultdict(
            lambda: {"total_tasks": 0, "compliant_tasks": 0}
        )

        for _, evaluation in evaluated:
            for task in evaluation.scoped_tasks:
                counters[task.category]["total_tasks"] += 1
                if self._task_is_compliant(task):
                    counters[task.category]["compliant_tasks"] += 1

        categories = [category_filter] if category_filter else sorted(counters.keys())

        output = []
        for category in categories:
            if not category:
                continue
            values = counters.get(category, {"total_tasks": 0, "compliant_tasks": 0})
            total = values["total_tasks"]
            compliant = values["compliant_tasks"]
            output.append(
                {
                    "category": category,
                    "total_tasks": total,
                    "compliant_tasks": compliant,
                    "non_compliant_tasks": total - compliant,
                    "compliance_percentage": round((compliant / total) * 100, 2) if total else 0.0,
                }
            )

        return output


class EpicsOverviewView(ComplianceFilterMixin, APIView):
    authentication_classes = [SessionAuthentication]
    permission_classes = []

    def get(self, request):
        guard = self._require_read_access(request)
        if guard is not None:
            return guard

        sprint_snapshots = self._resolve_sprint_snapshots(request)
        category = request.query_params.get("category")
        compliance_status = (
            (request.query_params.get("compliance_status") or "all").strip().lower()
        )
        if compliance_status not in {"all", "non_compliant", "compliant"}:
            compliance_status = "all"

        if not sprint_snapshots:
            return Response({"scope": None, "count": 0, "epics": []})

        epics = list(self._base_epics_queryset(request, sprint_snapshots))
        payload_epics = []

        for epic in epics:
            evaluation = self._evaluate_epic(epic, category_filter=category)
            if evaluation is None:
                continue
            if compliance_status == "non_compliant" and evaluation.is_compliant:
                continue
            if compliance_status == "compliant" and not evaluation.is_compliant:
                continue

            payload_epics.append(self._epic_payload(epic, evaluation))

        return Response(
            {
                "scope": self._scope_payload(sprint_snapshots),
                "count": len(payload_epics),
                "epics": payload_epics,
            }
        )


class NonCompliantEpicsView(ComplianceFilterMixin, APIView):
    authentication_classes = [SessionAuthentication]
    permission_classes = []

    def get(self, request):
        guard = self._require_read_access(request)
        if guard is not None:
            return guard

        sprint_snapshots = self._resolve_sprint_snapshots(request)
        category = request.query_params.get("category")

        if not sprint_snapshots:
            return Response({"scope": None, "count": 0, "epics": []})

        epics = list(self._base_epics_queryset(request, sprint_snapshots))
        non_compliant_epics = []

        for epic in epics:
            evaluation = self._evaluate_epic(epic, category_filter=category)
            if evaluation is None or evaluation.is_compliant:
                continue

            non_compliant_epics.append(self._non_compliant_epic_payload(epic, evaluation))

        return Response(
            {
                "scope": self._scope_payload(sprint_snapshots),
                "count": len(non_compliant_epics),
                "epics": non_compliant_epics,
            }
        )


class TeamsView(APIView):
    authentication_classes = [SessionAuthentication]
    permission_classes = []

    def get(self, request):
        role_auth_enabled = bool(getattr(settings, "ENABLE_ROLE_AUTH", False))
        if role_auth_enabled:
            user = getattr(request, "user", None)
            if user is None or not getattr(user, "is_authenticated", False):
                return Response(
                    {"detail": "Authentication required."},
                    status=status.HTTP_401_UNAUTHORIZED,
                )

            role = get_user_role(user)
            if role not in {ROLE_ADMIN, ROLE_SCRUM_MASTER, ROLE_VIEWER}:
                return Response(
                    {"detail": "User has no dashboard role."},
                    status=status.HTTP_403_FORBIDDEN,
                )

            if role == ROLE_SCRUM_MASTER:
                teams = Team.objects.filter(scrum_masters=user).order_by("key")
            else:
                teams = Team.objects.order_by("key")
        else:
            teams = Team.objects.order_by("key")

        return Response(
            {
                "count": teams.count(),
                "teams": [
                    {
                        "key": team.key,
                        "display_name": team.display_name,
                        "notification_emails": sorted(
                            [str(item).strip() for item in (team.notification_emails or []) if str(item).strip()]
                        ),
                        "scrum_masters": sorted(
                            [
                                scrum_master.username
                                for scrum_master in team.scrum_masters.all().order_by("username")
                            ]
                        ),
                        "is_active": team.is_active,
                    }
                    for team in teams
                ],
            }
        )


class TeamRecipientsView(APIView):
    authentication_classes = [SessionAuthentication]
    permission_classes = []

    def post(self, request, team_key: str):
        role_auth_enabled = bool(getattr(settings, "ENABLE_ROLE_AUTH", False))
        if role_auth_enabled:
            user = getattr(request, "user", None)
            if user is None or not getattr(user, "is_authenticated", False):
                return Response(
                    {"detail": "Authentication required."},
                    status=status.HTTP_401_UNAUTHORIZED,
                )
            if get_user_role(user) != ROLE_ADMIN:
                return Response(
                    {"detail": "Admin role required."},
                    status=status.HTTP_403_FORBIDDEN,
                )

        team = Team.objects.filter(key=team_key).first()
        if team is None:
            return Response(
                {"detail": f"Team '{team_key}' not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        request_data = request.data if isinstance(request.data, dict) else {}
        recipients_raw = request_data.get("recipients", [])
        if not isinstance(recipients_raw, list):
            return Response(
                {"detail": "Field 'recipients' must be a list."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        recipients = sorted(set([str(item).strip() for item in recipients_raw if str(item).strip()]))
        team.notification_emails = recipients
        team.save(update_fields=["notification_emails"])

        return Response(
            {
                "detail": "Team recipients updated.",
                "team": {
                    "key": team.key,
                    "display_name": team.display_name,
                    "notification_emails": team.notification_emails,
                    "scrum_masters": sorted(
                        [scrum_master.username for scrum_master in team.scrum_masters.all().order_by("username")]
                    ),
                    "is_active": team.is_active,
                },
            }
        )


class TeamScrumMastersView(APIView):
    authentication_classes = [SessionAuthentication]
    permission_classes = []

    def post(self, request, team_key: str):
        role_auth_enabled = bool(getattr(settings, "ENABLE_ROLE_AUTH", False))
        if role_auth_enabled:
            user = getattr(request, "user", None)
            if user is None or not getattr(user, "is_authenticated", False):
                return Response(
                    {"detail": "Authentication required."},
                    status=status.HTTP_401_UNAUTHORIZED,
                )
            if get_user_role(user) != ROLE_ADMIN:
                return Response(
                    {"detail": "Admin role required."},
                    status=status.HTTP_403_FORBIDDEN,
                )

        team = Team.objects.filter(key=team_key).first()
        if team is None:
            return Response(
                {"detail": f"Team '{team_key}' not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        request_data = request.data if isinstance(request.data, dict) else {}
        scrum_masters_raw = request_data.get("scrum_masters", [])
        if not isinstance(scrum_masters_raw, list):
            return Response(
                {"detail": "Field 'scrum_masters' must be a list of usernames."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        usernames = sorted(
            set([str(item).strip() for item in scrum_masters_raw if str(item).strip()])
        )

        users = list(UserModel.objects.filter(username__in=usernames))
        user_map = {user.username: user for user in users}
        missing_usernames = [username for username in usernames if username not in user_map]
        if missing_usernames:
            return Response(
                {
                    "detail": "Unknown usernames in scrum_masters payload.",
                    "unknown_usernames": missing_usernames,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        team.scrum_masters.set([user_map[username] for username in usernames])

        return Response(
            {
                "detail": "Team scrum masters updated.",
                "team": {
                    "key": team.key,
                    "display_name": team.display_name,
                    "notification_emails": sorted(
                        [str(item).strip() for item in (team.notification_emails or []) if str(item).strip()]
                    ),
                    "scrum_masters": sorted(
                        [scrum_master.username for scrum_master in team.scrum_masters.all().order_by("username")]
                    ),
                    "is_active": team.is_active,
                },
            }
        )


class NudgeHistoryView(ComplianceFilterMixin, APIView):
    authentication_classes = [SessionAuthentication]
    permission_classes = []

    def get(self, request):
        guard = self._require_read_access(request)
        if guard is not None:
            return guard

        sprint_snapshots = self._resolve_sprint_snapshots(request)
        if not sprint_snapshots:
            return Response({"scope": None, "count": 0, "total_count": 0, "nudges": []})

        squad_keys = self._parse_csv(request.query_params.get("squad"))
        try:
            limit = int(request.query_params.get("limit", "50"))
        except ValueError:
            limit = 50
        limit = max(1, min(limit, 200))

        queryset = (
            NudgeLog.objects.filter(epic_snapshot__sprint_snapshot_id__in=[s.id for s in sprint_snapshots])
            .select_related("epic_snapshot", "epic_snapshot__sprint_snapshot", "team")
            .prefetch_related("epic_snapshot__teams")
            .order_by("-sent_at")
        )

        managed_squads = self._managed_squad_keys(request)
        if managed_squads is not None:
            if not managed_squads:
                queryset = queryset.none()
            else:
                queryset = queryset.filter(epic_snapshot__teams__key__in=sorted(managed_squads)).distinct()

        if squad_keys:
            queryset = queryset.filter(epic_snapshot__teams__key__in=squad_keys).distinct()

        total_count = queryset.count()
        logs = list(queryset[:limit])
        nudges = []
        for log in logs:
            nudges.append(
                {
                    "epic_key": log.epic_snapshot.jira_key,
                    "sprint_snapshot_id": log.epic_snapshot.sprint_snapshot_id,
                    "sprint_name": log.epic_snapshot.sprint_snapshot.sprint_name,
                    "epic_summary": log.epic_snapshot.summary,
                    "team": log.team.key if log.team else None,
                    "epic_teams": sorted([team.key for team in log.epic_snapshot.teams.all()]),
                    "triggered_by": log.triggered_by,
                    "recipient_emails": log.recipient_emails,
                    "sent_at": log.sent_at.isoformat(),
                }
            )

        return Response(
            {
                "scope": self._scope_payload(sprint_snapshots),
                "count": len(nudges),
                "total_count": total_count,
                "nudges": nudges,
            }
        )


class NudgeEpicView(ComplianceFilterMixin, APIView):
    authentication_classes = [SessionAuthentication]
    permission_classes = []

    def post(self, request, jira_key: str):
        guard = self._require_read_access(request)
        if guard is not None:
            audit_log(
                "nudge.rejected",
                request=request,
                level=logging.WARNING,
                epic_key=jira_key,
                reason="read_access_denied",
            )
            return guard

        sprint_snapshots = self._resolve_sprint_snapshots(request)
        if not sprint_snapshots:
            audit_log(
                "nudge.rejected",
                request=request,
                level=logging.WARNING,
                epic_key=jira_key,
                reason="no_sprint_snapshot",
            )
            return Response(
                {"detail": "No sprint snapshot available."},
                status=status.HTTP_404_NOT_FOUND,
            )

        snapshot_ids = [snapshot.id for snapshot in sprint_snapshots]
        epic = (
            EpicSnapshot.objects.filter(
                sprint_snapshot_id__in=snapshot_ids,
                jira_key=jira_key,
            )
            .select_related("sprint_snapshot")
            .prefetch_related("teams", "dod_tasks", "nudge_logs")
            .order_by("-sprint_snapshot__sync_timestamp", "-sprint_snapshot_id", "-id")
            .first()
        )
        if epic is None:
            audit_log(
                "nudge.rejected",
                request=request,
                level=logging.WARNING,
                epic_key=jira_key,
                scope_snapshot_ids=snapshot_ids,
                reason="epic_not_found",
            )
            return Response(
                {"detail": f"Epic '{jira_key}' not found in selected sprint snapshot."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if not self._can_nudge_epic(request, epic):
            audit_log(
                "nudge.rejected",
                request=request,
                level=logging.WARNING,
                epic_key=epic.jira_key,
                sprint_snapshot_id=epic.sprint_snapshot_id,
                reason="not_allowed_for_user_scope",
            )
            return Response(
                {"detail": "You are not allowed to nudge this epic."},
                status=status.HTTP_403_FORBIDDEN,
            )

        evaluation = self._evaluate_epic(epic, category_filter=None)
        if evaluation is None or evaluation.is_compliant:
            audit_log(
                "nudge.rejected",
                request=request,
                level=logging.INFO,
                epic_key=epic.jira_key,
                sprint_snapshot_id=epic.sprint_snapshot_id,
                reason="epic_is_compliant",
            )
            return Response(
                {"detail": "Epic is currently compliant; nudge is not required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        nudge_state = self._nudge_state(epic)
        if nudge_state["cooldown_active"]:
            audit_log(
                "nudge.rejected",
                request=request,
                level=logging.WARNING,
                epic_key=epic.jira_key,
                sprint_snapshot_id=epic.sprint_snapshot_id,
                reason="cooldown_active",
                seconds_remaining=nudge_state["seconds_remaining"],
            )
            return Response(
                {
                    "detail": "Nudge cooldown is active for this epic.",
                    "nudge": nudge_state,
                },
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        request_data = request.data if isinstance(request.data, dict) else {}
        explicit_recipients = [
            str(item).strip()
            for item in request_data.get("recipients", [])
            if str(item).strip()
        ]
        recipients = self._resolve_recipients(epic, explicit_recipients)

        if not recipients:
            audit_log(
                "nudge.rejected",
                request=request,
                level=logging.WARNING,
                epic_key=epic.jira_key,
                sprint_snapshot_id=epic.sprint_snapshot_id,
                reason="no_recipients",
            )
            return Response(
                {"detail": "No recipients resolved for nudge email."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        actor = self._resolve_actor(request)
        subject = f"[DoD Nudge] {epic.jira_key} is non-compliant"
        lines = [
            f"Epic: {epic.jira_key} - {epic.summary}",
            f"Jira: {epic.jira_url}",
            "",
            "Non-compliant DoD tasks:",
        ]
        for task in evaluation.failing_tasks:
            lines.append(
                f"- {task.jira_key}: {task.summary} ({task.non_compliance_reason or 'incomplete'})"
            )
            if task.evidence_link:
                lines.append(f"  evidence: {task.evidence_link}")

        body = "\n".join(lines)
        send_mail(
            subject,
            body,
            settings.DEFAULT_FROM_EMAIL,
            recipients,
            fail_silently=False,
        )

        teams = list(epic.teams.all())
        team: Team | None = teams[0] if len(teams) == 1 else None
        nudge_log = NudgeLog.objects.create(
            epic_snapshot=epic,
            team=team,
            triggered_by=actor,
            recipient_emails=recipients,
            message_preview=body,
        )
        audit_log(
            "nudge.sent",
            request=request,
            epic_key=epic.jira_key,
            sprint_snapshot_id=epic.sprint_snapshot_id,
            recipient_count=len(recipients),
            nudge_log_id=nudge_log.id,
            failing_task_count=len(evaluation.failing_tasks),
        )

        return Response(
            {
                "detail": "Nudge email sent.",
                "epic_key": epic.jira_key,
                "recipients": recipients,
                "sent_at": nudge_log.sent_at.isoformat(),
                "nudge": self._nudge_state(epic),
            },
            status=status.HTTP_200_OK,
        )
