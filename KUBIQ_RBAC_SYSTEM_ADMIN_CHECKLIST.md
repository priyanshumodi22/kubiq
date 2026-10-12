# kubiq RBAC and System Administration checklist

This is the live implementation and verification checklist for the kubiq RBAC and System Administration plan. An item is checked only after the implementation and its relevant local verification are complete on the `kubi` branch.

## 1. Foundation and migration

- [x] Audit current Native authentication, Keycloak, user, role, namespace, and authorization paths. Verified against all current storage adapters and auth middleware.
- [x] Replace the single-role user model with multiple role assignments. Verified persistence adapters, legacy fallback, and JSON migration test.
- [x] Create the permission catalogue and effective-permission resolver. Verified by focused unit tests.
- [x] Define built-in `kubiq-admin`, `kubiq-user`, and `kubiq-viewer` roles. Verified by focused unit tests.
- [x] Migrate existing users to role assignments without access loss. Verified JSON migration test plus idempotent MongoDB and MySQL startup migrations that preserve the legacy role as the first assignment.
- [x] Add database migrations, rollback strategy, and seed validation. Verified idempotent adapter backfills, legacy-user fixture, and documented preflight/rollback procedure in `RBAC_MIGRATION_AND_RECOVERY.md`.
- [x] Normalize kubi-specific UI copy, API paths, files, configuration keys, and identifiers to lowercase `kubi`. Verified user-visible assistant copy and API paths use lowercase `kubi`; conventional TypeScript type/class names and uppercase environment variables remain case-appropriate implementation identifiers.

## 2. Authorization enforcement

- [x] Replace hard-coded role checks with backend permission middleware. Verified service masking, notifications, Kubernetes visibility, kubi evidence, route guards, and focused backend tests.
- [x] Enforce namespace scopes before every telemetry query. Verified Kubernetes namespace guards, kubi namespace filtering, and an explicit allowed/denied boundary test.
- [x] Add permission checks for services, logs, APM, Kubernetes, database, audit, exports, and configuration. Verified router guards and focused category-permission tests.
- [x] Mask sensitive data unless the caller has the required permission. Verified database endpoints, notification credentials, and Kubernetes Secret read guards.
- [x] Remove Kubernetes scale, restart, delete, and apply capabilities for every role. Verified by API/client/component removal, backend build, and frontend type-check.
- [x] Protect last-active-admin and recovery access. Verified dedicated unit coverage blocks disable, deletion, and role removal for the final enabled `kubiq-admin` while allowing the operation when another active administrator exists.

## 3. Native authentication mode

- [x] Keep Native as a selectable deployment authentication mode. Verified a single selected provider is exposed to the client and Native endpoints reject use when Keycloak is selected.
- [x] Implement Native user create, update, disable, delete, password reset, roles, and namespace scopes. Verified route implementation, repository support, focused tests, and backend build.
- [x] Prevent Native and Keycloak login from being active together. Verified auth-provider selection in backend and frontend initialization with production builds.
- [x] Test Native login, token refresh, role changes, and disabled-user behavior. Verified controller-level login with persisted roles/namespaces, refresh reissuance from current persistence, and disabled-account rejection.

## 4. Keycloak authentication mode

- [x] Add secure Keycloak Admin API service-account configuration. Implemented server-only client-credentials configuration and verified its no-secret/no-call boundary plus authenticated client construction by local contract tests.
- [x] Verify Keycloak JWT issuer, audience, signature/JWKS, expiry, and client claims. Verified locally with a generated RS256 Keycloak-style token and mocked JWKS; a real-provider acceptance check remains in Section 7.
- [x] Implement Keycloak user search, create, edit, disable, delete, and password reset. Implemented through the server-only Keycloak Admin API adapter and provider-aware user routes; live provider acceptance remains in Section 7.
- [x] Create users with temporary passwords requiring first-login replacement. Implemented Keycloak temporary credentials and rollback cleanup for partially provisioned users.
- [x] Manage only `kubiq` client roles, never realm roles. Enforced in token parsing and all Admin API role-mapping paths.
- [x] Implement custom client-role synchronization. Implemented idempotent creation of missing custom client roles with no automatic deletion.
- [x] Implement user client-role assignment and revocation. Implemented minimal-diff client-role mappings without realm-role access.
- [x] Add Keycloak health, reconciliation, retry-safe recovery, and drift detection. Implemented server-only health status, safe provisioning cleanup, reconciliation, and unexpected-role reporting.
- [ ] Add authentication-provider migration preview, confirmation, execution, and rollback. Deferred with the Keycloak provider work at the user's request; Native migration guidance and rollback documentation are in place.

