from io import StringIO
import tempfile
from types import SimpleNamespace
from unittest.mock import Mock, patch

from django.core.management import CommandError, call_command
from django.test import SimpleTestCase

from jira_sync.adapter import JiraApiError, JiraConfigurationError


class SyncJiraSnapshotsCommandTests(SimpleTestCase):
    @patch("jira_sync.management.commands.sync_jira_snapshots.execute_sync")
    def test_command_raises_on_configuration_error(self, execute_sync_mock: Mock):
        execute_sync_mock.side_effect = JiraConfigurationError("missing env")

        with self.assertRaises(CommandError):
            call_command("sync_jira_snapshots")

    @patch("jira_sync.management.commands.sync_jira_snapshots.execute_sync")
    def test_command_runs_sync_and_writes_summary(
        self,
        execute_sync_mock: Mock,
    ):
        execute_sync_mock.return_value = SimpleNamespace(
            sprint_snapshots=1,
            epic_snapshots=2,
            dod_task_snapshots=3,
        )

        out = StringIO()
        call_command("sync_jira_snapshots", "--project-key", "ABC", stdout=out)

        execute_sync_mock.assert_called_once_with(
            project_key="ABC",
            trigger="cli",
            triggered_by="management_command",
        )
        output = out.getvalue()
        self.assertIn("sprint_snapshots=1", output)
        self.assertIn("epic_snapshots=2", output)
        self.assertIn("dod_task_snapshots=3", output)


class CaptureJiraPayloadsCommandTests(SimpleTestCase):
    @patch("jira_sync.management.commands.capture_jira_payloads.JiraClientAdapter.from_env")
    def test_capture_command_writes_payload_bundle(self, from_env_mock: Mock):
        issue_epic = SimpleNamespace(
            key="ABC-100",
            fields=SimpleNamespace(issuetype=SimpleNamespace(name="Epic")),
            raw={"id": "100", "key": "ABC-100"},
        )
        issue_task = SimpleNamespace(
            key="ABC-101",
            fields=SimpleNamespace(issuetype=SimpleNamespace(name="Task")),
            raw={"id": "101", "key": "ABC-101"},
        )
        adapter = Mock()
        adapter.search_active_sprint_issues.return_value = [issue_epic, issue_task]
        adapter.get_issue.return_value = issue_epic
        adapter.get_child_issues.return_value = [issue_task]
        adapter.get_issue_remote_links.return_value = [SimpleNamespace(raw={"id": "rl-1"})]
        from_env_mock.return_value = adapter

        with tempfile.TemporaryDirectory() as tmp_dir:
            out = StringIO()
            call_command(
                "capture_jira_payloads",
                "--project-key",
                "ABC",
                "--include-children",
                "--output-dir",
                tmp_dir,
                stdout=out,
            )
            output = out.getvalue()
            self.assertIn("Jira payload capture written to:", output)
            self.assertIn("issues=2", output)

            import json
            from pathlib import Path

            root = Path(tmp_dir)
            manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(manifest["issue_count"], 2)
            self.assertEqual(manifest["epic_count"], 1)

            active = json.loads((root / "active_sprint_issues.json").read_text(encoding="utf-8"))
            self.assertEqual(len(active), 2)
            self.assertEqual(active[0]["key"], "ABC-100")

            children = json.loads((root / "child_issues_by_epic.json").read_text(encoding="utf-8"))
            self.assertIn("ABC-100", children)

            errors = json.loads((root / "errors.json").read_text(encoding="utf-8"))
            self.assertEqual(errors, [])

    @patch("jira_sync.management.commands.capture_jira_payloads.JiraClientAdapter.from_env")
    def test_capture_command_raises_on_errors_by_default(self, from_env_mock: Mock):
        adapter = Mock()
        adapter.search_active_sprint_issues.side_effect = JiraApiError(
            operation="search_active_sprint_issues",
            detail="jira timeout",
            status_code=504,
        )
        adapter.get_issue.return_value = None
        adapter.get_child_issues.return_value = []
        adapter.get_issue_remote_links.return_value = []
        from_env_mock.return_value = adapter

        with tempfile.TemporaryDirectory() as tmp_dir:
            out = StringIO()
            with self.assertRaises(CommandError):
                call_command("capture_jira_payloads", "--output-dir", tmp_dir, stdout=out)
            output = out.getvalue()
            self.assertIn("errors=1", output)

            import json
            from pathlib import Path

            errors = json.loads((Path(tmp_dir) / "errors.json").read_text(encoding="utf-8"))
            self.assertEqual(errors[0]["operation"], "search_active_sprint_issues")
            self.assertEqual(errors[0]["status_code"], 504)

    @patch("jira_sync.management.commands.capture_jira_payloads.JiraClientAdapter.from_env")
    def test_capture_command_allows_partial_results_when_flag_set(self, from_env_mock: Mock):
        adapter = Mock()
        adapter.search_active_sprint_issues.side_effect = JiraApiError(
            operation="search_active_sprint_issues",
            detail="jira timeout",
            status_code=504,
        )
        adapter.get_issue.return_value = None
        adapter.get_child_issues.return_value = []
        adapter.get_issue_remote_links.return_value = []
        from_env_mock.return_value = adapter

        with tempfile.TemporaryDirectory() as tmp_dir:
            out = StringIO()
            call_command(
                "capture_jira_payloads",
                "--output-dir",
                tmp_dir,
                "--allow-partial",
                stdout=out,
            )
            output = out.getvalue()
            self.assertIn("errors=1", output)

    @patch("jira_sync.management.commands.capture_jira_payloads.JiraClientAdapter.from_env")
    def test_capture_command_can_fail_on_empty_without_errors(self, from_env_mock: Mock):
        adapter = Mock()
        adapter.search_active_sprint_issues.return_value = []
        adapter.get_issue.return_value = None
        adapter.get_child_issues.return_value = []
        adapter.get_issue_remote_links.return_value = []
        from_env_mock.return_value = adapter

        with tempfile.TemporaryDirectory() as tmp_dir:
            out = StringIO()
            with self.assertRaises(CommandError):
                call_command(
                    "capture_jira_payloads",
                    "--output-dir",
                    tmp_dir,
                    "--fail-on-empty",
                    stdout=out,
                )
            output = out.getvalue()
            self.assertIn("errors=0", output)
            self.assertIn("zero entities", output)
