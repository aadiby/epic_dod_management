from __future__ import annotations

from django.contrib.auth.models import AbstractBaseUser

ROLE_ADMIN = "admin"
ROLE_SCRUM_MASTER = "scrum_master"
ROLE_VIEWER = "viewer"
ROLE_NONE = "none"

GROUP_ADMIN = "dod_admin"
GROUP_SCRUM_MASTER = "dod_scrum_master"
GROUP_VIEWER = "dod_viewer"


def get_user_role(user: AbstractBaseUser | None) -> str:
    if user is None or not getattr(user, "is_authenticated", False):
        return ROLE_NONE

    if getattr(user, "is_superuser", False):
        return ROLE_ADMIN

    groups = user.groups.values_list("name", flat=True)
    group_names = set(groups)

    if GROUP_ADMIN in group_names:
        return ROLE_ADMIN
    if GROUP_SCRUM_MASTER in group_names:
        return ROLE_SCRUM_MASTER
    if GROUP_VIEWER in group_names:
        return ROLE_VIEWER

    return ROLE_NONE
