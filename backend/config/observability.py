from __future__ import annotations

import json
import logging
import uuid
from typing import Any

from django.utils import timezone

AUDIT_LOGGER_NAME = "dod.audit"


class RequestIdMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        incoming = (
            request.META.get("HTTP_X_REQUEST_ID", "").strip()
            or request.META.get("HTTP_X_CORRELATION_ID", "").strip()
        )
        request_id = incoming[:128] if incoming else str(uuid.uuid4())
        request.correlation_id = request_id

        response = self.get_response(request)
        response["X-Request-ID"] = request_id
        return response


def _user_identity(request) -> tuple[bool, str]:
    user = getattr(request, "user", None)
    if user is None or not getattr(user, "is_authenticated", False):
        return False, ""
    identifier = getattr(user, "email", "").strip() or getattr(user, "username", "").strip()
    return True, identifier


def request_correlation_id(request) -> str:
    return (
        getattr(request, "correlation_id", "")
        or request.META.get("HTTP_X_REQUEST_ID", "").strip()
        or request.META.get("HTTP_X_CORRELATION_ID", "").strip()
    )


def audit_log(
    event: str,
    *,
    request=None,
    level: int = logging.INFO,
    logger_name: str = AUDIT_LOGGER_NAME,
    **fields: Any,
) -> None:
    payload: dict[str, Any] = {
        "timestamp": timezone.now().isoformat(),
        "event": event,
    }

    if request is not None:
        is_authenticated, user_identifier = _user_identity(request)
        payload.update(
            {
                "correlation_id": request_correlation_id(request),
                "path": getattr(request, "path", ""),
                "method": getattr(request, "method", ""),
                "authenticated": is_authenticated,
                "user": user_identifier,
            }
        )

    payload.update(fields)
    logger = logging.getLogger(logger_name)
    logger.log(level, json.dumps(payload, sort_keys=True, default=str))