## 5. System Administration UI

- [x] Add admin-only `/kubiq/system` route and account-menu entry. Verified route and navigation use effective `system.access` permissions rather than a role-name check.
- [x] Build System Overview with authentication, kubi, Pro, health, warnings, and recent administrator actions. Verified live API-backed status cards and frontend production build.
- [x] Build Users management screen. Verified Native/Keycloak-aware listing, Native user creation, multi-role assignment, and enabled-status controls with frontend production build.
- [x] Build Roles and Permissions screen with categorized permission selection. Verified create/edit/delete custom-role controls, categorized selector, and frontend production build.
- [x] Build Authentication screen for Native/Keycloak mode and migration. Verified active-provider/Keycloak-health status plus audited Native/Keycloak deployment migration previews and rollback guidance in the frontend production build.
- [x] Move kubi provider/model/key settings from Profile to System Administration. Verified Profile retains only personal and security settings and System Administration hosts kubi settings.
- [x] Build System Configuration screen for supported platform settings. Verified monitored disk and APM exclusion load/save controls; notification management remains in its dedicated Notifications panel.
- [x] Build administrator Audit History screen. Verified embedded Audit History view uses `audit.read` effective permission rather than a role-name gate.
- [x] Remove system controls from Profile; retain personal settings and security only. Verified by frontend type-check and production build.
- [x] Verify desktop, tablet, and mobile layouts. Verified the authenticated System Administration UI at desktop, 768px tablet, and 390px mobile widths against the isolated local Native backend.

## 6. kubi permission integration

- [x] Require kubiq Pro and `kubi.use`. Verified by the protected kubi router chain and focused RBAC authorization tests.
- [x] Restrict kubi intents, clarification choices, evidence, citations, and answers by effective permissions. Verified focused kubi evidence, intent, and router tests with permission-based audit, logs, database, Kubernetes, and notification access.
- [x] Restrict kubi by namespace scope. Verified kubi namespace filtering and shared middleware scope-boundary tests.
- [x] Ensure kubi never reveals hidden data, unavailable features, or mutation capability. Verified read-only Kubernetes removal, permission-denied evidence, and focused kubi evidence tests.
- [x] Audit kubi permission denials and system-configuration changes. Verified the kubi permission-denial audit unit test and existing audited system configuration mutation routes.

## 7. Testing and release

- [x] Start the local frontend and backend with the deployed k3s ConfigMap and Secret configuration. Verified backend MongoDB connectivity, production service loading, `/api/health` HTTP 200, and frontend HTTP 200. Kubernetes telemetry remains unavailable locally without a kubeconfig.
- [x] Unit-test the permission resolver and every permission category. Verified built-in, multi-role, denial, sensitive, export, audit, Kubernetes, and configuration cases.
- [x] Test direct API denial for hidden UI routes and actions. Verified HTTP-level denial for viewer-crafted RBAC and system-management requests.
- [x] Test custom roles, multi-role users, namespace boundaries, and sensitive-data masking. Verified custom-role union, denied namespace boundary, and MongoDB endpoint masking.
- [ ] Test Native and Keycloak modes independently. Native is covered by local HTTP and browser acceptance; Keycloak live-provider acceptance is deferred.
- [ ] Test Keycloak provisioning failures and recovery. Deferred with the Keycloak provider work at the user's request.
- [x] Test kubi with admin, user, viewer, and custom roles. Verified `kubi.use` role admission for built-in and custom roles, with focused evidence tests showing viewer masking, admin-only audit/notification evidence, and a custom kubi role restricted to its explicit service-only scope.
- [x] Run authenticated desktop and mobile acceptance tests. Verified Native login to the dashboard plus System Administration and categorized custom-role UI on local desktop, then reloaded the authenticated administration UI at tablet and mobile widths.
- [x] Review security, audit trails, migration behavior, and rollback. Verified backend and frontend production dependency audits have zero high/critical findings; Native public self-registration is disabled in favor of audited administrator provisioning; production rejects a missing Native JWT secret; and migration/rollback guidance was reviewed. Keycloak live-provider migration remains explicitly deferred.
- [ ] Deploy only after the full RBAC acceptance matrix passes. Not authorized or eligible while the deferred Keycloak provider-migration and live-provider acceptance gates remain open.
