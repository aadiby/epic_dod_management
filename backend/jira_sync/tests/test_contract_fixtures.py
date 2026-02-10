import json
from pathlib import Path
from types import SimpleNamespace

from django.test import TestCase

from compliance.models import DoDTaskSnapshot, EpicSnapshot, SprintSnapshot
from jira_sync.service import JiraSnapshotSyncService

FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"


def to_namespace(value):
    if isinstance(value, dict):
        return SimpleNamespace(**{key: to_namespace(item) for key, item in value.items()})
    if isinstance(value, list):
        return [to_namespace(item) for item in value]
    return value


class FixtureBackedAdapter:
    def __init__(self):
        self.config = SimpleNamespace(base_url="https://example.atlassian.net")
        with (FIXTURES_DIR / "active_sprint_issues.json").open(encoding="utf-8") as handle:
            issues_payload = json.load(handle)
        with (FIXTURES_DIR / "remote_links.json").open(encoding="utf-8") as handle:
            self.remote_links_payload = json.load(handle)

        self.issues = []
        for payload in issues_payload:
            issue = SimpleNamespace(
                id=str(payload["id"]),
                key=payload["key"],
                fields=to_namespace(payload["fields"]),
            )
            self.issues.append(issue)

        self.by_key = {issue.key: issue for issue in self.issues}

    def search_active_sprint_issues(self, project_key=None, max_results=200):
        del project_key
        del max_results
        return list(self.issues)

    def get_issue(self, issue_key: str):
        return self.by_key[issue_key]

    def get_issue_remote_links(self, issue_key: str):
        return [to_namespace(item) for item in self.remote_links_payload.get(issue_key, [])]


class JiraContractFixtureTests(TestCase):
    def test_saved_jira_payload_fixture_parses_into_expected_snapshots(self):
        service = JiraSnapshotSyncService(FixtureBackedAdapter())

        summary = service.sync_active_sprint(project_key="ABC")

        self.assertEqual(summary.sprint_snapshots, 1)
        self.assertEqual(summary.epic_snapshots, 1)
        self.assertEqual(summary.dod_task_snapshots, 2)

        sprint = SprintSnapshot.objects.get()
        self.assertEqual(sprint.jira_sprint_id, "42")
        self.assertIn("ABC-501", sprint.issue_versions)

        epic = EpicSnapshot.objects.get()
        self.assertEqual(epic.jira_key, "ABC-500")
        self.assertFalse(epic.missing_squad_labels)
        self.assertEqual(list(epic.teams.values_list("key", flat=True)), ["squad_platform"])

        dod_tasks = {item.jira_key: item for item in DoDTaskSnapshot.objects.all()}
        self.assertEqual(dod_tasks["ABC-501"].category, "threat_modelling_done")
        self.assertTrue(dod_tasks["ABC-501"].has_evidence_link)
        self.assertEqual(
            dod_tasks["ABC-501"].evidence_link,
            "https://wiki.example.internal/threat-model/ABC-500",
        )
        self.assertEqual(dod_tasks["ABC-502"].non_compliance_reason, "task_not_done,missing_evidence_link")
