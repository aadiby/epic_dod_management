import json
import os
from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth.models import Group, User
from django.core import mail
from django.db import IntegrityError, transaction
from django.test import TestCase, override_settings
from django.utils import timezone

from .authz import GROUP_ADMIN, GROUP_SCRUM_MASTER, GROUP_VIEWER
from .models import DoDTaskSnapshot, EpicSnapshot, NudgeLog, SprintSnapshot, Team


class ComplianceModelsTests(TestCase):
    def setUp(self):
        self.team = Team.objects.create(key="squad_platform", display_name="Platform")
        self.sprint = SprintSnapshot.objects.create(
            jira_sprint_id="123",
            sprint_name="Sprint 10",
            sprint_state="active",
            sync_timestamp=timezone.now(),
        )
        self.epic = EpicSnapshot.objects.create(
            sprint_snapshot=self.sprint,
            jira_issue_id="1001",
            jira_key="ABC-1",
            summary="Example epic",
            status_name="In Progress",
            resolution_name="",
            is_done=False,
        )
        self.epic.teams.add(self.team)

    def test_unique_epic_snapshot_per_sprint_issue(self):
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                EpicSnapshot.objects.create(
                    sprint_snapshot=self.sprint,
                    jira_issue_id="1001",
                    jira_key="ABC-2",
                    summary="Duplicate issue id in same sprint snapshot",
                    status_name="To Do",
                    resolution_name="",
                    is_done=False,
                )

    def test_unique_dod_task_snapshot_per_epic_issue(self):
        DoDTaskSnapshot.objects.create(
            epic_snapshot=self.epic,
            jira_issue_id="2001",
            jira_key="ABC-11",
            summary="DoD - Automated tests",
            category="automated_tests",
            status_name="Done",
            resolution_name="Done",
            is_done=True,
            has_evidence_link=True,
            evidence_link="https://example.test/cases/1",
        )

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                DoDTaskSnapshot.objects.create(
                    epic_snapshot=self.epic,
                    jira_issue_id="2001",
                    jira_key="ABC-12",
                    summary="DoD - Threat modelling done",
                    category="threat_modelling",
                    status_name="To Do",
                    resolution_name="",
                    is_done=False,
                    has_evidence_link=False,
                )

    def test_nudge_log_stores_recipient_emails(self):
        log = NudgeLog.objects.create(
            epic_snapshot=self.epic,
            team=self.team,
            triggered_by="scrummaster@example.com",
            recipient_emails=["team@example.com"],
            message_preview="Please close DoD tasks and add evidence links.",
        )

        self.assertEqual(log.recipient_emails, ["team@example.com"])

    def test_sprint_snapshot_ordering_newest_first(self):
        older = SprintSnapshot.objects.create(
            jira_sprint_id="122",
            sprint_name="Sprint 9",
            sprint_state="closed",
            sync_timestamp=timezone.now() - timedelta(hours=1),
        )

        newest_first = list(SprintSnapshot.objects.all())

        self.assertEqual(newest_first[0].id, self.sprint.id)
        self.assertEqual(newest_first[-1].id, older.id)


