from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/health", include("health.urls")),
    path("api/", include("compliance.urls")),
    path("api/", include("jira_sync.urls")),
]
