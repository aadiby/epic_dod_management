from datetime import timedelta
from unittest.mock import Mock, patch

from django.contrib.auth.models import Group, User
from django.test import TestCase
from django.test import override_settings
from django.utils import timezone

from compliance.authz import GROUP_ADMIN, GROUP_SCRUM_MASTER, GROUP_VIEWER
from compliance.models import SprintSnapshot
from jira_sync.adapter import JiraConfigurationError
from jira_sync.models import SyncRun


class SyncApiTests(TestCase):
    def test_sync_status_returns_latest_run_and_snapshot(self):
        snapshot = SprintSnapshot.objects.create(
            jira_sprint_id="100",
            sprint_name="Sprint 10",
            sprint_state="active",
            sync_timestamp=timezone.now(),
        )
        run = SyncRun.objects.create(
            started_at=timezone.now() - timedelta(minutes=1),
            finished_at=timezone.now(),
            status=SyncRun.STATUS_SUCCESS,
            trigger="manual",
            triggered_by="tester",
            project_key="ABC",
            sprint_snapshots=1,
            epic_snapshots=2,
            dod_task_snapshots=3,
        )

        response = self.client.get("/api/sync/status")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["latest_run"]["id"], run.id)
        self.assertEqual(payload["latest_snapshot"]["id"], snapshot.id)
        self.assertEqual(payload["freshness"]["status"], "fresh")
        self.assertEqual(payload["freshness"]["is_stale"], False)

    @override_settings(SYNC_STALE_THRESHOLD_MINUTES=30)
    def test_sync_status_marks_snapshot_as_stale_when_threshold_exceeded(self):
        SprintSnapshot.objects.create(
            jira_sprint_id="100",
            sprint_name="Sprint 10",
            sprint_state="active",
            sync_timestamp=timezone.now() - timedelta(minutes=31),
        )

        with self.assertLogs("dod.audit", level="WARNING") as captured:
            response = self.client.get("/api/sync/status")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["freshness"]["status"], "stale")
        self.assertEqual(payload["freshness"]["is_stale"], True)
        self.assertEqual(payload["freshness"]["stale_threshold_minutes"], 30)
        self.assertGreater(payload["freshness"]["age_seconds"], 0)
        self.assertIn("alert.sync.stale", "\n".join(captured.output))

    def test_sync_status_returns_missing_freshness_when_no_snapshot_exists(self):
        response = self.client.get("/api/sync/status")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["freshness"]["status"], "missing")
        self.assertEqual(payload["freshness"]["is_stale"], True)
        self.assertIsNone(payload["freshness"]["age_seconds"])

    @patch("jira_sync.views.execute_sync")
    def test_sync_run_endpoint_triggers_manual_sync(self, execute_sync_mock: Mock):
        run = SyncRun.objects.create(
            started_at=timezone.now(),
            finished_at=timezone.now(),
            status=SyncRun.STATUS_SUCCESS,
            trigger="manual",
            triggered_by="test_actor",
            project_key="ABC",
            sprint_snapshots=1,
            epic_snapshots=2,
            dod_task_snapshots=3,
        )
        execute_sync_mock.return_value = run

        with self.assertLogs("dod.audit", level="INFO") as captured:
            response = self.client.post(
                "/api/sync/run",
                data={"project_key": "ABC"},
                content_type="application/json",
                HTTP_X_ACTOR="test_actor",
                HTTP_X_REQUEST_ID="sync-req-1",
            )

        self.assertEqual(response.status_code, 200)
        execute_sync_mock.assert_called_once_with(
            project_key="ABC",
            trigger="manual",
            triggered_by="test_actor",
        )
        self.assertEqual(response.json()["run"]["id"], run.id)
        log_output = "\n".join(captured.output)
        self.assertIn("sync.run.requested", log_output)
        self.assertIn("sync.run.succeeded", log_output)
        self.assertIn("sync-req-1", log_output)

    @patch("jira_sync.views.execute_sync")
    def test_sync_run_returns_400_for_configuration_error(self, execute_sync_mock: Mock):
        execute_sync_mock.side_effect = JiraConfigurationError("missing env")

        with self.assertLogs("dod.audit", level="WARNING") as captured:
            response = self.client.post(
                "/api/sync/run",
                data={"project_key": "ABC"},
                content_type="application/json",
            )

        self.assertEqual(response.status_code, 400)
        self.assertIn("missing env", response.json()["detail"])
        self.assertIn("sync.run.failed", "\n".join(captured.output))

    @patch("jira_sync.views.execute_sync")
    def test_sync_run_returns_500_for_runtime_errors(self, execute_sync_mock: Mock):
        execute_sync_mock.side_effect = RuntimeError("jira timeout")

        with self.assertLogs("dod.audit", level="ERROR") as captured:
            response = self.client.post(
                "/api/sync/run",
                data={"project_key": "ABC"},
                content_type="application/json",
            )

        self.assertEqual(response.status_code, 500)
        self.assertIn("jira timeout", response.json()["detail"])
        self.assertIn("sync.run.failed", "\n".join(captured.output))

    @patch("jira_sync.views.execute_sync")
    def test_sync_run_uses_default_project_key_when_payload_omits_it(self, execute_sync_mock: Mock):
        run = SyncRun.objects.create(
            started_at=timezone.now(),
            finished_at=timezone.now(),
            status=SyncRun.STATUS_SUCCESS,
            trigger="manual",
            triggered_by="test_actor",
            project_key="CS0100",
            sprint_snapshots=1,
            epic_snapshots=2,
            dod_task_snapshots=3,
        )
        execute_sync_mock.return_value = run

        response = self.client.post(
            "/api/sync/run",
            data={},
            content_type="application/json",
            HTTP_X_ACTOR="test_actor",
        )

        self.assertEqual(response.status_code, 200)
        execute_sync_mock.assert_called_once_with(
            project_key="CS0100",
            trigger="manual",
            triggered_by="test_actor",
        )


