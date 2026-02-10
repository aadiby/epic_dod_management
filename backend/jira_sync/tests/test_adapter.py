import os
from unittest.mock import Mock, patch

from django.test import SimpleTestCase
from jira.exceptions import JIRAError

from jira_sync.adapter import (
    JiraAdapterConfig,
    JiraApiError,
    JiraClientAdapter,
    JiraConfigurationError,
)


class JiraClientAdapterConfigTests(SimpleTestCase):
    def test_from_env_raises_when_required_values_missing(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(JiraConfigurationError):
                JiraClientAdapter.from_env()

    @patch("jira_sync.adapter.JIRA")
    def test_from_env_builds_adapter_from_env(self, jira_mock):
        with patch.dict(
            os.environ,
            {
                "JIRA_BASE_URL": "https://example.atlassian.net",
                "JIRA_EMAIL": "bot@example.com",
                "JIRA_API_KEY": "token",
            },
            clear=True,
        ):
            adapter = JiraClientAdapter.from_env()

        jira_mock.assert_called_once()
        self.assertEqual(adapter.config.base_url, "https://example.atlassian.net")
        self.assertEqual(adapter.config.email, "bot@example.com")


class JiraClientAdapterRuntimeTests(SimpleTestCase):
    def setUp(self):
        self.config = JiraAdapterConfig(
            base_url="https://example.atlassian.net",
            email="bot@example.com",
            api_token="token",
        )

    @patch("jira_sync.adapter.JIRA")
    def test_search_active_sprint_issues_builds_expected_jql(self, jira_cls_mock):
        client_mock = Mock()
        client_mock.search_issues.return_value = ["issue-1"]
        jira_cls_mock.return_value = client_mock

        adapter = JiraClientAdapter(self.config)
        issues = adapter.search_active_sprint_issues(project_key="ABC", max_results=50)

        self.assertEqual(issues, ["issue-1"])
        client_mock.search_issues.assert_called_once()
        args, kwargs = client_mock.search_issues.call_args
        self.assertIn("project = ABC AND sprint in openSprints()", args[0])
        self.assertEqual(kwargs["maxResults"], 50)
        self.assertEqual(kwargs["fields"], "*all")

    @patch("jira_sync.adapter.JIRA")
    def test_get_child_issues_uses_default_clause(self, jira_cls_mock):
        client_mock = Mock()
        client_mock.search_issues.return_value = ["child-1"]
        jira_cls_mock.return_value = client_mock

        adapter = JiraClientAdapter(self.config)
        children = adapter.get_child_issues(epic_key="ABC-100", max_results=25)

        self.assertEqual(children, ["child-1"])
        args, kwargs = client_mock.search_issues.call_args
        self.assertIn('"customfield_10014" = "ABC-100"', args[0])
        self.assertIn('parent = "ABC-100"', args[0])
        self.assertEqual(kwargs["maxResults"], 25)

    @patch("jira_sync.adapter.JIRA")
    def test_get_child_issues_supports_custom_clause_env(self, jira_cls_mock):
        client_mock = Mock()
        client_mock.search_issues.return_value = ["child-2"]
        jira_cls_mock.return_value = client_mock

        with patch.dict(
            os.environ,
            {"JIRA_CHILD_ISSUES_JQL_CLAUSE": '"Team" = infra AND parent = "{epic_key}"'},
            clear=False,
        ):
            adapter = JiraClientAdapter(self.config)
            adapter.get_child_issues(epic_key="ABC-777")

        args, _ = client_mock.search_issues.call_args
        self.assertIn('"Team" = infra AND parent = "ABC-777"', args[0])

    @patch("jira_sync.adapter.JIRA")
    def test_wraps_jira_error_into_jira_api_error_with_status(self, jira_cls_mock):
        client_mock = Mock()
        client_mock.search_issues.side_effect = JIRAError(
            text="Field not found",
            status_code=400,
            url="https://example.atlassian.net/rest/api/3/search",
        )
        jira_cls_mock.return_value = client_mock
        adapter = JiraClientAdapter(self.config)

        with self.assertRaises(JiraApiError) as captured:
            adapter.search_active_sprint_issues(project_key="ABC")

        self.assertEqual(captured.exception.operation, "search_active_sprint_issues")
        self.assertEqual(captured.exception.status_code, 400)
        self.assertIn("Field not found", str(captured.exception))

    @patch("jira_sync.adapter.JIRA")
    def test_wraps_generic_runtime_error_into_jira_api_error(self, jira_cls_mock):
        client_mock = Mock()
        client_mock.issue.side_effect = RuntimeError("network timeout")
        jira_cls_mock.return_value = client_mock
        adapter = JiraClientAdapter(self.config)

        with self.assertRaises(JiraApiError) as captured:
            adapter.get_issue("ABC-1")

        self.assertEqual(captured.exception.operation, "get_issue")
        self.assertIsNone(captured.exception.status_code)
        self.assertIn("network timeout", captured.exception.detail)
