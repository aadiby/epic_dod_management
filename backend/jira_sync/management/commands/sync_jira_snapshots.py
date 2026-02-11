import os

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from jira_sync.adapter import JiraConfigurationError
from jira_sync.runner import execute_sync


class Command(BaseCommand):
    help = "Sync active-sprint Jira data into local snapshot tables"

    def add_arguments(self, parser):
        parser.add_argument(
            "--project-key",
            dest="project_key",
            default=None,
            help="Optional Jira project key filter",
        )

    def handle(self, *args, **options):
        default_project_key = (getattr(settings, "DEFAULT_SYNC_PROJECT_KEY", "") or "").strip()
        project_key = options.get("project_key") or os.getenv("JIRA_PROJECT_KEY") or default_project_key

        try:
            run = execute_sync(
                project_key=project_key,
                trigger="cli",
                triggered_by="management_command",
            )
        except JiraConfigurationError as exc:
            raise CommandError(str(exc)) from exc
        except Exception as exc:
            raise CommandError(f"Jira sync failed: {exc}") from exc

        self.stdout.write(
            self.style.SUCCESS(
                "Sync complete: "
                f"sprint_snapshots={run.sprint_snapshots}, "
                f"epic_snapshots={run.epic_snapshots}, "
                f"dod_task_snapshots={run.dod_task_snapshots}"
            )
        )
