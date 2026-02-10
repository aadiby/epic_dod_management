from django.contrib import admin

from .models import SyncRun


@admin.register(SyncRun)
class SyncRunAdmin(admin.ModelAdmin):
    list_display = (
        "started_at",
        "finished_at",
        "status",
        "trigger",
        "triggered_by",
        "project_key",
        "sprint_snapshots",
        "epic_snapshots",
        "dod_task_snapshots",
    )
    list_filter = ("status", "trigger")
    search_fields = ("triggered_by", "project_key", "error_message")
