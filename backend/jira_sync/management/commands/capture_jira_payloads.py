from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from django.core.management.base import BaseCommand, CommandError

from jira_sync.adapter import JiraApiError, JiraClientAdapter, JiraConfigurationError


def _to_jsonable(value: Any):
    if hasattr(value, "raw"):
        return _to_jsonable(getattr(value, "raw"))
    if isinstance(value, dict):
        return {str(key): _to_jsonable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_to_jsonable(item) for item in value]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return repr(value)


class Command(BaseCommand):
    help = "Capture Jira API payloads into JSON files for secure-environment troubleshooting."

    def add_arguments(self, parser):
        parser.add_argument(
            "--project-key",
            dest="project_key",
            default=None,
            help="Optional Jira project key filter for active sprint search.",
        )
        parser.add_argument(
            "--max-results",
            dest="max_results",
            type=int,
            default=200,
            help="Maximum issues to fetch from Jira search endpoints.",
        )
        parser.add_argument(
            "--remote-links-limit",
            dest="remote_links_limit",
            type=int,
            default=50,
            help="Max issues for which remote links are fetched.",
        )
        parser.add_argument(
            "--epic-key",
            dest="epic_keys",
            action="append",
            default=[],
            help="Epic key to capture children for. Repeat for multiple values.",
        )
        parser.add_argument(
            "--include-children",
            dest="include_children",
            action="store_true",
            help="Also fetch child issues for discovered and explicit epic keys.",
        )
        parser.add_argument(
            "--output-dir",
            dest="output_dir",
            default=None,
            help="Output directory path. Default: ./jira_capture_<timestamp>",
        )
        parser.add_argument(
            "--allow-partial",
            dest="allow_partial",
            action="store_true",
            help="Exit successfully even when Jira calls fail. Errors are still written.",
        )
        parser.add_argument(
            "--fail-on-empty",
            dest="fail_on_empty",
            action="store_true",
            help="Exit non-zero when capture succeeds technically but returns no Jira entities.",
        )

    def handle(self, *args, **options):
        project_key = (options.get("project_key") or "").strip() or None
        max_results = max(int(options.get("max_results") or 200), 1)
        remote_links_limit = max(int(options.get("remote_links_limit") or 50), 0)
        explicit_epic_keys = sorted(
            {
                str(key).strip()
                for key in (options.get("epic_keys") or [])
                if str(key).strip()
            }
        )
        include_children = bool(options.get("include_children"))
        allow_partial = bool(options.get("allow_partial"))
        fail_on_empty = bool(options.get("fail_on_empty"))

        timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        output_dir_option = options.get("output_dir")
        output_dir = (
            Path(output_dir_option).expanduser().resolve()
            if output_dir_option
            else (Path.cwd() / f"jira_capture_{timestamp}")
        )
        output_dir.mkdir(parents=True, exist_ok=True)

        try:
            adapter = JiraClientAdapter.from_env()
        except JiraConfigurationError as exc:
            raise CommandError(str(exc)) from exc

        errors: list[dict[str, Any]] = []

        active_issues = self._safe_call(
            errors=errors,
            operation="search_active_sprint_issues",
            fn=lambda: adapter.search_active_sprint_issues(
                project_key=project_key,
                max_results=max_results,
            ),
            default=[],
        )
        active_issue_payloads = [_to_jsonable(issue) for issue in active_issues]
        self._write_json(
            output_dir / "active_sprint_issues.json",
            active_issue_payloads,
        )
        if not active_issue_payloads and not errors:
            self.stdout.write(
                self.style.WARNING(
                    "No active sprint issues were returned by Jira. "
                    "If there is no active sprint (or no visibility), output files can be empty."
                )
            )

        discovered_epic_keys = {
            epic_key
            for issue in active_issues
            for epic_key in [self._extract_epic_key(issue)]
            if epic_key
        }
        epic_keys = sorted(discovered_epic_keys.union(explicit_epic_keys))

        epic_details: dict[str, Any] = {}
        for epic_key in epic_keys:
            issue = self._safe_call(
                errors=errors,
                operation="get_issue",
                fn=lambda epic_key=epic_key: adapter.get_issue(epic_key),
                default=None,
            )
            if issue is not None:
                epic_details[epic_key] = _to_jsonable(issue)
        self._write_json(output_dir / "epic_details.json", epic_details)

        child_issues_by_epic: dict[str, Any] = {}
        if include_children:
            for epic_key in epic_keys:
                children = self._safe_call(
                    errors=errors,
                    operation="get_child_issues",
                    fn=lambda epic_key=epic_key: adapter.get_child_issues(
                        epic_key=epic_key,
                        max_results=max_results,
                    ),
                    default=[],
                )
                child_issues_by_epic[epic_key] = [_to_jsonable(item) for item in children]
        self._write_json(output_dir / "child_issues_by_epic.json", child_issues_by_epic)

        issue_keys = [str(getattr(issue, "key", "")).strip() for issue in active_issues]
        issue_keys = [key for key in issue_keys if key]
        remote_links: dict[str, Any] = {}
        for issue_key in issue_keys[:remote_links_limit]:
            links = self._safe_call(
                errors=errors,
                operation="get_issue_remote_links",
                fn=lambda issue_key=issue_key: adapter.get_issue_remote_links(issue_key),
                default=[],
            )
            remote_links[issue_key] = [_to_jsonable(link) for link in links]
        self._write_json(output_dir / "remote_links.json", remote_links)

        manifest = {
            "captured_at_utc": datetime.now(timezone.utc).isoformat(),
            "project_key": project_key,
            "max_results": max_results,
            "remote_links_limit": remote_links_limit,
            "include_children": include_children,
            "issue_count": len(active_issue_payloads),
            "epic_count": len(epic_keys),
            "captured_files": [
                "active_sprint_issues.json",
                "epic_details.json",
                "child_issues_by_epic.json",
                "remote_links.json",
                "errors.json",
            ],
        }
        self._write_json(output_dir / "manifest.json", manifest)
        self._write_json(output_dir / "errors.json", errors)

        has_errors = bool(errors)
        path_message = f"Jira payload capture written to: {output_dir}"
        summary_message = f"issues={len(active_issue_payloads)} epics={len(epic_keys)} errors={len(errors)}"
        if has_errors:
            self.stdout.write(self.style.WARNING(path_message))
            self.stdout.write(self.style.WARNING(summary_message))
        else:
            self.stdout.write(self.style.SUCCESS(path_message))
            self.stdout.write(self.style.SUCCESS(summary_message))

        if errors:
            self.stdout.write(self.style.WARNING("Some Jira calls failed; see errors.json."))
            if not allow_partial:
                raise CommandError(
                    f"Capture completed with {len(errors)} Jira error(s). "
                    f"Inspect {output_dir / 'errors.json'} or rerun with --allow-partial."
                )

        total_entities = (
            len(active_issue_payloads)
            + len(epic_details)
            + sum(len(items) for items in child_issues_by_epic.values())
            + sum(len(items) for items in remote_links.values())
        )
        if total_entities == 0 and not errors:
            self.stdout.write(
                self.style.WARNING(
                    "Capture completed with zero entities. "
                    "Try adding --project-key <KEY> and/or explicit --epic-key values."
                )
            )
            if fail_on_empty:
                raise CommandError(
                    "Capture returned no Jira entities. "
                    "Use --project-key/--epic-key or rerun without --fail-on-empty."
                )

    def _safe_call(self, *, errors: list[dict[str, Any]], operation: str, fn, default):
        try:
            return fn()
        except JiraApiError as exc:
            errors.append(
                {
                    "operation": operation,
                    "status_code": exc.status_code,
                    "detail": exc.detail,
                }
            )
            return default
        except Exception as exc:
            errors.append(
                {
                    "operation": operation,
                    "status_code": None,
                    "detail": str(exc),
                }
            )
            return default

    def _write_json(self, path: Path, payload: Any):
        path.write_text(
            json.dumps(payload, indent=2, sort_keys=True, ensure_ascii=True),
            encoding="utf-8",
        )

    def _extract_epic_key(self, issue: Any) -> str | None:
        issue_key = str(getattr(issue, "key", "")).strip()
        issue_type = str(
            getattr(getattr(getattr(issue, "fields", None), "issuetype", None), "name", "")
        ).strip()
        if issue_key and issue_type.lower() == "epic":
            return issue_key

        parent = getattr(getattr(issue, "fields", None), "parent", None)
        if parent is not None:
            parent_key = str(getattr(parent, "key", "")).strip()
            parent_type = str(
                getattr(getattr(getattr(parent, "fields", None), "issuetype", None), "name", "")
            ).strip()
            if parent_key and parent_type.lower() == "epic":
                return parent_key

        configured_field = os.getenv("JIRA_EPIC_LINK_FIELD", "customfield_10014").strip()
        configured_field = configured_field or "customfield_10014"
        epic_link = getattr(getattr(issue, "fields", None), configured_field, None)
        if isinstance(epic_link, str) and epic_link.strip():
            return epic_link.strip()

        raw_fields = getattr(issue, "raw", None)
        if isinstance(raw_fields, dict):
            fields = raw_fields.get("fields")
            if isinstance(fields, dict):
                raw_epic_link = fields.get(configured_field)
                if isinstance(raw_epic_link, str) and raw_epic_link.strip():
                    return raw_epic_link.strip()

        return None
