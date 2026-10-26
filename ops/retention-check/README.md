# Retention regression fixtures

Run `npm ci --prefix backend`, `npm run build --prefix backend`, then `node ops/retention-check/run.cjs mongo` (or mysql, mariadb, clickhouse) on a machine with Docker. The runner creates a disposable database with only loopback host ports, uses fixture-only credentials, and removes its container/volumes even on failure. Never point these fixtures at application databases. MySQL/MariaDB tests wait 65 seconds to prove recurring cleanup. ClickHouse forces a merge only in its disposable fixture to verify native TTL application without waiting hours. CI runs all four adapters and retains logs per commit.

`postdeploy-mongo.cjs` is a separate, explicitly invoked live smoke check. It sends only disposable uniquely named telemetry through the internal authenticated API, verifies native expiry and retained recent records, and removes only its own fixture records in finally. It needs the existing ingestion token and MongoDB connection through environment variables; never print or commit those values. It is not run automatically against production by the Docker fixture runner.

SQL fixtures also initialize every SQL repository using only DB_PASSWORD, only legacy DB_PASS, and matching aliases. They verify configured port handling and reject conflicting aliases before any connection is opened.
