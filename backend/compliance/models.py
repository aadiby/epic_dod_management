from django.conf import settings
from django.db import models


class Team(models.Model):
    key = models.CharField(max_length=100, unique=True)
    display_name = models.CharField(max_length=150, blank=True)
    notification_emails = models.JSONField(default=list)
    scrum_masters = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        related_name="managed_squads",
        blank=True,
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["key"]

    def __str__(self) -> str:
        return self.display_name or self.key


class SprintSnapshot(models.Model):
    jira_sprint_id = models.CharField(max_length=64)
    sprint_name = models.CharField(max_length=255)
    sprint_state = models.CharField(max_length=64)
    sync_timestamp = models.DateTimeField()
    issue_versions = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-sync_timestamp"]
        indexes = [models.Index(fields=["jira_sprint_id", "sync_timestamp"])]

    def __str__(self) -> str:
        return f"{self.sprint_name} @ {self.sync_timestamp.isoformat()}"


class EpicSnapshot(models.Model):
    sprint_snapshot = models.ForeignKey(
        SprintSnapshot,
        on_delete=models.CASCADE,
        related_name="epics",
    )
    jira_issue_id = models.CharField(max_length=64)
    jira_key = models.CharField(max_length=32)
    summary = models.CharField(max_length=500)
    status_name = models.CharField(max_length=128)
    resolution_name = models.CharField(max_length=128, blank=True)
    is_done = models.BooleanField(default=False)
    jira_url = models.URLField(blank=True)
    missing_squad_labels = models.BooleanField(default=False)
    squad_label_warnings = models.JSONField(default=list, blank=True)
    teams = models.ManyToManyField(Team, related_name="epic_snapshots", blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["jira_key"]
        constraints = [
            models.UniqueConstraint(
                fields=["sprint_snapshot", "jira_issue_id"],
                name="uniq_epic_snapshot_per_sprint_issue",
            )
        ]
        indexes = [models.Index(fields=["jira_key"]), models.Index(fields=["is_done"])]

    def __str__(self) -> str:
        return self.jira_key


class DoDTaskSnapshot(models.Model):
    epic_snapshot = models.ForeignKey(
        EpicSnapshot,
        on_delete=models.CASCADE,
        related_name="dod_tasks",
    )
    jira_issue_id = models.CharField(max_length=64)
    jira_key = models.CharField(max_length=32)
    summary = models.CharField(max_length=500)
    category = models.CharField(max_length=120, blank=True)
    status_name = models.CharField(max_length=128)
    resolution_name = models.CharField(max_length=128, blank=True)
    is_done = models.BooleanField(default=False)
    jira_url = models.URLField(blank=True)
    has_evidence_link = models.BooleanField(default=False)
    evidence_link = models.URLField(blank=True)
    non_compliance_reason = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["jira_key"]
        constraints = [
            models.UniqueConstraint(
                fields=["epic_snapshot", "jira_issue_id"],
                name="uniq_dod_task_snapshot_per_epic_issue",
            )
        ]
        indexes = [
            models.Index(fields=["category"]),
            models.Index(fields=["is_done", "has_evidence_link"]),
        ]

    def __str__(self) -> str:
        return self.jira_key


class NudgeLog(models.Model):
    epic_snapshot = models.ForeignKey(
        EpicSnapshot,
        on_delete=models.CASCADE,
        related_name="nudge_logs",
    )
    team = models.ForeignKey(Team, null=True, blank=True, on_delete=models.SET_NULL)
    triggered_by = models.CharField(max_length=255)
    recipient_emails = models.JSONField(default=list)
    message_preview = models.TextField(blank=True)
    sent_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-sent_at"]
        indexes = [models.Index(fields=["sent_at"])]

    def __str__(self) -> str:
        return f"Nudge {self.epic_snapshot.jira_key} @ {self.sent_at.isoformat()}"
