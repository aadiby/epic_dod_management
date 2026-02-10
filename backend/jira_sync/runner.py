from __future__ import annotations

import logging

from django.utils import timezone

from config.observability import audit_log

from .adapter import JiraClientAdapter
from .models import SyncRun
from .service import JiraSnapshotSyncService


def execute_sync(
    project_key: str | None,
    trigger: str = "manual",
    triggered_by: str = "system",
) -> SyncRun:
    audit_log(
        "sync.execute.started",
        project_key=(project_key or "").strip(),
        trigger=trigger,
        triggered_by=triggered_by,
    )
    run = SyncRun.objects.create(
        started_at=timezone.now(),
        status=SyncRun.STATUS_RUNNING,
        trigger=trigger,
        triggered_by=triggered_by,
        project_key=(project_key or "").strip(),
    )

    try:
        adapter = JiraClientAdapter.from_env()
        service = JiraSnapshotSyncService(adapter)
        summary = service.sync_active_sprint(project_key=project_key)

        run.status = SyncRun.STATUS_SUCCESS
        run.sprint_snapshots = summary.sprint_snapshots
        run.epic_snapshots = summary.epic_snapshots
        run.dod_task_snapshots = summary.dod_task_snapshots
        run.finished_at = timezone.now()
        run.error_message = ""
        run.save(
            update_fields=[
                "status",
                "sprint_snapshots",
                "epic_snapshots",
                "dod_task_snapshots",
                "finished_at",
                "error_message",
            ]
        )
        audit_log(
            "sync.execute.succeeded",
            run_id=run.id,
            project_key=run.project_key,
            trigger=run.trigger,
            triggered_by=run.triggered_by,
            sprint_snapshots=run.sprint_snapshots,
            epic_snapshots=run.epic_snapshots,
            dod_task_snapshots=run.dod_task_snapshots,
        )
        return run
    except Exception as exc:
        run.status = SyncRun.STATUS_FAILED
        run.finished_at = timezone.now()
        run.error_message = str(exc)
        run.save(update_fields=["status", "finished_at", "error_message"])
        audit_log(
            "sync.execute.failed",
            level=logging.ERROR,
            run_id=run.id,
            project_key=run.project_key,
            trigger=run.trigger,
            triggered_by=run.triggered_by,
            error=str(exc),
        )
        audit_log(
            "alert.sync.failed",
            level=logging.ERROR,
            run_id=run.id,
            project_key=run.project_key,
            trigger=run.trigger,
            triggered_by=run.triggered_by,
            error=str(exc),
        )
        raise