@override_settings(ENABLE_ROLE_AUTH=True)
class SyncApiAuthorizationTests(TestCase):
    def setUp(self):
        Group.objects.get_or_create(name=GROUP_ADMIN)
        Group.objects.get_or_create(name=GROUP_SCRUM_MASTER)
        Group.objects.get_or_create(name=GROUP_VIEWER)

        self.admin_user = User.objects.create_user(username="admin_sync", password="password123")
        self.admin_user.groups.add(Group.objects.get(name=GROUP_ADMIN))

        self.scrum_user = User.objects.create_user(username="scrum_sync", password="password123")
        self.scrum_user.groups.add(Group.objects.get(name=GROUP_SCRUM_MASTER))

        self.viewer_user = User.objects.create_user(username="viewer_sync", password="password123")
        self.viewer_user.groups.add(Group.objects.get(name=GROUP_VIEWER))

    def test_sync_status_requires_authentication(self):
        response = self.client.get("/api/sync/status")
        self.assertEqual(response.status_code, 401)

    def test_sync_status_allows_viewer(self):
        self.client.force_login(self.viewer_user)
        response = self.client.get("/api/sync/status")
        self.assertEqual(response.status_code, 200)

    @patch("jira_sync.views.execute_sync")
    def test_sync_run_rejects_non_admin(self, execute_sync_mock: Mock):
        self.client.force_login(self.scrum_user)

        with self.assertLogs("dod.audit", level="WARNING") as captured:
            response = self.client.post(
                "/api/sync/run",
                data={"project_key": "ABC"},
                content_type="application/json",
            )

        self.assertEqual(response.status_code, 403)
        execute_sync_mock.assert_not_called()
        self.assertIn("sync.run.rejected", "\n".join(captured.output))

    @patch("jira_sync.views.execute_sync")
    def test_sync_run_allows_admin(self, execute_sync_mock: Mock):
        run = SyncRun.objects.create(
            started_at=timezone.now(),
            finished_at=timezone.now(),
            status=SyncRun.STATUS_SUCCESS,
            trigger="manual",
            triggered_by="admin_sync",
            project_key="ABC",
            sprint_snapshots=1,
            epic_snapshots=2,
            dod_task_snapshots=3,
        )
        execute_sync_mock.return_value = run
        self.client.force_login(self.admin_user)

        response = self.client.post(
            "/api/sync/run",
            data={"project_key": "ABC"},
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        execute_sync_mock.assert_called_once_with(
            project_key="ABC",
            trigger="manual",
            triggered_by="admin_sync",
        )
