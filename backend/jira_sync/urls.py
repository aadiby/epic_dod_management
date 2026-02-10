from django.urls import path

from .views import SyncRunView, SyncStatusView

urlpatterns = [
    path("sync/status", SyncStatusView.as_view(), name="sync_status"),
    path("sync/run", SyncRunView.as_view(), name="sync_run"),
]
