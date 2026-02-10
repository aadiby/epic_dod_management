from django.apps import AppConfig


class ComplianceConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "compliance"

    def ready(self) -> None:
        from django.conf import settings

        if not getattr(settings, "ENABLE_LDAP_AUTH", False):
            return

        from .ldap_roles import connect_ldap_role_mapping_signal

        connect_ldap_role_mapping_signal()
