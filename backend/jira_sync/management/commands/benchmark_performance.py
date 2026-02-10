from __future__ import annotations

import json
import math
import time
from dataclasses import dataclass
from types import SimpleNamespace

from django.conf import settings
from django.contrib.auth.models import Group
from django.core.management.base import BaseCommand, CommandError
from django.test import Client
from django.utils import timezone

from compliance.authz import GROUP_ADMIN
from compliance.models import DoDTaskSnapshot, EpicSnapshot, SprintSnapshot, Team
from jira_sync.service import JiraSnapshotSyncService, SyncSummary


def percentile(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    sorted_values = sorted(values)
    k = (len(sorted_values) - 1) * (p / 100.0)
    floor = math.floor(k)
    ceil = math.ceil(k)
    if floor == ceil:
        return sorted_values[int(k)]
    return sorted_values[floor] + (sorted_values[ceil] - sorted_values[floor]) * (k - floor)


@dataclass
class SyncBenchmarkResult:
    elapsed_seconds: float
    summary: SyncSummary


class SyntheticJiraAdapter:
    def __init__(self, epics: int, dod_tasks_per_epic: int):
        self.config = SimpleNamespace(base_url="https://example.atlassian.net")
        self._issues = []
        self._epics_by_key: dict[str, SimpleNamespace] = {}
        self._remote_links: dict[str, list[SimpleNamespace]] = {}

        sprint = {"id": 9001, "name": "Performance Sprint", "state": "active"}
        for epic_index in range(epics):
            epic_key = f"PERF-{epic_index + 1}"
            team_label = "squad_platform" if epic_index % 2 == 0 else "squad_mobile"
            epic_issue = SimpleNamespace(
                id=f"epic-{epic_index + 1}",
                key=epic_key,
                fields=SimpleNamespace(
                    summary=f"Performance epic {epic_index + 1}",
                    issuetype=SimpleNamespace(name="Epic"),
                    status=SimpleNamespace(name="In Progress", statusCategory=SimpleNamespace(key="indeterminate")),
                    resolution=None,
                    labels=[team_label],
                    sprint=sprint,
                ),
            )
            self._issues.append(epic_issue)
            self._epics_by_key[epic_key] = epic_issue

            for task_index in range(dod_tasks_per_epic):
                task_key = f"PERF-{(epic_index + 1) * 1000 + task_index + 1}"
                task_issue = SimpleNamespace(
                    id=f"task-{epic_index + 1}-{task_index + 1}",
                    key=task_key,
                    fields=SimpleNamespace(
                        summary=f"DoD - Automated tests {epic_index + 1}-{task_index + 1}",
                        issuetype=SimpleNamespace(name="Task"),
                        parent=SimpleNamespace(
                            key=epic_key,
                            fields=SimpleNamespace(issuetype=SimpleNamespace(name="Epic")),
                        ),
                        status=SimpleNamespace(name="Done", statusCategory=SimpleNamespace(key="done")),
                        resolution=SimpleNamespace(name="Done"),
                        labels=[team_label],
                        sprint=sprint,
                    ),
                )
                self._issues.append(task_issue)
                self._remote_links[task_key] = [
                    SimpleNamespace(object=SimpleNamespace(url=f"https://example.test/evidence/{task_key}"))
                ]

    def search_active_sprint_issues(self, project_key=None, max_results=200):
        del project_key
        del max_results
        return list(self._issues)

    def get_issue(self, issue_key: str):
        return self._epics_by_key[issue_key]

    def get_issue_remote_links(self, issue_key: str):
        return self._remote_links.get(issue_key, [])


class Command(BaseCommand):
    help = "Benchmark dashboard metrics latency and sync runtime against baseline thresholds."

    def add_arguments(self, parser):
        parser.add_argument("--api-iterations", type=int, default=50)
        parser.add_argument("--epics", type=int, default=120)
        parser.add_argument("--dod-tasks-per-epic", type=int, default=3)
        parser.add_argument("--metrics-target-ms", type=float, default=500.0)
        parser.add_argument("--sync-target-seconds", type=float, default=120.0)
        parser.add_argument("--fail-on-threshold", action="store_true")

    def handle(self, *args, **options):
        api_iterations = max(int(options["api_iterations"]), 1)
        epics = max(int(options["epics"]), 1)
        dod_tasks_per_epic = max(int(options["dod_tasks_per_epic"]), 1)
        metrics_target_ms = float(options["metrics_target_ms"])
        sync_target_seconds = float(options["sync_target_seconds"])
        fail_on_threshold = bool(options["fail_on_threshold"])

        sprint_snapshot = self._seed_metrics_data(epics=epics, dod_tasks_per_epic=dod_tasks_per_epic)
        try:
            api_durations_ms = self._benchmark_metrics_api(
                sprint_snapshot_id=sprint_snapshot.id,
                iterations=api_iterations,
            )
        finally:
            SprintSnapshot.objects.filter(id=sprint_snapshot.id).delete()

        sync_result = self._benchmark_sync(epics=epics, dod_tasks_per_epic=dod_tasks_per_epic)

        metrics_p95_ms = round(percentile(api_durations_ms, 95), 2)
        metrics_p50_ms = round(percentile(api_durations_ms, 50), 2)
        metrics_max_ms = round(max(api_durations_ms), 2)
        sync_elapsed_seconds = round(sync_result.elapsed_seconds, 3)

        report = {
            "api_iterations": api_iterations,
            "dataset": {
                "epics": epics,
                "dod_tasks_per_epic": dod_tasks_per_epic,
            },
            "targets": {
                "metrics_p95_ms": metrics_target_ms,
                "sync_sla_seconds": sync_target_seconds,
            },
            "results": {
                "metrics_p50_ms": metrics_p50_ms,
                "metrics_p95_ms": metrics_p95_ms,
                "metrics_max_ms": metrics_max_ms,
                "sync_elapsed_seconds": sync_elapsed_seconds,
                "sync_summary": {
                    "sprint_snapshots": sync_result.summary.sprint_snapshots,
                    "epic_snapshots": sync_result.summary.epic_snapshots,
                    "dod_task_snapshots": sync_result.summary.dod_task_snapshots,
                },
            },
            "passes": {
                "metrics_p95": metrics_p95_ms <= metrics_target_ms,
                "sync_sla": sync_elapsed_seconds <= sync_target_seconds,
            },
        }

        self.stdout.write(json.dumps(report, indent=2, sort_keys=True))

        if fail_on_threshold and (not report["passes"]["metrics_p95"] or not report["passes"]["sync_sla"]):
            raise CommandError("Performance baseline thresholds were not met.")

    def _seed_metrics_data(self, *, epics: int, dod_tasks_per_epic: int) -> SprintSnapshot:
        now = timezone.now()
        sprint_snapshot = SprintSnapshot.objects.create(
            jira_sprint_id=f"perf-{int(now.timestamp())}",
            sprint_name="Performance Baseline Sprint",
            sprint_state="active",
            sync_timestamp=now,
        )
        teams = {
            "squad_platform": Team.objects.get_or_create(
                key="squad_platform",
                defaults={"display_name": "Platform"},
            )[0],
            "squad_mobile": Team.objects.get_or_create(
                key="squad_mobile",
                defaults={"display_name": "Mobile"},
            )[0],
        }

        for epic_index in range(epics):
            team_key = "squad_platform" if epic_index % 2 == 0 else "squad_mobile"
            epic = EpicSnapshot.objects.create(
                sprint_snapshot=sprint_snapshot,
                jira_issue_id=f"perf-epic-{epic_index + 1}",
                jira_key=f"PERF-{epic_index + 1}",
                summary=f"Performance epic {epic_index + 1}",
                status_name="In Progress",
                resolution_name="",
                is_done=False,
                jira_url=f"https://example.atlassian.net/browse/PERF-{epic_index + 1}",
            )
            epic.teams.add(teams[team_key])

            for task_index in range(dod_tasks_per_epic):
                is_non_compliant = epic_index % 5 == 0 and task_index == 0
                DoDTaskSnapshot.objects.create(
                    epic_snapshot=epic,
                    jira_issue_id=f"perf-task-{epic_index + 1}-{task_index + 1}",
                    jira_key=f"PERF-{(epic_index + 1) * 1000 + task_index + 1}",
                    summary=f"DoD - Automated tests {epic_index + 1}-{task_index + 1}",
                    category="automated_tests",
                    status_name="Done",
                    resolution_name="Done",
                    is_done=True,
                    has_evidence_link=not is_non_compliant,
                    evidence_link=(
                        ""
                        if is_non_compliant
                        else f"https://example.test/cases/{epic_index + 1}-{task_index + 1}"
                    ),
                    non_compliance_reason="" if not is_non_compliant else "missing_evidence_link",
                )

        return sprint_snapshot

    def _benchmark_metrics_api(self, *, sprint_snapshot_id: int, iterations: int) -> list[float]:
        client = Client()
        if bool(getattr(settings, "ENABLE_ROLE_AUTH", False)):
            admin_group, _ = Group.objects.get_or_create(name=GROUP_ADMIN)
            from django.contrib.auth import get_user_model

            user_model = get_user_model()
            user = user_model.objects.create_user(
                username=f"perf_admin_{int(time.time())}",
                password="password123",
            )
            user.groups.add(admin_group)
            client.force_login(user)

        durations_ms: list[float] = []
        for _ in range(iterations):
            start = time.perf_counter()
            response = client.get(f"/api/metrics?sprint_snapshot_id={sprint_snapshot_id}")
            elapsed_ms = (time.perf_counter() - start) * 1000.0
            if response.status_code != 200:
                raise CommandError(f"Metrics endpoint returned {response.status_code}")
            durations_ms.append(elapsed_ms)
        return durations_ms

    def _benchmark_sync(self, *, epics: int, dod_tasks_per_epic: int) -> SyncBenchmarkResult:
        existing_snapshot_ids = set(SprintSnapshot.objects.values_list("id", flat=True))
        adapter = SyntheticJiraAdapter(epics=epics, dod_tasks_per_epic=dod_tasks_per_epic)
        service = JiraSnapshotSyncService(adapter)

        start = time.perf_counter()
        summary = service.sync_active_sprint(project_key="PERF")
        elapsed_seconds = time.perf_counter() - start

        SprintSnapshot.objects.exclude(id__in=existing_snapshot_ids).delete()
        return SyncBenchmarkResult(
            elapsed_seconds=elapsed_seconds,
            summary=summary,
        )
