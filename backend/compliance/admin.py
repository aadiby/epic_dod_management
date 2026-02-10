from django.contrib import admin

from .models import DoDTaskSnapshot, EpicSnapshot, NudgeLog, SprintSnapshot, Team


@admin.register(Team)
class TeamAdmin(admin.ModelAdmin):
    list_display = ("key", "display_name", "is_active", "recipient_count", "created_at")
    search_fields = ("key", "display_name")
    list_filter = ("is_active",)
    filter_horizontal = ("scrum_masters",)

    def recipient_count(self, obj):
        return len(obj.notification_emails or [])


@admin.register(SprintSnapshot)
class SprintSnapshotAdmin(admin.ModelAdmin):
    list_display = ("jira_sprint_id", "sprint_name", "sprint_state", "sync_timestamp")
    search_fields = ("jira_sprint_id", "sprint_name")
    list_filter = ("sprint_state",)


@admin.register(EpicSnapshot)
class EpicSnapshotAdmin(admin.ModelAdmin):
    list_display = ("jira_key", "status_name", "resolution_name", "is_done", "sprint_snapshot")
    search_fields = ("jira_key", "summary")
    list_filter = ("is_done", "status_name")
    filter_horizontal = ("teams",)


@admin.register(DoDTaskSnapshot)
class DoDTaskSnapshotAdmin(admin.ModelAdmin):
    list_display = (
        "jira_key",
        "category",
        "status_name",
        "is_done",
        "has_evidence_link",
        "epic_snapshot",
    )
    search_fields = ("jira_key", "summary", "category")
    list_filter = ("is_done", "has_evidence_link", "category")


@admin.register(NudgeLog)
class NudgeLogAdmin(admin.ModelAdmin):
    list_display = ("epic_snapshot", "team", "triggered_by", "sent_at")
    search_fields = ("triggered_by", "epic_snapshot__jira_key")
    list_filter = ("sent_at",)
