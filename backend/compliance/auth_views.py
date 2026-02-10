from __future__ import annotations

import logging

from django.conf import settings
from django.contrib.auth import authenticate, login, logout
from django.views.decorators.csrf import ensure_csrf_cookie
from django.utils.decorators import method_decorator
from rest_framework import status
from rest_framework.authentication import SessionAuthentication
from rest_framework.response import Response
from rest_framework.views import APIView

from .authz import ROLE_SCRUM_MASTER, get_user_role
from .models import Team
from config.observability import audit_log


def _session_payload(request) -> dict[str, object]:
    user = getattr(request, "user", None)
    if user is None or not getattr(user, "is_authenticated", False):
        return {
            "authenticated": False,
            "role_auth_enabled": bool(getattr(settings, "ENABLE_ROLE_AUTH", False)),
            "user": None,
        }

    role = get_user_role(user)
    managed_squads: list[str] = []
    if role == ROLE_SCRUM_MASTER:
        managed_squads = sorted(
            Team.objects.filter(scrum_masters=user).values_list("key", flat=True)
        )

    return {
        "authenticated": True,
        "role_auth_enabled": bool(getattr(settings, "ENABLE_ROLE_AUTH", False)),
        "user": {
            "username": user.username,
            "email": user.email,
            "role": role,
            "managed_squads": managed_squads,
        },
    }


@method_decorator(ensure_csrf_cookie, name="dispatch")
class AuthSessionView(APIView):
    authentication_classes = [SessionAuthentication]
    permission_classes = []

    def get(self, request):
        return Response(_session_payload(request), status=status.HTTP_200_OK)


class AuthLoginView(APIView):
    authentication_classes = [SessionAuthentication]
    permission_classes = []

    def post(self, request):
        request_data = request.data if isinstance(request.data, dict) else {}
        username = str(request_data.get("username", "")).strip()
        password = str(request_data.get("password", ""))

        if not username or not password:
            audit_log(
                "auth.login.failed",
                request=request,
                level=logging.WARNING,
                reason="missing_credentials",
                username=username,
            )
            return Response(
                {"detail": "Both username and password are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            user = authenticate(request, username=username, password=password)
        except Exception as exc:
            if getattr(settings, "ENABLE_LDAP_AUTH", False):
                audit_log(
                    "auth.login.failed",
                    request=request,
                    level=logging.WARNING,
                    reason="ldap_bind_failed",
                    username=username,
                    backend="ldap",
                    error_type=type(exc).__name__,
                )
                return Response(
                    {"detail": "Invalid credentials."},
                    status=status.HTTP_401_UNAUTHORIZED,
                )
            raise
        if user is None or not user.is_active:
            audit_log(
                "auth.login.failed",
                request=request,
                level=logging.WARNING,
                reason="invalid_credentials",
                username=username,
            )
            return Response(
                {"detail": "Invalid credentials."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        login(request, user)
        audit_log(
            "auth.login.succeeded",
            request=request,
            username=user.username,
            role=get_user_role(user),
        )
        return Response(_session_payload(request), status=status.HTTP_200_OK)


class AuthLogoutView(APIView):
    authentication_classes = [SessionAuthentication]
    permission_classes = []

    def post(self, request):
        role = get_user_role(getattr(request, "user", None))
        username = (
            getattr(request.user, "username", "")
            if getattr(request, "user", None) is not None and getattr(request.user, "is_authenticated", False)
            else ""
        )
        logout(request)
        audit_log(
            "auth.logout",
            request=request,
            username=username,
            role=role,
        )
        return Response(
            {"detail": "Logged out.", "authenticated": False},
            status=status.HTTP_200_OK,
        )
