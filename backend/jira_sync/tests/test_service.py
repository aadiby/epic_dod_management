from types import SimpleNamespace
from unittest.mock import patch

from django.test import TestCase

from compliance.models import DoDTaskSnapshot, EpicSnapshot, SprintSnapshot
from jira_sync.service import JiraSnapshotSyncService


class FakeAdapter:
    def __init__(self):
        self.config = SimpleNamespace(base_url="https://example.atlassian.net")
        self.dod_updated = "2026-02-10T10:00:00.000+0000"
        self.dod_labels = ["squad_platform"]
        self.epic_labels = ["squad_platform"]
        self.regular_labels = ["squad_platform"]
        self.last_search_args = None

    def search_active_sprint_issues(self, project_key=None, max_results=200):
        self.last_search_args = {
            "project_key": project_key,
            "max_results": max_results,
        }
        return [
            self._epic_issue(),
            self._dod_issue(),
            self._regular_issue(),
        ]

    def get_issue(self, issue_key: str):
        if issue_key == "ABC-100":
            return self._epic_issue()
        raise ValueError("unknown issue")

    def get_issue_remote_links(self, issue_key: str):
        if issue_key == "ABC-101":
            return [SimpleNamespace(object=SimpleNamespace(url="https://wiki/page"))]
        return []

    def _epic_issue(self):
        return SimpleNamespace(
            id="100",
            key="ABC-100",
            fields=SimpleNamespace(
                summary="Platform hardening",
                issuetype=SimpleNamespace(name="Epic"),
                status=SimpleNamespace(name="In Progress", statusCategory=SimpleNamespace(key="indeterminate")),
                resolution=None,
                labels=self.epic_labels,
                updated="2026-02-10T09:00:00.000+0000",
                sprint={"id": 10, "name": "Sprint 10", "state": "active"},
            ),
        )

    def _dod_issue(self):
        return SimpleNamespace(
            id="101",
            key="ABC-101",
            fields=SimpleNamespace(
                summary="DoD - Automated tests",
                issuetype=SimpleNamespace(name="Task"),
                parent=SimpleNamespace(
                    key="ABC-100",
                    fields=SimpleNamespace(issuetype=SimpleNamespace(name="Epic")),
                ),
                status=SimpleNamespace(name="Done", statusCategory=SimpleNamespace(key="done")),
                resolution=SimpleNamespace(name="Done"),
                labels=self.dod_labels,
                updated=self.dod_updated,
                sprint={"id": 10, "name": "Sprint 10", "state": "active"},
            ),
        )

    def _regular_issue(self):
        return SimpleNamespace(
            id="102",
            key="ABC-102",
            fields=SimpleNamespace(
                summary="Regular implementation task",
                issuetype=SimpleNamespace(name="Task"),
                parent=SimpleNamespace(
                    key="ABC-100",
                    fields=SimpleNamespace(issuetype=SimpleNamespace(name="Epic")),
                ),
                status=SimpleNamespace(name="In Progress", statusCategory=SimpleNamespace(key="indeterminate")),
                resolution=None,
                labels=self.regular_labels,
                updated="2026-02-10T09:15:00.000+0000",
                sprint={"id": 10, "name": "Sprint 10", "state": "active"},
            ),
        )