class ComplianceApiTests(TestCase):
    def setUp(self):
        self.team_platform = Team.objects.create(
            key="squad_platform",
            display_name="Platform",
        )
        self.team_mobile = Team.objects.create(
            key="squad_mobile",
            display_name="Mobile",
        )

        now = timezone.now()
        self.sprint_old = SprintSnapshot.objects.create(
            jira_sprint_id="99",
            sprint_name="Sprint 9",
            sprint_state="closed",
            sync_timestamp=now - timedelta(days=10),
        )
        self.sprint_current = SprintSnapshot.objects.create(
            jira_sprint_id="100",
            sprint_name="Sprint 10",
            sprint_state="active",
            sync_timestamp=now,
        )

        self.epic_compliant = EpicSnapshot.objects.create(
            sprint_snapshot=self.sprint_current,
            jira_issue_id="3001",
            jira_key="ABC-201",
            summary="Compliant epic",
            status_name="In Progress",
            resolution_name="",
            is_done=False,
            jira_url="https://example.atlassian.net/browse/ABC-201",
            missing_squad_labels=False,
            squad_label_warnings=[],
        )
        self.epic_compliant.teams.add(self.team_platform)
        DoDTaskSnapshot.objects.create(
            epic_snapshot=self.epic_compliant,
            jira_issue_id="4001",
            jira_key="ABC-211",
            summary="DoD - Automated tests",
            category="automated_tests",
            status_name="Done",
            resolution_name="Done",
            is_done=True,
            has_evidence_link=True,
            evidence_link="https://example.test/cases/1",
            non_compliance_reason="",
        )

        self.epic_non_compliant = EpicSnapshot.objects.create(
            sprint_snapshot=self.sprint_current,
            jira_issue_id="3002",
            jira_key="ABC-202",
            summary="Non compliant epic",
            status_name="In Progress",
            resolution_name="",
            is_done=False,
            jira_url="https://example.atlassian.net/browse/ABC-202",
            missing_squad_labels=True,
            squad_label_warnings=["squad"],
        )
        self.epic_non_compliant.teams.add(self.team_platform)
        DoDTaskSnapshot.objects.create(
            epic_snapshot=self.epic_non_compliant,
            jira_issue_id="4002",
            jira_key="ABC-212",
            summary="DoD - Automated tests",
            category="automated_tests",
            status_name="Done",
            resolution_name="Done",
            is_done=True,
            has_evidence_link=False,
            evidence_link="",
            non_compliance_reason="missing_evidence_link",
        )
        DoDTaskSnapshot.objects.create(
            epic_snapshot=self.epic_non_compliant,
            jira_issue_id="4003",
            jira_key="ABC-213",
            summary="DoD - Threat modelling done",
            category="threat_modelling_done",
            status_name="To Do",
            resolution_name="",
            is_done=False,
            has_evidence_link=True,
            evidence_link="https://example.test/threat-model/1",
            non_compliance_reason="task_not_done",
        )

        self.epic_no_dod = EpicSnapshot.objects.create(
            sprint_snapshot=self.sprint_current,
            jira_issue_id="3003",
            jira_key="ABC-203",
            summary="No dod epic",
            status_name="Done",
            resolution_name="Done",
            is_done=True,
            jira_url="https://example.atlassian.net/browse/ABC-203",
            missing_squad_labels=False,
            squad_label_warnings=[],
        )
        self.epic_no_dod.teams.add(self.team_mobile)

        # Old sprint data must be ignored when no explicit sprint filter is set.
        old_epic = EpicSnapshot.objects.create(
            sprint_snapshot=self.sprint_old,
            jira_issue_id="3010",
            jira_key="ABC-190",
            summary="Old sprint epic",
            status_name="Done",
            resolution_name="Done",
            is_done=True,
            jira_url="https://example.atlassian.net/browse/ABC-190",
            missing_squad_labels=False,
            squad_label_warnings=[],
        )
        old_epic.teams.add(self.team_platform)
        DoDTaskSnapshot.objects.create(
            epic_snapshot=old_epic,
            jira_issue_id="4010",
            jira_key="ABC-191",
            summary="DoD - Automated tests",
            category="automated_tests",
            status_name="Done",
            resolution_name="Done",
            is_done=True,
            has_evidence_link=True,
            evidence_link="https://example.test/old",
            non_compliance_reason="",
        )

    def test_metrics_endpoint_returns_summary_for_latest_sprint(self):
        response = self.client.get("/api/metrics")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["scope"]["sprint_snapshot_id"], self.sprint_current.id)
        self.assertEqual(payload["summary"]["total_epics"], 3)
        self.assertEqual(payload["summary"]["compliant_epics"], 1)
        self.assertEqual(payload["summary"]["non_compliant_epics"], 2)
        self.assertEqual(payload["summary"]["compliance_percentage"], 33.33)
        self.assertEqual(payload["summary"]["epics_with_missing_squad_labels"], 1)
        self.assertEqual(payload["summary"]["epics_with_invalid_squad_labels"], 1)

    def test_metrics_endpoint_supports_squad_filter(self):
        response = self.client.get("/api/metrics?squad=squad_platform")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["summary"]["total_epics"], 2)
        self.assertEqual(payload["summary"]["compliant_epics"], 1)
        self.assertEqual(payload["summary"]["non_compliant_epics"], 1)

    def test_metrics_endpoint_supports_category_filter(self):
        response = self.client.get("/api/metrics?category=automated_tests")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["summary"]["total_epics"], 2)
        self.assertEqual(payload["summary"]["compliant_epics"], 1)
        self.assertEqual(payload["summary"]["non_compliant_epics"], 1)

        by_category = payload["by_category"]
        self.assertEqual(len(by_category), 1)
        self.assertEqual(by_category[0]["category"], "automated_tests")
        self.assertEqual(by_category[0]["compliance_percentage"], 50.0)

    def test_metrics_endpoint_supports_epic_status_filter(self):
        response = self.client.get("/api/metrics?epic_status=done")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["summary"]["total_epics"], 1)
        self.assertEqual(payload["summary"]["compliant_epics"], 0)
        self.assertEqual(payload["summary"]["non_compliant_epics"], 1)

    def test_metrics_endpoint_includes_team_breakdown(self):
        response = self.client.get("/api/metrics")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        by_team = {item["team"]: item for item in payload["by_team"]}

        self.assertEqual(by_team["squad_platform"]["total_epics"], 2)
        self.assertEqual(by_team["squad_platform"]["compliant_epics"], 1)
        self.assertEqual(by_team["squad_mobile"]["total_epics"], 1)
        self.assertEqual(by_team["squad_mobile"]["non_compliant_epics"], 1)

    def test_metrics_endpoint_sorts_teams_by_compliance_rank(self):
        response = self.client.get("/api/metrics")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        by_team = payload["by_team"]
        self.assertEqual(by_team[0]["team"], "squad_platform")
        self.assertEqual(by_team[0]["rank"], 1)
        self.assertEqual(by_team[1]["team"], "squad_mobile")
        self.assertEqual(by_team[1]["rank"], 2)

    def test_non_compliant_epics_endpoint_returns_failures(self):
        response = self.client.get("/api/epics/non-compliant")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["count"], 2)
        keys = [epic["jira_key"] for epic in payload["epics"]]
        self.assertEqual(keys, ["ABC-202", "ABC-203"])

        epic_without_dod = next(epic for epic in payload["epics"] if epic["jira_key"] == "ABC-203")
        self.assertEqual(epic_without_dod["compliance_reasons"], ["no_dod_tasks"])
        self.assertEqual(epic_without_dod["failing_dod_tasks"], [])
        self.assertIn("nudge", epic_without_dod)
        self.assertEqual(epic_without_dod["nudge"]["cooldown_active"], False)

        epic_with_squad_flags = next(epic for epic in payload["epics"] if epic["jira_key"] == "ABC-202")
        self.assertTrue(epic_with_squad_flags["missing_squad_labels"])
        self.assertEqual(epic_with_squad_flags["squad_label_warnings"], ["squad"])
        self.assertIn("jira_url", epic_with_squad_flags["failing_dod_tasks"][0])

    def test_non_compliant_epics_endpoint_supports_category_filter(self):
        response = self.client.get("/api/epics/non-compliant?category=threat_modelling_done")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["count"], 1)
        self.assertEqual(payload["epics"][0]["jira_key"], "ABC-202")

    def test_non_compliant_epics_endpoint_supports_squad_filter(self):
        response = self.client.get("/api/epics/non-compliant?squad=squad_mobile")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["count"], 1)
        self.assertEqual(payload["epics"][0]["jira_key"], "ABC-203")

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_nudge_endpoint_sends_email_and_creates_log(self):
        with self.assertLogs("dod.audit", level="INFO") as captured:
            response = self.client.post(
                f"/api/epics/{self.epic_non_compliant.jira_key}/nudge",
                data=json.dumps({"recipients": ["team@example.com"]}),
                content_type="application/json",
                HTTP_X_REQUEST_ID="nudge-req-1",
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["detail"], "Nudge email sent.")
        self.assertEqual(payload["epic_key"], self.epic_non_compliant.jira_key)
        self.assertEqual(payload["recipients"], ["team@example.com"])
        self.assertTrue(payload["nudge"]["cooldown_active"])
        log_output = "\n".join(captured.output)
        self.assertIn("nudge.sent", log_output)
        self.assertIn("nudge-req-1", log_output)

        self.assertEqual(len(mail.outbox), 1)
        self.assertIn(self.epic_non_compliant.jira_key, mail.outbox[0].subject)
        self.assertIn("ABC-212", mail.outbox[0].body)

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_nudge_endpoint_enforces_cooldown(self):
        endpoint = f"/api/epics/{self.epic_non_compliant.jira_key}/nudge"
        first = self.client.post(
            endpoint,
            data=json.dumps({"recipients": ["team@example.com"]}),
            content_type="application/json",
        )
        self.assertEqual(first.status_code, 200)

        second = self.client.post(
            endpoint,
            data=json.dumps({"recipients": ["team@example.com"]}),
            content_type="application/json",
        )
        self.assertEqual(second.status_code, 429)
        self.assertEqual(second.json()["detail"], "Nudge cooldown is active for this epic.")

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_nudge_endpoint_rejects_compliant_epic(self):
        response = self.client.post(
            f"/api/epics/{self.epic_compliant.jira_key}/nudge",
            data=json.dumps({"recipients": ["team@example.com"]}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.json()["detail"],
            "Epic is currently compliant; nudge is not required.",
        )

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_nudge_endpoint_uses_default_recipient_env(self):
        with patch.dict(os.environ, {"NUDGE_DEFAULT_RECIPIENTS": "fallback@example.com"}):
            response = self.client.post(
                f"/api/epics/{self.epic_non_compliant.jira_key}/nudge",
                data=json.dumps({}),
                content_type="application/json",
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["recipients"], ["fallback@example.com"])

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_nudge_endpoint_uses_team_configured_recipients(self):
        self.team_platform.notification_emails = ["platform@example.com"]
        self.team_platform.save(update_fields=["notification_emails"])

        with patch.dict(os.environ, {"NUDGE_DEFAULT_RECIPIENTS": "fallback@example.com"}):
            response = self.client.post(
                f"/api/epics/{self.epic_non_compliant.jira_key}/nudge",
                data=json.dumps({}),
                content_type="application/json",
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["recipients"], ["platform@example.com"])

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_nudge_history_endpoint_returns_sent_nudges(self):
        send_response = self.client.post(
            f"/api/epics/{self.epic_non_compliant.jira_key}/nudge",
            data=json.dumps({"recipients": ["team@example.com"]}),
            content_type="application/json",
        )
        self.assertEqual(send_response.status_code, 200)

        history_response = self.client.get("/api/nudges/history")
        self.assertEqual(history_response.status_code, 200)
        payload = history_response.json()
        self.assertEqual(payload["count"], 1)
        self.assertEqual(payload["nudges"][0]["epic_key"], self.epic_non_compliant.jira_key)
        self.assertEqual(payload["nudges"][0]["recipient_emails"], ["team@example.com"])

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_nudge_history_endpoint_supports_squad_filter(self):
        self.client.post(
            f"/api/epics/{self.epic_non_compliant.jira_key}/nudge",
            data=json.dumps({"recipients": ["team@example.com"]}),
            content_type="application/json",
        )

        # create second sprint nudge for mobile to verify filter behavior
        self.client.post(
            f"/api/epics/{self.epic_no_dod.jira_key}/nudge",
            data=json.dumps({"recipients": ["mobile@example.com"]}),
            content_type="application/json",
        )

        response = self.client.get("/api/nudges/history?squad=squad_mobile")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["count"], 1)
        self.assertEqual(payload["nudges"][0]["epic_key"], self.epic_no_dod.jira_key)


