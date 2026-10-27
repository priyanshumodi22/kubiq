# Span detail and storage compatibility

The span inspector displays all recorded attributes for any supported storage adapter. MongoDB stores its attribute map; SQL and ClickHouse store equivalent JSON. Changing storage does not change the producer's captured fields.

The controlled `kubiq-backend` profile uses explicit repository spans because the bundled backend cannot rely on driver auto-instrumentation. Earlier SDK 1.1.0 spans intentionally contained only `db.system` and the repository operation. SDK 1.1.1 permits additional bounded diagnostic metadata: `db.system.name`, `db.namespace`, `db.collection.name`, `server.address`, `server.port`, `code.namespace` and `code.function.name`. The backend derives database/host/port and physical collection names from the actual registered Mongoose model and connection. Config operations use their config model, rather than incorrectly claiming to read the services collection. The operation remains a repository operation; it is not presented as an intercepted wire-level MongoDB command.

Request SERVER spans separately carry normalized HTTP route, method and response status. Select the request row to inspect those fields; a database child has its own database attributes. Existing historical spans are unchanged: details that were never captured cannot be reconstructed safely. New requests after deployment receive the enriched fields.

Credentials, connection URIs, query predicates/statements/values, cookies, request or response bodies, and personal identifiers remain excluded. More fields do not mean enabling raw database query logging. Regression fixtures verify the same attribute values survive MongoDB, MySQL, MariaDB and ClickHouse storage.

The controlled MySQL/MariaDB repositories now use the same request-scoped repository tracing contract. Their server/port/database come from the resolved mysql2 pool configuration, rather than environment-variable guesses (different repository defaults can differ). Multi-table or cached repository work is not falsely labeled as a particular SQL statement or execution plan. The detail panel normalizes both modern and legacy OpenTelemetry database fields, so third-party MySQL/MongoDB producers retain their more specific command/table/result metadata when supplied.

The inspector groups service/operation/type/timing, database target, HTTP context, code/error metadata and all raw attributes. Its interpretation is storage-independent. Missing query text, row counts, server-side plans or stack traces are never fabricated from a repository method name.
