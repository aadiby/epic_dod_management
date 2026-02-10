from unittest.mock import Mock, patch

from django.test import SimpleTestCase

from jira_sync.adapter import JiraConfigurationError
from jira_sync.models import SyncRun
from jira_sync.tasks import run_scheduled_jira_sync


class ScheduledSyncTaskTests(SimpleTestCase):
    @patch("jira_sync.tasks.execute_sync")
    def test_task_executes_sync_with_schedule_trigger(self, execute_sync_mock: Mock):
        execute_sync_mock.return_value = Mock(
            id=7,
            status=SyncRun.STATUS_SUCCESS,
            sprint_snapshots=1,
            epic_snapshots=2,
            dod_task_snapshots=3,
        )

        result = run_scheduled_jira_sync()

        execute_sync_mock.assert_called_once_with(
            project_key=None,
            trigger="schedule",
            triggered_by="celery_beat",
        )
        self.assertEqual(result["status"], SyncRun.STATUS_SUCCESS)
        self.assertEqual(result["run_id"], 7)
        self.assertEqual(result["sprint_snapshots"], 1)
        self.assertEqual(result["epic_snapshots"], 2)
        self.assertEqual(result["dod_task_snapshots"], 3)

    @patch("jira_sync.tasks.execute_sync")
    def test_task_returns_skipped_when_jira_configuration_is_missing(
        self,
        execute_sync_mock: Mock,
    ):
        execute_sync_mock.side_effect = JiraConfigurationError("missing env")

        result = run_scheduled_jira_sync()

        self.assertEqual(result["status"], "SKIPPED")
        self.assertEqual(result["reason"], "missing env")
