import os
from types import SimpleNamespace
from unittest.mock import patch

from django.contrib.auth.models import Group, User
from django.test import TestCase

from .authz import GROUP_ADMIN, GROUP_SCRUM_MASTER, GROUP_VIEWER
from .ldap_roles import (
    load_role_group_dn_map,
    resolve_role_groups_for_ldap_user,
    sync_user_roles_from_ldap,
)


class LdapRoleMappingTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="ldap_user", password="password123")
        self.viewer_group = Group.objects.create(name=GROUP_VIEWER)
        self.user.groups.add(self.viewer_group)

    @patch.dict(
        os.environ,
        {
            "LDAP_ADMIN_GROUP_DN": " CN=DoD_Admin,OU=Groups,DC=example,DC=internal ",
            "LDAP_SCRUM_MASTER_GROUP_DN": "CN=DoD_Scrum,OU=Groups,DC=example,DC=internal",
            "LDAP_VIEWER_GROUP_DN": "CN=DoD_Viewer,OU=Groups,DC=example,DC=internal",
        },
        clear=False,
    )
    def test_load_role_group_dn_map_normalizes_configured_dns(self):
        mapping = load_role_group_dn_map()

        self.assertEqual(
            mapping[GROUP_ADMIN],
            "cn=dod_admin,ou=groups,dc=example,dc=internal",
        )
        self.assertEqual(
            mapping[GROUP_SCRUM_MASTER],
            "cn=dod_scrum,ou=groups,dc=example,dc=internal",
        )
        self.assertEqual(
            mapping[GROUP_VIEWER],
            "cn=dod_viewer,ou=groups,dc=example,dc=internal",
        )

    @patch.dict(
        os.environ,
        {
            "LDAP_ADMIN_GROUP_DN": "CN=DoD_Admin,OU=Groups,DC=example,DC=internal",
            "LDAP_SCRUM_MASTER_GROUP_DN": "CN=DoD_Scrum,OU=Groups,DC=example,DC=internal",
            "LDAP_VIEWER_GROUP_DN": "CN=DoD_Viewer,OU=Groups,DC=example,DC=internal",
        },
        clear=False,
    )
    def test_sync_user_roles_from_ldap_updates_managed_groups(self):
        ldap_user = SimpleNamespace(
            group_dns={
                "cn=dod_admin,ou=groups,dc=example,dc=internal",
                "cn=other-group,ou=groups,dc=example,dc=internal",
            }
        )

        sync_user_roles_from_ldap(sender=None, user=self.user, ldap_user=ldap_user)

        role_groups = set(
            self.user.groups.filter(name__in=[GROUP_ADMIN, GROUP_SCRUM_MASTER, GROUP_VIEWER]).values_list(
                "name", flat=True
            )
        )
        self.assertEqual(role_groups, {GROUP_ADMIN})

    @patch.dict(
        os.environ,
        {
            "LDAP_ADMIN_GROUP_DN": "",
            "LDAP_SCRUM_MASTER_GROUP_DN": "",
            "LDAP_VIEWER_GROUP_DN": "",
        },
        clear=False,
    )
    def test_sync_user_roles_from_ldap_is_noop_without_role_mapping_config(self):
        ldap_user = SimpleNamespace(
            group_dns={"cn=dod_admin,ou=groups,dc=example,dc=internal"}
        )

        sync_user_roles_from_ldap(sender=None, user=self.user, ldap_user=ldap_user)

        role_groups = set(
            self.user.groups.filter(name__in=[GROUP_ADMIN, GROUP_SCRUM_MASTER, GROUP_VIEWER]).values_list(
                "name", flat=True
            )
        )
        self.assertEqual(role_groups, {GROUP_VIEWER})

    def test_resolve_role_groups_for_ldap_user_matches_dn_case_insensitively(self):
        mapping = {
            GROUP_ADMIN: "cn=dod_admin,ou=groups,dc=example,dc=internal",
            GROUP_SCRUM_MASTER: "cn=dod_scrum,ou=groups,dc=example,dc=internal",
        }
        ldap_user = SimpleNamespace(
            group_dns=[
                "CN=DoD_Scrum,OU=Groups,DC=example,DC=internal",
            ]
        )

        resolved = resolve_role_groups_for_ldap_user(
            ldap_user=ldap_user,
            role_group_dn_map=mapping,
        )

        self.assertEqual(resolved, {GROUP_SCRUM_MASTER})
