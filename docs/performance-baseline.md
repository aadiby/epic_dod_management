# Performance Baseline

## Purpose
Define and measure baseline performance for:
- Dashboard metrics API latency.
- Jira sync runtime SLA.

## Targets
- Metrics API `p95 <= 500ms` for a representative dataset.
- Sync runtime `<= 120s` for the same baseline dataset.

## Harness command
Run from backend virtualenv:

```bash
cd backend
source .venv/bin/activate
python manage.py benchmark_performance --api-iterations 50 --epics 120 --dod-tasks-per-epic 3
```

The command prints a JSON report containing:
- dataset size
- latency distribution (`p50`, `p95`, `max`)
- sync elapsed seconds
- pass/fail flags against target thresholds

## Enforced gate mode
Use strict gating (non-zero exit when thresholds fail):

```bash
python manage.py benchmark_performance \
  --api-iterations 50 \
  --epics 120 \
  --dod-tasks-per-epic 3 \
  --metrics-target-ms 500 \
  --sync-target-seconds 120 \
  --fail-on-threshold
```

## Notes
- The harness uses synthetic in-app data and a synthetic Jira adapter to avoid network dependencies.
- Run on staging-like compute for reliable comparisons between runs.