class TeamApiTests(TestCase):
    def setUp(self):
        self.scrum_user = User.objects.create_user(
            username="scrum_platform",
            password="password123",
        )
        self.extra_user = User.objects.create_user(
            username="scrum_backup",
            password="password123",
        )
        self.team_platform = Team.objects.create(
            key="squad_platform",
            display_name="Platform",
            notification_emails=["one@example.com"],
        )
        self.team_platform.scrum_masters.add(self.scrum_user)
        Team.objects.create(
            key="squad_mobile",
            display_name="Mobile",
            notification_emails=[],
        )

    def test_teams_endpoint_returns_team_configs(self):
        response = self.client.get("/api/teams")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["count"], 2)
        teams = {team["key"]: team for team in payload["teams"]}
        self.assertEqual(teams["squad_platform"]["notification_emails"], ["one@example.com"])
        self.assertEqual(teams["squad_platform"]["scrum_masters"], ["scrum_platform"])

    def test_team_recipients_endpoint_updates_recipients(self):
        response = self.client.post(
            f"/api/teams/{self.team_platform.key}/recipients",
            data=json.dumps({"recipients": ["alpha@example.com", "beta@example.com"]}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        self.team_platform.refresh_from_db()
        self.assertEqual(
            self.team_platform.notification_emails,
            ["alpha@example.com", "beta@example.com"],
        )

    def test_team_recipients_endpoint_rejects_non_list_payload(self):
        response = self.client.post(
            f"/api/teams/{self.team_platform.key}/recipients",
            data=json.dumps({"recipients": "invalid"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)

    def test_team_scrum_masters_endpoint_updates_assignments(self):
        response = self.client.post(
            f"/api/teams/{self.team_platform.key}/scrum-masters",
            data=json.dumps({"scrum_masters": ["scrum_backup"]}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        self.team_platform.refresh_from_db()
        self.assertEqual(
            sorted(self.team_platform.scrum_masters.values_list("username", flat=True)),
            ["scrum_backup"],
        )

    def test_team_scrum_masters_endpoint_rejects_non_list_payload(self):
        response = self.client.post(
            f"/api/teams/{self.team_platform.key}/scrum-masters",
            data=json.dumps({"scrum_masters": "invalid"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)

    def test_team_scrum_masters_endpoint_rejects_unknown_usernames(self):
        response = self.client.post(
            f"/api/teams/{self.team_platform.key}/scrum-masters",
            data=json.dumps({"scrum_masters": ["not_existing"]}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        payload = response.json()
        self.assertEqual(payload["unknown_usernames"], ["not_existing"])


@override_settings(ENABLE_ROLE_AUTH=True)
class ComplianceRoleAuthorizationTests(TestCase):
    def setUp(self):
        self.team_platform = Team.objects.create(key="squad_platform", display_name="Platform")
        self.team_mobile = Team.objects.create(key="squad_mobile", display_name="Mobile")

        sprint = SprintSnapshot.objects.create(
            jira_sprint_id="100",
            sprint_name="Sprint 10",
            sprint_state="active",
            sync_timestamp=timezone.now(),
        )
        self.epic_platform = EpicSnapshot.objects.create(
            sprint_snapshot=sprint,
            jira_issue_id="3001",
            jira_key="ABC-201",
            summary="Platform epic",
            status_name="In Progress",
            resolution_name="",
            is_done=False,
        )
        self.epic_platform.teams.add(self.team_platform)
        DoDTaskSnapshot.objects.create(
            epic_snapshot=self.epic_platform,
            jira_issue_id="4001",
            jira_key="ABC-211",
            summary="DoD - Automated tests",
            category="automated_tests",
            status_name="Done",
            resolution_name="Done",
            is_done=True,
            has_evidence_link=False,
            evidence_link="",
            non_compliance_reason="missing_evidence_link",
        )

        self.epic_mobile = EpicSnapshot.objects.create(
            sprint_snapshot=sprint,
            jira_issue_id="3002",
            jira_key="ABC-202",
            summary="Mobile epic",
            status_name="In Progress",
            resolution_name="",
            is_done=False,
        )
        self.epic_mobile.teams.add(self.team_mobile)
        DoDTaskSnapshot.objects.create(
            epic_snapshot=self.epic_mobile,
            jira_issue_id="4002",
            jira_key="ABC-212",
            summary="DoD - Manual tests",
            category="manual_tests",
            status_name="Done",
            resolution_name="Done",
            is_done=True,
            has_evidence_link=False,
            evidence_link="",
            non_compliance_reason="missing_evidence_link",
        )

        Group.objects.get_or_create(name=GROUP_ADMIN)
        Group.objects.get_or_create(name=GROUP_SCRUM_MASTER)
        Group.objects.get_or_create(name=GROUP_VIEWER)

        self.admin_user = User.objects.create_user(username="admin_user", password="password123")
        self.admin_user.groups.add(Group.objects.get(name=GROUP_ADMIN))

        self.scrum_user = User.objects.create_user(username="scrum_user", password="password123")
        self.scrum_user.groups.add(Group.objects.get(name=GROUP_SCRUM_MASTER))
        self.team_platform.scrum_masters.add(self.scrum_user)

        self.viewer_user = User.objects.create_user(username="viewer_user", password="password123")
        self.viewer_user.groups.add(Group.objects.get(name=GROUP_VIEWER))

    def test_metrics_requires_authentication_when_role_auth_enabled(self):
        response = self.client.get("/api/metrics")
        self.assertEqual(response.status_code, 401)

    def test_scrum_master_only_sees_managed_squads(self):
        self.client.force_login(self.scrum_user)

        response = self.client.get("/api/metrics")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["summary"]["total_epics"], 1)
        self.assertEqual(payload["by_team"][0]["team"], "squad_platform")

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_scrum_master_cannot_nudge_unmanaged_epic(self):
        self.client.force_login(self.scrum_user)

        response = self.client.post(
            f"/api/epics/{self.epic_mobile.jira_key}/nudge",
            data=json.dumps({"recipients": ["x@example.com"]}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 403)

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_viewer_cannot_nudge_epic(self):
        self.client.force_login(self.viewer_user)

        response = self.client.post(
            f"/api/epics/{self.epic_platform.jira_key}/nudge",
            data=json.dumps({"recipients": ["x@example.com"]}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 403)

    def test_admin_can_update_team_recipients(self):
        self.client.force_login(self.admin_user)

        response = self.client.post(
            f"/api/teams/{self.team_platform.key}/recipients",
            data=json.dumps({"recipients": ["alpha@example.com"]}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        self.team_platform.refresh_from_db()
        self.assertEqual(self.team_platform.notification_emails, ["alpha@example.com"])

    def test_scrum_master_cannot_update_team_recipients(self):
        self.client.force_login(self.scrum_user)

        response = self.client.post(
            f"/api/teams/{self.team_platform.key}/recipients",
            data=json.dumps({"recipients": ["alpha@example.com"]}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 403)

    def test_admin_can_update_team_scrum_masters(self):
        self.client.force_login(self.admin_user)

        candidate = User.objects.create_user(username="candidate_sm", password="password123")
        response = self.client.post(
            f"/api/teams/{self.team_platform.key}/scrum-masters",
            data=json.dumps({"scrum_masters": [candidate.username]}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        self.team_platform.refresh_from_db()
        self.assertEqual(
            sorted(self.team_platform.scrum_masters.values_list("username", flat=True)),
            [candidate.username],
        )

    def test_scrum_master_cannot_update_team_scrum_masters(self):
        self.client.force_login(self.scrum_user)

        response = self.client.post(
            f"/api/teams/{self.team_platform.key}/scrum-masters",
            data=json.dumps({"scrum_masters": ["scrum_user"]}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 403)


class ComplianceApiEmptyStateTests(TestCase):
    def test_metrics_endpoint_returns_empty_scope_when_no_snapshots(self):
        response = self.client.get("/api/metrics")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertIsNone(payload["scope"])
        self.assertEqual(payload["summary"]["total_epics"], 0)
        self.assertEqual(payload["summary"]["compliance_percentage"], 0.0)
        self.assertEqual(payload["summary"]["epics_with_missing_squad_labels"], 0)
        self.assertEqual(payload["summary"]["epics_with_invalid_squad_labels"], 0)
        self.assertEqual(payload["by_team"], [])
        self.assertEqual(payload["by_category"], [])

    def test_non_compliant_endpoint_returns_empty_scope_when_no_snapshots(self):
        response = self.client.get("/api/epics/non-compliant")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertIsNone(payload["scope"])
        self.assertEqual(payload["count"], 0)
        self.assertEqual(payload["epics"], [])


class AuthSessionApiTests(TestCase):
    def setUp(self):
        Group.objects.get_or_create(name=GROUP_SCRUM_MASTER)
        self.user = User.objects.create_user(
            username="scrum_auth",
            password="password123",
            email="scrum@example.com",
        )
        self.user.groups.add(Group.objects.get(name=GROUP_SCRUM_MASTER))

        team = Team.objects.create(key="squad_platform", display_name="Platform")
        team.scrum_masters.add(self.user)

    def test_session_endpoint_returns_anonymous_payload_when_logged_out(self):
        response = self.client.get("/api/auth/session")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["authenticated"], False)
        self.assertIsNone(payload["user"])

    def test_login_endpoint_creates_session(self):
        with self.assertLogs("dod.audit", level="INFO") as captured:
            response = self.client.post(
                "/api/auth/login",
                data=json.dumps({"username": "scrum_auth", "password": "password123"}),
                content_type="application/json",
                HTTP_X_REQUEST_ID="login-req-1",
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["authenticated"], True)
        self.assertEqual(payload["user"]["username"], "scrum_auth")
        self.assertEqual(payload["user"]["role"], "scrum_master")
        self.assertEqual(payload["user"]["managed_squads"], ["squad_platform"])
        log_output = "\n".join(captured.output)
        self.assertIn("auth.login.succeeded", log_output)
        self.assertIn("login-req-1", log_output)

    @override_settings(ENABLE_LDAP_AUTH=True)
    def test_login_endpoint_handles_mocked_ldap_bind_failure_without_exposing_details(self):
        with patch("compliance.auth_views.authenticate", side_effect=RuntimeError("ldap timeout")):
            with self.assertLogs("dod.audit", level="WARNING") as captured:
                response = self.client.post(
                    "/api/auth/login",
                    data=json.dumps({"username": "scrum_auth", "password": "password123"}),
                    content_type="application/json",
                )

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["detail"], "Invalid credentials.")
        log_output = "\n".join(captured.output)
        self.assertIn("ldap_bind_failed", log_output)
        self.assertIn("RuntimeError", log_output)
        self.assertNotIn("ldap timeout", log_output)

    @override_settings(ENABLE_LDAP_AUTH=True)
    def test_login_endpoint_supports_mocked_ldap_bind_success(self):
        with patch("compliance.auth_views.authenticate", return_value=self.user):
            response = self.client.post(
                "/api/auth/login",
                data=json.dumps({"username": "scrum_auth", "password": "password123"}),
                content_type="application/json",
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["authenticated"], True)

    def test_login_endpoint_rejects_invalid_credentials(self):
        with self.assertLogs("dod.audit", level="WARNING") as captured:
            response = self.client.post(
                "/api/auth/login",
                data=json.dumps({"username": "scrum_auth", "password": "wrong"}),
                content_type="application/json",
            )
        self.assertEqual(response.status_code, 401)
        self.assertIn("auth.login.failed", "\n".join(captured.output))

    def test_logout_endpoint_clears_session(self):
        self.client.post(
            "/api/auth/login",
            data=json.dumps({"username": "scrum_auth", "password": "password123"}),
            content_type="application/json",
        )

        with self.assertLogs("dod.audit", level="INFO") as captured:
            response = self.client.post("/api/auth/logout", data="{}", content_type="application/json")

        self.assertEqual(response.status_code, 200)
        self.assertIn("auth.logout", "\n".join(captured.output))
        status_response = self.client.get("/api/auth/session")
        self.assertEqual(status_response.status_code, 200)
        self.assertEqual(status_response.json()["authenticated"], False)
