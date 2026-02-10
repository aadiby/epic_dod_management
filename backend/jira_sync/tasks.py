from __future__ import annotations

import logging
import os

from celery import shared_task

from config.observability import audit_log

from .adapter import JiraConfigurationError
from .runner import execute_sync

logger = logging.getLogger(__name__)


@shared_task(name="jira_sync.tasks.run_scheduled_jira_sync")
def run_scheduled_jira_sync() -> dict[str, object]:
    project_key = (os.getenv("JIRA_PROJECT_KEY", "").strip() or None)
    triggered_by = os.getenv("SYNC_SCHEDULE_ACTOR", "celery_beat")

    try:
        run = execute_sync(
            project_key=project_key,
            trigger="schedule",
            triggered_by=triggered_by,
        )
    except JiraConfigurationError as exc:
        logger.warning("Skipping scheduled Jira sync due to configuration error: %s", exc)
        audit_log(
            "sync.schedule.skipped",
            level=logging.WARNING,
            project_key=project_key or "",
            triggered_by=triggered_by,
            reason=str(exc),
        )
        return {
            "status": "SKIPPED",
            "reason": str(exc),
        }

    audit_log(
        "sync.schedule.completed",
        project_key=run.project_key,
        triggered_by=run.triggered_by,
        run_id=run.id,
        status=run.status,
        sprint_snapshots=run.sprint_snapshots,
        epic_snapshots=run.epic_snapshots,
        dod_task_snapshots=run.dod_task_snapshots,
    )
    return {
        "status": run.status,
        "run_id": run.id,
        "sprint_snapshots": run.sprint_snapshots,
        "epic_snapshots": run.epic_snapshots,
        "dod_task_snapshots": run.dod_task_snapshots,
    }
