from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any

from jira import JIRA
from jira.exceptions import JIRAError


class JiraConfigurationError(ValueError):
    """Raised when Jira adapter env configuration is invalid."""


class JiraAdapterError(RuntimeError):
    """Base class for Jira adapter runtime failures."""


class JiraApiError(JiraAdapterError):
    """Raised when an underlying Jira API call fails."""

    def __init__(
        self,
        *,
        operation: str,
        detail: str,
        status_code: int | None = None,
    ):
        self.operation = operation
        self.status_code = status_code
        self.detail = detail
        status_suffix = f" [status={status_code}]" if status_code is not None else ""
        super().__init__(f"Jira API call failed ({operation}){status_suffix}: {detail}")


@dataclass
class JiraAdapterConfig:
    base_url: str
    email: str
    api_token: str
    verify_ssl: bool = True


class JiraClientAdapter:
    def __init__(self, config: JiraAdapterConfig):
        self.config = config
        self.client = JIRA(
            server=config.base_url,
            basic_auth=(config.email, config.api_token),
            options={"verify": config.verify_ssl},
        )

    @classmethod
    def from_env(cls) -> "JiraClientAdapter":
        base_url = os.getenv("JIRA_BASE_URL", "").strip()
        email = os.getenv("JIRA_EMAIL", "").strip()
        api_token = os.getenv("JIRA_API_KEY", "").strip()
        verify_ssl_raw = os.getenv("JIRA_VERIFY_SSL", "true").strip().lower()

        missing: list[str] = []
        if not base_url:
            missing.append("JIRA_BASE_URL")
        if not email:
            missing.append("JIRA_EMAIL")
        if not api_token:
            missing.append("JIRA_API_KEY")

        if missing:
            joined = ", ".join(missing)
            raise JiraConfigurationError(f"Missing Jira configuration values: {joined}")

        config = JiraAdapterConfig(
            base_url=base_url,
            email=email,
            api_token=api_token,
            verify_ssl=verify_ssl_raw in {"1", "true", "yes", "on"},
        )
        return cls(config)

    def search_active_sprint_issues(
        self, project_key: str | None = None, max_results: int = 200
    ) -> list[Any]:
        jql_parts = ["sprint in openSprints()"]
        if project_key:
            jql_parts.insert(0, f"project = {project_key}")

        jql = " AND ".join(jql_parts) + " ORDER BY updated DESC"

        return self._run_jira_call(
            operation="search_active_sprint_issues",
            fn=lambda: list(
                self.client.search_issues(
                    jql,
                    maxResults=max_results,
                    fields="*all",
                )
            ),
        )

    def get_issue(self, issue_key: str):
        return self._run_jira_call(
            operation="get_issue",
            fn=lambda: self.client.issue(issue_key, fields="*all"),
        )

    def get_child_issues(
        self,
        epic_key: str,
        max_results: int = 200,
    ) -> list[Any]:
        epic_link_field = os.getenv("JIRA_EPIC_LINK_FIELD", "customfield_10014").strip()
        child_clause_template = os.getenv("JIRA_CHILD_ISSUES_JQL_CLAUSE", "").strip()

        if child_clause_template:
            clause = child_clause_template.format(epic_key=epic_key)
        else:
            clause = f'("{epic_link_field}" = "{epic_key}" OR parent = "{epic_key}")'

        jql = f"{clause} ORDER BY updated DESC"

        return self._run_jira_call(
            operation="get_child_issues",
            fn=lambda: list(
                self.client.search_issues(
                    jql,
                    maxResults=max_results,
                    fields="*all",
                )
            ),
        )

    def get_issue_remote_links(self, issue_key: str) -> list[Any]:
        return self._run_jira_call(
            operation="get_issue_remote_links",
            fn=lambda: list(self.client.remote_links(issue_key)),
        )

    def _run_jira_call(self, *, operation: str, fn):
        try:
            return fn()
        except JIRAError as exc:
            status_code = self._coerce_status_code(getattr(exc, "status_code", None))
            detail = str(getattr(exc, "text", "")).strip() or str(exc)
            raise JiraApiError(
                operation=operation,
                status_code=status_code,
                detail=detail,
            ) from exc
        except Exception as exc:
            raise JiraApiError(
                operation=operation,
                detail=str(exc),
            ) from exc

    def _coerce_status_code(self, value) -> int | None:
        if value is None:
            return None
        try:
            return int(value)
        except (TypeError, ValueError):
            return None
