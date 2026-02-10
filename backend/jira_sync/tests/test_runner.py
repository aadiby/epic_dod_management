from types import SimpleNamespace
from unittest.mock import Mock, patch

from django.test import TestCase

from jira_sync.adapter import JiraConfigurationError
from jira_sync.models import SyncRun
from jira_sync.runner import execute_sync
from jira_sync.service import SyncSummary


class SyncRunnerTests(TestCase):
    @patch("jira_sync.runner.JiraSnapshotSyncService")
    @patch("jira_sync.runner.JiraClientAdapter.from_env")
    def test_execute_sync_records_success(
        self,
        from_env_mock: Mock,
        service_cls_mock: Mock,
    ):
        adapter = SimpleNamespace()
        from_env_mock.return_value = adapter

        service = Mock()
        service.sync_active_sprint.return_value = SyncSummary(
            sprint_snapshots=1,
            epic_snapshots=2,
            dod_task_snapshots=3,
        )
        service_cls_mock.return_value = service

        run = execute_sync(project_key="ABC", trigger="manual", triggered_by="test_user")

        self.assertEqual(run.status, SyncRun.STATUS_SUCCESS)
        self.assertEqual(run.project_key, "ABC")
        self.assertEqual(run.sprint_snapshots, 1)
        self.assertEqual(run.epic_snapshots, 2)
        self.assertEqual(run.dod_task_snapshots, 3)
        self.assertIsNotNone(run.finished_at)

    @patch("jira_sync.runner.JiraClientAdapter.from_env")
    def test_execute_sync_records_failure(self, from_env_mock: Mock):
        from_env_mock.side_effect = JiraConfigurationError("missing credentials")

        with self.assertLogs("dod.audit", level="ERROR") as captured:
            with self.assertRaises(JiraConfigurationError):
                execute_sync(project_key=None, trigger="manual", triggered_by="test_user")

        run = SyncRun.objects.latest("started_at")
        self.assertEqual(run.status, SyncRun.STATUS_FAILED)
        self.assertIn("missing credentials", run.error_message)
        self.assertIsNotNone(run.finished_at)
        self.assertIn("alert.sync.failed", "\n".join(captured.output))
