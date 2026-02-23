# M1 Mac Mini 8GB Runtime Profile

Target host: dedicated Apple Silicon M1 Mac Mini with 8GB RAM.

## Defaults
- Batch size: 50 pages per witness run.
- OCR workers: 2 max.
- Split/remap workers: 2 max.
- Ta'am alignment workers: 2 max.
- Image fallback workers: 1 max.
- Global heavy job cap: 3.

## Adaptive Throttling
- `reduced` mode when RSS > 6200 MB:
  - heavy workers reduced to 1
  - image fallback paused
- `single` mode when RSS > 7000 MB:
  - one heavy job at a time
  - emit monitoring alert
- return to `normal` only after sustained memory recovery.

## Monitoring Surface
Use `/manuscripts/monitoring` and these APIs:
- `GET /api/manuscripts/monitoring/summary`
- `GET /api/manuscripts/monitoring/jobs`
- `GET /api/manuscripts/monitoring/system`

Telemetry fields persisted in run state:
- `rss_mb`
- `cpu_pct`
- `queue_depth`
- `throttle_state`
