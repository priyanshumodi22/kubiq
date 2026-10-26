# Telemetry retention across database adapters

| Variable | Default | Meaning |
|---|---|---|
| `APM_RETENTION_PERIOD` | `3d` | Span lifetime from event timestamp |
| `LOG_RETENTION_PERIOD` | `7d` | Log lifetime from event timestamp |
| `APM_RETENTION_DAYS` | unset | Legacy whole-day alias when PERIOD is absent |
| `LOG_RETENTION_DAYS` | unset | Legacy whole-day alias when PERIOD is absent |
| `AI_KUBI_HISTORY_RETENTION_DAYS` | `90` | Separate conversation history, unchanged |

Durations accept positive whole numbers with seconds, minutes, hours, days or weeks (`24h`, `3d`). Invalid, zero, negative or overflowing values fail startup. PERIOD takes precedence over DAYS. Restart after changes.

MongoDB startup converts the plain timestamp index with collMod, updates changed expiry, creates missing indexes, and verifies the result. Unrelated indexes remain. Startup fails on migration failure. Requires createIndex/collMod permission; conversion requires MongoDB 5.1+.

Enabling TTL deletes existing records older than the configured period. Back up affected collections before rollout. Deletion is asynchronous, not a storage quota; physical disk files need not shrink immediately. Sampling and storage alerts remain separate controls.

## Adapter support

| Adapter | APM spans | Application logs |
|---|---|---|
| MongoDB | Verified native TTL index | Verified native TTL index |
| MySQL / MariaDB | Startup sweep and recurring 60-second sweep, 1000 rows per batch | Retained log storage is unsupported |
| ClickHouse override | Verified native table TTL | Verified native table TTL |
| JSON | APM storage is unsupported | Retained log storage is unsupported |

MySQL/MariaDB cleanup runs while kubiq is running, uses an indexed timestamp predicate and bound cutoff, retries transient errors next minute, and prevents overlapping sweeps. It needs DELETE permission, not server-wide EVENT privileges. Startup fails on the first sweep failure. Large backlogs drain over multiple sweeps. Stopping kubiq stops the sweeper; it resumes next startup.

ClickHouse applies MODIFY TTL to existing tables and verifies system.tables metadata. Native deletion happens during background merges and may lag expiry by hours. No synchronous OPTIMIZE is run against production data. The user needs ALTER TTL permission. Both adapters preserve existing tables and query indexes.

No sampling or ingestion cap is introduced by this repair.

## Verified live MongoDB repair (2026-10-26)

The existing plain timestamp indexes were converted to 259200-second APM and 604800-second log TTL indexes on MongoDB 8.0.34. All 252 recent spans remained. All 75777 logs were already older than seven days and expired; a full EJSON gzip backup with original indexes was uploaded to the private backup bucket first, downloaded again, hash-checked, and parsed to confirm all original records. See `ops/retention-check/verification-20261026.json` for the backup location and verification evidence. The bucket retains the backup for 30 days.

The EJSON archive is newline-delimited `{collection, document}` records. For recovery, decode with BSON EJSON, restore into a separate collection without TTL first, verify record counts, then choose an export or a retention policy before returning data to active collections. Restoring expired records directly under the same TTL would expire them again. Never restore over live application collections without a reviewed recovery plan.

## Release verification

Release `main-155` (source `5745b70`) passed all four real database CI jobs and the strict Sonar gate: zero open issues, zero unreviewed hotspots, and 81.1% new-code coverage. A live authenticated post-rollout test confirmed HTTP 202 for spans and logs, HTTP 401 without authentication, recent records retained, expired records deleted, and complete cleanup of its synthetic records. See `docs/sonarqube/release-verification-5745b70.json`.