class JiraSnapshotSyncServiceTests(TestCase):
    def test_sync_creates_sprint_epic_and_dod_task_snapshots(self):
        service = JiraSnapshotSyncService(FakeAdapter())

        summary = service.sync_active_sprint(project_key="ABC")

        self.assertEqual(summary.sprint_snapshots, 1)
        self.assertEqual(summary.epic_snapshots, 1)
        self.assertEqual(summary.dod_task_snapshots, 1)

        self.assertEqual(SprintSnapshot.objects.count(), 1)
        self.assertEqual(EpicSnapshot.objects.count(), 1)
        self.assertEqual(DoDTaskSnapshot.objects.count(), 1)

        dod_task = DoDTaskSnapshot.objects.get()
        self.assertEqual(dod_task.category, "automated_tests")
        self.assertTrue(dod_task.is_done)
        self.assertTrue(dod_task.has_evidence_link)
        self.assertEqual(dod_task.non_compliance_reason, "")
        self.assertEqual(dod_task.jira_url, "https://example.atlassian.net/browse/ABC-101")

    def test_sync_returns_zero_when_no_issues(self):
        class EmptyAdapter(FakeAdapter):
            def search_active_sprint_issues(self, project_key=None, max_results=200):
                del project_key
                del max_results
                return []

        service = JiraSnapshotSyncService(EmptyAdapter())

        summary = service.sync_active_sprint()

        self.assertEqual(summary.sprint_snapshots, 0)
        self.assertEqual(summary.epic_snapshots, 0)
        self.assertEqual(summary.dod_task_snapshots, 0)

    def test_sync_uses_env_override_for_max_results(self):
        adapter = FakeAdapter()
        service = JiraSnapshotSyncService(adapter)

        with patch.dict("os.environ", {"JIRA_SYNC_MAX_RESULTS": "500"}, clear=False):
            service.sync_active_sprint(project_key="ABC")

        self.assertEqual(adapter.last_search_args, {"project_key": "ABC", "max_results": 500})

    def test_sync_marks_dod_task_with_combined_non_compliance_reasons(self):
        class IncompleteDoDAdapter(FakeAdapter):
            def get_issue_remote_links(self, issue_key: str):
                return []

            def _dod_issue(self):
                issue = super()._dod_issue()
                issue.fields.status = SimpleNamespace(
                    name="In Progress",
                    statusCategory=SimpleNamespace(key="indeterminate"),
                )
                issue.fields.resolution = None
                return issue

        service = JiraSnapshotSyncService(IncompleteDoDAdapter())

        service.sync_active_sprint(project_key="ABC")

        dod_task = DoDTaskSnapshot.objects.get()
        self.assertFalse(dod_task.is_done)
        self.assertFalse(dod_task.has_evidence_link)
        self.assertEqual(dod_task.non_compliance_reason, "task_not_done,missing_evidence_link")

    def test_sync_is_idempotent_when_issue_versions_are_unchanged(self):
        adapter = FakeAdapter()
        service = JiraSnapshotSyncService(adapter)

        first = service.sync_active_sprint(project_key="ABC")
        second = service.sync_active_sprint(project_key="ABC")

        self.assertEqual(first.sprint_snapshots, 1)
        self.assertEqual(second.sprint_snapshots, 0)
        self.assertEqual(SprintSnapshot.objects.count(), 1)
        self.assertEqual(EpicSnapshot.objects.count(), 1)
        self.assertEqual(DoDTaskSnapshot.objects.count(), 1)

    def test_sync_creates_new_snapshot_when_issue_version_changes(self):
        adapter = FakeAdapter()
        service = JiraSnapshotSyncService(adapter)
        service.sync_active_sprint(project_key="ABC")

        adapter.dod_updated = "2026-02-10T11:30:00.000+0000"
        second = service.sync_active_sprint(project_key="ABC")

        self.assertEqual(second.sprint_snapshots, 1)
        self.assertEqual(SprintSnapshot.objects.count(), 2)

    def test_sync_flags_missing_squad_labels(self):
        adapter = FakeAdapter()
        adapter.epic_labels = []
        adapter.dod_labels = []
        adapter.regular_labels = []
        service = JiraSnapshotSyncService(adapter)

        service.sync_active_sprint(project_key="ABC")

        epic = EpicSnapshot.objects.get()
        self.assertTrue(epic.missing_squad_labels)
        self.assertEqual(epic.squad_label_warnings, [])
        self.assertEqual(list(epic.teams.values_list("key", flat=True)), [])

    def test_sync_flags_malformed_squad_labels(self):
        adapter = FakeAdapter()
        adapter.dod_labels = ["squad", "SQUAD_", "squad mobile"]
        service = JiraSnapshotSyncService(adapter)

        service.sync_active_sprint(project_key="ABC")

        epic = EpicSnapshot.objects.get()
        self.assertFalse(epic.missing_squad_labels)
        self.assertEqual(
            epic.squad_label_warnings,
            ["SQUAD_", "squad", "squad mobile"],
        )

    def test_sync_accepts_suffix_squad_labels(self):
        adapter = FakeAdapter()
        adapter.dod_labels = ["Echo_Squad"]
        adapter.epic_labels = []
        adapter.regular_labels = []
        service = JiraSnapshotSyncService(adapter)

        service.sync_active_sprint(project_key="ABC")

        epic = EpicSnapshot.objects.get()
        self.assertFalse(epic.missing_squad_labels)
        self.assertEqual(epic.squad_label_warnings, [])
        self.assertEqual(list(epic.teams.values_list("key", flat=True)), ["squad_echo"])
