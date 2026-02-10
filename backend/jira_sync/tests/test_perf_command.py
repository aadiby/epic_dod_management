from io import StringIO

from django.core.management import CommandError, call_command
from django.test import TestCase


class PerformanceCommandTests(TestCase):
    def test_benchmark_performance_outputs_metrics_and_sync_results(self):
        out = StringIO()

        call_command(
            "benchmark_performance",
            "--api-iterations",
            "2",
            "--epics",
            "4",
            "--dod-tasks-per-epic",
            "1",
            stdout=out,
        )

        output = out.getvalue()
        self.assertIn('"metrics_p95_ms"', output)
        self.assertIn('"sync_elapsed_seconds"', output)
        self.assertIn('"passes"', output)

    def test_benchmark_performance_can_fail_thresholds(self):
        with self.assertRaises(CommandError):
            call_command(
                "benchmark_performance",
                "--api-iterations",
                "1",
                "--epics",
                "2",
                "--dod-tasks-per-epic",
                "1",
                "--metrics-target-ms",
                "0.001",
                "--sync-target-seconds",
                "0.001",
                "--fail-on-threshold",
            )
