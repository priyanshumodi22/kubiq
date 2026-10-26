# MySQL and MariaDB credentials

All eight SQL repositories use the same password policy: services, users, passkeys, notifications, system settings/metrics, audit logs, kubi history and APM traces.

Set `DB_PASSWORD` (preferred), or keep the existing `DB_PASS` alias. One variable is sufficient. If both are provided, they must match, including explicit empty strings; otherwise initialization fails with a configuration error that contains no credential values. Password whitespace is preserved. No password configured means an empty password, not an inferred `root` or `password` value. Configure a real password for production.

Existing `DB_PASS`-only deployments continue working. The previous trace/system password fallbacks were inconsistent and are removed. If a deployment depended on a hard-coded fallback, set its intended password explicitly before upgrading. No passwords or database records are migrated.

Every repository honors an explicitly configured `DB_PORT`, including system settings. Set `DB_HOST`, `DB_PORT`, `DB_USER`, and `DB_NAME` explicitly for a consistent SQL endpoint/database. Other connection defaults and table layouts are preserved.
