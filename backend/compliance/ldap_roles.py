from __future__ import annotations

import os
from collections.abc import Iterable
from typing import Any

from django.contrib.auth.models import Group

from .authz import GROUP_ADMIN, GROUP_SCRUM_MASTER, GROUP_VIEWER

LDAP_ADMIN_GROUP_DN_ENV = "LDAP_ADMIN_GROUP_DN"
LDAP_SCRUM_MASTER_GROUP_DN_ENV = "LDAP_SCRUM_MASTER_GROUP_DN"
LDAP_VIEWER_GROUP_DN_ENV = "LDAP_VIEWER_GROUP_DN"

LDAP_ROLE_DN_ENV_BY_GROUP = {
    GROUP_ADMIN: LDAP_ADMIN_GROUP_DN_ENV,
    GROUP_SCRUM_MASTER: LDAP_SCRUM_MASTER_GROUP_DN_ENV,
    GROUP_VIEWER: LDAP_VIEWER_GROUP_DN_ENV,
}

MANAGED_ROLE_GROUPS = {GROUP_ADMIN, GROUP_SCRUM_MASTER, GROUP_VIEWER}


def normalize_dn(value: str) -> str:
    return value.strip().lower()


def load_role_group_dn_map() -> dict[str, str]:
    mapping: dict[str, str] = {}
    for group_name, env_name in LDAP_ROLE_DN_ENV_BY_GROUP.items():
        raw_value = os.getenv(env_name, "").strip()
        if raw_value:
            mapping[group_name] = normalize_dn(raw_value)
    return mapping


def extract_ldap_group_dns(ldap_user: Any) -> set[str]:
    raw_group_dns = getattr(ldap_user, "group_dns", None)
    if raw_group_dns is None:
        return set()

    if callable(raw_group_dns):
        raw_group_dns = raw_group_dns()

    if isinstance(raw_group_dns, str):
        return {normalize_dn(raw_group_dns)}

    if isinstance(raw_group_dns, Iterable):
        return {
            normalize_dn(item)
            for item in raw_group_dns
            if isinstance(item, str) and item.strip()
        }

    return set()


def resolve_role_groups_for_ldap_user(
    ldap_user: Any,
    role_group_dn_map: dict[str, str] | None = None,
) -> set[str]:
    role_group_dn_map = role_group_dn_map or load_role_group_dn_map()
    if not role_group_dn_map:
        return set()

    user_group_dns = extract_ldap_group_dns(ldap_user)
    return {
        group_name
        for group_name, required_dn in role_group_dn_map.items()
        if required_dn in user_group_dns
    }


def sync_user_role_groups(user, desired_role_groups: set[str]) -> None:
    desired = {name for name in desired_role_groups if name in MANAGED_ROLE_GROUPS}
    current = set(user.groups.filter(name__in=MANAGED_ROLE_GROUPS).values_list("name", flat=True))

    to_remove = current - desired
    if to_remove:
        user.groups.remove(*Group.objects.filter(name__in=sorted(to_remove)))

    for group_name in sorted(desired):
        group, _ = Group.objects.get_or_create(name=group_name)
        user.groups.add(group)


def sync_user_roles_from_ldap(sender, user, ldap_user, **kwargs) -> None:
    del sender
    del kwargs
    role_group_dn_map = load_role_group_dn_map()
    if not role_group_dn_map:
        return

    desired_role_groups = resolve_role_groups_for_ldap_user(
        ldap_user=ldap_user,
        role_group_dn_map=role_group_dn_map,
    )
    sync_user_role_groups(user=user, desired_role_groups=desired_role_groups)


def connect_ldap_role_mapping_signal() -> bool:
    try:
        from django_auth_ldap.backend import populate_user
    except Exception:
        return False

    populate_user.connect(
        sync_user_roles_from_ldap,
        dispatch_uid="compliance.sync_user_roles_from_ldap",
    )
    return True
