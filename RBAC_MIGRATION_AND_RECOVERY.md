# kubiq RBAC migration and recovery

## Migration contract

At repository initialization, each existing user receives `roles` when it is missing or empty. The prior `role` value becomes the first entry; a record with neither value receives `kubiq-viewer`. The original `role` field remains during this compatibility release, so a rollback to a previous application version does not lose access.

The JSON adapter writes normalized records through its repository save path. MongoDB and MySQL use idempotent startup backfills: they only update records without a non-empty `roles` value. Re-running a deployment cannot duplicate role assignments.

## Before deployment

1. Take a database snapshot, or copy `users.json` for JSON storage.
2. Record currently active `kubiq-admin` identities and verify at least two enabled administrators before broad administration changes.
3. Start the new backend against a copy or staging database, then verify the seed/migration test and an administrator login.
4. Check `/api/auth/me` for `roles` and `/api/rbac/roles` as an administrator.

## Native authentication hardening

Public self-registration is disabled. New Native accounts must be created through the audited Users administration API by an identity with `users.manage`. In production, Native authentication requires a configured JWT secret; the service fails the affected authentication flow safely instead of silently using a development fallback. Store that secret only in the deployment secret manager, rotate it through the normal change process, and verify an administrator can still authenticate after rotation.

## Rollback

If a rollout fails, restore the pre-deployment snapshot and redeploy the previous image. The legacy `role` field is retained, so an application-only rollback remains safe after migration. Do not edit role arrays by hand during a failed rollout: restore the snapshot and retain audit history for investigation.

## Keycloak recovery

The Keycloak Admin API service account is server-only. User creation removes a partially-created account when credential or role assignment fails. Client-role reconciliation only creates missing custom `kubiq` client roles and reports unexpected roles; it never deletes them automatically. An administrator must review reported drift before deliberately deleting a role.
