from django.db import models


class SyncRun(models.Model):
    STATUS_RUNNING = "RUNNING"
    STATUS_SUCCESS = "SUCCESS"
    STATUS_FAILED = "FAILED"

    STATUS_CHOICES = [
        (STATUS_RUNNING, "Running"),
        (STATUS_SUCCESS, "Success"),
        (STATUS_FAILED, "Failed"),
    ]

    started_at = models.DateTimeField()
    finished_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES)
    trigger = models.CharField(max_length=32, default="manual")
    triggered_by = models.CharField(max_length=255, blank=True)
    project_key = models.CharField(max_length=64, blank=True)
    sprint_snapshots = models.IntegerField(default=0)
    epic_snapshots = models.IntegerField(default=0)
    dod_task_snapshots = models.IntegerField(default=0)
    error_message = models.TextField(blank=True)

    class Meta:
        ordering = ["-started_at"]
        indexes = [
            models.Index(fields=["-started_at"]),
            models.Index(fields=["status"]),
        ]

    def __str__(self) -> str:
        return f"{self.status} @ {self.started_at.isoformat()}"
