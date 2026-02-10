from __future__ import annotations

import logging

from django.conf import settings
from django.utils import timezone
from rest_framework import status
from rest_framework.authentication import SessionAuthentication
from rest_framework.response import Response
from rest_framework.views import APIView

from compliance.authz import ROLE_ADMIN, ROLE_SCRUM_MASTER, ROLE_VIEWER, get_user_role
from compliance.models import SprintSnapshot
from config.observability import audit_log

from .adapter import JiraConfigurationError
from .models import SyncRun
from .runner import execute_sync


class SyncStatusView(APIView):
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

        now = timezone.now()
        latest_run = SyncRun.objects.order_by("-started_at").first()
        latest_snapshot = SprintSnapshot.objects.order_by("-sync_timestamp", "-id").first()
        freshness = self._serialize_freshness(latest_snapshot, now)
        if freshness.get("is_stale"):
            audit_log(
                "alert.sync.stale",
                request=request,
                level=logging.WARNING,
                freshness_status=freshness.get("status"),
                stale_threshold_minutes=freshness.get("stale_threshold_minutes"),
                age_seconds=freshness.get("age_seconds"),
                latest_snapshot_id=latest_snapshot.id if latest_snapshot else None,
            )

        return Response(
            {
                "server_time": now.isoformat(),
                "latest_run": self._serialize_run(latest_run),
                "latest_snapshot": self._serialize_snapshot(latest_snapshot),
                "freshness": freshness,
            }
        )

    def _serialize_run(self, run: SyncRun | None):
        if run is None:
            return None

        return {
            "id": run.id,
            "started_at": run.started_at.isoformat(),
            "finished_at": run.finished_at.isoformat() if run.finished_at else None,
            "status": run.status,
            "trigger": run.trigger,
            "triggered_by": run.triggered_by,
            "project_key": run.project_key,
            "sprint_snapshots": run.sprint_snapshots,
            "epic_snapshots": run.epic_snapshots,
            "dod_task_snapshots": run.dod_task_snapshots,
            "error_message": run.error_message,
        }

    def _serialize_snapshot(self, snapshot: SprintSnapshot | None):
        if snapshot is None:
            return None

        return {
            "id": snapshot.id,
            "jira_sprint_id": snapshot.jira_sprint_id,
            "sprint_name": snapshot.sprint_name,
            "sprint_state": snapshot.sprint_state,
            "sync_timestamp": snapshot.sync_timestamp.isoformat(),
        }

    def _serialize_freshness(self, snapshot: SprintSnapshot | None, now):
        threshold_minutes = max(int(getattr(settings, "SYNC_STALE_THRESHOLD_MINUTES", 30)), 1)
        threshold_seconds = threshold_minutes * 60
        if snapshot is None:
            return {
                "status": "missing",
                "is_stale": True,
                "stale_threshold_minutes": threshold_minutes,
                "age_seconds": None,
                "age_minutes": None,
                "last_snapshot_at": None,
                "message": "No sprint snapshot available yet.",
            }

        age_seconds = max(int((now - snapshot.sync_timestamp).total_seconds()), 0)
        is_stale = age_seconds > threshold_seconds
        return {
            "status": "stale" if is_stale else "fresh",
            "is_stale": is_stale,
            "stale_threshold_minutes": threshold_minutes,
            "age_seconds": age_seconds,
            "age_minutes": round(age_seconds / 60, 2),
            "last_snapshot_at": snapshot.sync_timestamp.isoformat(),
            "message": (
                f"Latest snapshot is stale (>{threshold_minutes} minutes old)."
                if is_stale
                else "Latest snapshot is fresh."
            ),
        }


class SyncRunView(APIView):
    authentication_classes = [SessionAuthentication]
    permission_classes = []

    def post(self, request):
        role_auth_enabled = bool(getattr(settings, "ENABLE_ROLE_AUTH", False))
        if role_auth_enabled:
            user = getattr(request, "user", None)
            if user is None or not getattr(user, "is_authenticated", False):
                audit_log(
                    "sync.run.rejected",
                    request=request,
                    level=logging.WARNING,
                    reason="authentication_required",
                )
                return Response(
                    {"detail": "Authentication required."},
                    status=status.HTTP_401_UNAUTHORIZED,
                )
            if get_user_role(user) != ROLE_ADMIN:
                audit_log(
                    "sync.run.rejected",
                    request=request,
                    level=logging.WARNING,
                    reason="admin_role_required",
                )
                return Response(
                    {"detail": "Admin role required."},
                    status=status.HTTP_403_FORBIDDEN,
                )

        request_data = request.data if isinstance(request.data, dict) else {}
        project_key = (request_data.get("project_key") or "").strip() or None

        actor = request.headers.get("X-Actor", "").strip() or "anonymous"
        if role_auth_enabled and getattr(request.user, "is_authenticated", False):
            actor = (
                getattr(request.user, "email", "").strip()
                or getattr(request.user, "username", "").strip()
                or actor
            )
        audit_log(
            "sync.run.requested",
            request=request,
            project_key=project_key or "",
            actor=actor,
        )

        try:
            run = execute_sync(project_key=project_key, trigger="manual", triggered_by=actor)
        except JiraConfigurationError as exc:
            audit_log(
                "sync.run.failed",
                request=request,
                level=logging.WARNING,
                project_key=project_key or "",
                actor=actor,
                error=str(exc),
                error_type="configuration",
            )
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except Exception as exc:
            audit_log(
                "sync.run.failed",
                request=request,
                level=logging.ERROR,
                project_key=project_key or "",
                actor=actor,
                error=str(exc),
                error_type="runtime",
            )
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        audit_log(
            "sync.run.succeeded",
            request=request,
            project_key=run.project_key,
            actor=run.triggered_by,
            run_id=run.id,
            status=run.status,
            sprint_snapshots=run.sprint_snapshots,
            epic_snapshots=run.epic_snapshots,
            dod_task_snapshots=run.dod_task_snapshots,
        )

        return Response(
            {
                "detail": "Sync finished.",
                "run": {
                    "id": run.id,
                    "started_at": run.started_at.isoformat(),
                    "finished_at": run.finished_at.isoformat() if run.finished_at else None,
                    "status": run.status,
                    "trigger": run.trigger,
                    "triggered_by": run.triggered_by,
                    "project_key": run.project_key,
                    "sprint_snapshots": run.sprint_snapshots,
                    "epic_snapshots": run.epic_snapshots,
                    "dod_task_snapshots": run.dod_task_snapshots,
                    "error_message": run.error_message,
                },
            },
            status=status.HTTP_200_OK,
        )
