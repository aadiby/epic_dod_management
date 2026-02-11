from django.urls import path

from .auth_views import AuthLoginView, AuthLogoutView, AuthSessionView
from .views import (
    EpicsOverviewView,
    MetricsView,
    NonCompliantEpicsView,
    NudgeEpicView,
    NudgeHistoryView,
    TeamRecipientsView,
    TeamScrumMastersView,
    TeamsView,
)

urlpatterns = [
    path("auth/session", AuthSessionView.as_view(), name="auth_session"),
    path("auth/login", AuthLoginView.as_view(), name="auth_login"),
    path("auth/logout", AuthLogoutView.as_view(), name="auth_logout"),
    path("metrics", MetricsView.as_view(), name="metrics"),
    path("epics", EpicsOverviewView.as_view(), name="epics_overview"),
    path("epics/non-compliant", NonCompliantEpicsView.as_view(), name="non_compliant_epics"),
    path("epics/<str:jira_key>/nudge", NudgeEpicView.as_view(), name="nudge_epic"),
    path("nudges/history", NudgeHistoryView.as_view(), name="nudge_history"),
    path("teams", TeamsView.as_view(), name="teams"),
    path("teams/<str:team_key>/recipients", TeamRecipientsView.as_view(), name="team_recipients"),
    path("teams/<str:team_key>/scrum-masters", TeamScrumMastersView.as_view(), name="team_scrum_masters"),
]
