# kubiq MongoDB installation and migration runbook

## Current boundary

Production kubiq now uses the authenticated MongoDB on priyanshu-k3s. The final Atlas copy was taken during an approved write pause, verified off the VM, restored and checked before reopening public traffic. Atlas remains intact as the frozen pre-cutover source; it is not a live replica after the switch. Application signing/encryption credentials were preserved.

Only the `kubiq` database is in scope. Other databases in the shared Atlas cluster are not migrated. Version: Community Server 8.0.34, matching the source version, pinned by image digest. MongoDB Database Tools: 100.19.1. The source scan found no application MongoDB transactions, change streams or Atlas Search dependency; ordinary MongoDB text indexes remain supported.

## Installation

- Namespace mongodb-system; one StatefulSet replica, private ClusterIP, no Ingress/NodePort/public database port.
- CPU request/limit 100m/500m; memory request/limit 512Mi/768Mi; WiredTiger cache 0.3 GiB; index-build memory 50 MiB.
- 10 GiB local-path PVC using a dedicated Retain storage class, plus StatefulSet claim retention. This is existing boot-disk capacity, not a new billable disk. Local-path PVC size is NOT an enforced disk quota.
- Authentication enabled. `kubiq_admin` is the administrator; `kubiq_app` has readWrite on kubiq plus collMod only on apmspans/logs for retention changes; `kubiq_backup` has read access only to kubiq.
- Credentials are Kubernetes Secrets and root-only `/etc/kubiq-mongodb/credentials.json`; an owner/SYSTEM-only Windows copy is at `D:/PriyanshuGCP/Private/MongoDB/credentials.json`. Never paste them into tickets, Git, screenshots or CLI arguments.
- Private app URI includes authSource=kubiq, retryWrites=false for this standalone server, directConnection=true and maxPoolSize=10. A separate target Secret, kubiq-system/kubiq-mongodb, is referenced explicitly by the live deployment.
- NetworkPolicy permits MongoDB ingress only from kubiq-labelled Pods in kubiq-system or operations-labelled Pods in mongodb-system. An unrelated default-namespace connection was rejected; the existing kubiq Pod reached the authenticated target successfully.
- The VM kernel is Ubuntu 7.0.0-1011-gcp, with upstream signature 7.0.14. The MongoDB image's kernel guard initially rejected it. `GLIBC_TUNABLES=glibc.pthread.rseq=1` selects the compatible non-per-CPU allocator path used by MongoDB's upstream regression test. Server status confirms usingPerCpuCaches=false; no binary/kernel check was patched. Reassess with a future maintenance image before removing this setting.

References: https://jira.mongodb.org/browse/SERVER-125742 and https://github.com/mongodb/mongo/blob/v8.0/jstests/noPassthrough/rseq_linux_compatibility/rseq_kernel_compatibility_check.js

GitOps source is cluster/mongodb with a separate flux-system/kubiq-mongodb Kustomization. Pruning is disabled for stateful infrastructure. Its bootstrap declaration is also stored in the VM's k3s manifests directory. Never delete the namespace, PVC, retained PV or its backing directory as a cleanup shortcut.

`bootstrap.py` creates initial secrets without printing values and refuses to regenerate passwords when an existing MongoDB PVC is present. On initialized data, changing bootstrap environment variables does not change MongoDB account passwords; rotate inside MongoDB first and update matching Secrets together.

## Rehearsal and compatibility checks

The rehearsal dumps BSON and metadata from Atlas, restores only kubiq, dumps the target again and compares every BSON file hash plus normalized index definitions and collection options. Index list order is ignored; compound-index key order, uniqueness, TTL and other options are preserved. MongoDB collection UUIDs can change; document identifiers and BSON types must match byte-for-byte.

TTL is paused only on the new target during comparison and resumed in a trap. The source remains online, so this rehearsal is not a transactionally consistent final backup across collections. A fresh copy after pausing source writes is mandatory at cutover.

`rehearse.sh` is destructive to the STAGING target kubiq database. It requires `KUBIQ_STAGING_RESTORE_CONFIRMED=yes`; verify production still uses Atlas before setting that flag. Never run it against a live migrated target. It never drops the Atlas database or admin user database.

`compatibility.cjs` bundles and exercises the nine actual compiled MongoDB adapters against the target from the existing kubiq Pod. It checks users/services/passkeys/conversations/settings, native retention initialization, and disposable trace write/read/cleanup. The retained compatibility bundle is tied to main-157; rebuild it from the matching compiled backend before testing a later application image. It does not start another service monitor, send notification emails, or replace production. No claim is made that a real user's UI login or passkey ceremony was tested against a switched production deployment yet.

## Backups and recovery

Daily VM systemd timer: kubiq-mongodb-backup.timer, 02:00 IST plus up to five minutes jitter, Persistent=true. It runs on the always-on k3s VM, independently of the PC and the on-demand Sonar VM. Code is under /opt/kubiq-mongodb; service status under /var/lib/kubiq-mongodb/last-backup.json.

The runner creates a short-lived, bounded tools Pod using only the database read account. It writes a gzip MongoDB archive, validates the gzip stream, uploads to `gs://priyanshu-apps-sonarqube-backups/kubiq-mongodb/backups/` and verifies a streamed readback SHA-256. Local archives older than two days are removed; the existing private bucket lifecycle removes objects after 30 days. Backups are data backups, not atomic point-in-time replicas during live writes. Preserve kubiq-runtime independently: its encryption/signing/API credentials are necessary to use the restored application settings.

Approved backup identity: kubiq-mongodb-backup@priyanshu-apps.iam.gserviceaccount.com. Its only added permissions are objectCreator and objectViewer on the existing bucket, conditional on the kubiq-mongodb/ object prefix. No bucket-wide listing or other backup-prefix reads are granted. The key is root-only `/etc/kubiq-mongodb/backup-service-account.json`; the temporary Windows provisioning copy was removed. Rotate this key under the owner's credential policy and revoke it when decommissioning.

The VM's existing metadata identity remains read-only for Storage. The uploader obtains its dedicated identity's token privately and uses known-object JSON API upload/readback; it never broadens bucket permissions just to satisfy CLI listing. Tokens and passwords are not logged.

A real off-VM backup restore is tested into the disposable kubiq_restorecheck_20261027 database. Verify BSON hashes/index metadata, then remove the temporary database and restore TTL. The live kubiq database is not overwritten by this restore check. Evidence is in restore-verification.json. Routine backup verification is checksum-based; a fresh archive is not marked restore-tested until it actually passes a restore test.

Single VM / boot disk remains a single point of failure. This configuration is not HA. Keep disk/RAM monitoring and retention enabled; limits and a PVC request do not guarantee every concurrent peak will fit on a 4 GiB host.

## Final cutover procedure (approved and completed on 27 October 2026 IST)

1. Recheck node capacity, MongoDB authentication, off-VM backup and restore evidence, current Atlas connection and exact live kubiq image. Keep the current image and runtime Secret. Do not change JWT keys, native-auth encryption keys, ingestion token, URLs, RP IDs or stored IDs.
2. Agree on the brief maintenance/write pause. Suspend ONLY the application Kustomization, drain/stop kubiq gracefully and scale its deployment to zero. Keep MongoDB's Kustomization, tunnel and other apps running. Confirm there are no remaining writers to the source kubiq database. Account for telemetry clients during the unavailable window.
3. Run a fresh final Atlas BSON dump. Record counts, metadata and hash. Upload and verify this final archive off the VM. Do not reuse the earlier rehearsal snapshot.
4. With target-only TTL paused, restore ONLY kubiq from that final dump. Never restore/drop admin or other Atlas databases. Compare every collection's BSON, indexes and options before resuming target TTL. Ensure application and backup credentials still work.
5. Commit the reviewed `cutover-patch.yaml` env entry into the active deploy/kubernetes/kubiq-system.yaml manifest. This explicit Secret reference overrides only DB_URI; kubiq-runtime's original Atlas URI remains available for controlled rollback. Never rely on a direct live patch that Flux would undo.
6. Resume the application Kustomization and verify the new exact Git revision and Ready rollout, using the existing production image. Confirm DB_URI resolves to the new private target without printing the value.
7. Verify existing login, passkeys, RBAC, service history/checks, licensing, kubi settings, notification configuration, APM/log ingestion and retention. Send only disposable telemetry fixtures and remove them. Verify public routes, protected APIs and backup service. Then end maintenance.
8. Keep Atlas intact through the observation period. The old database will become stale after new writes begin; do not delete it as part of this cutover.

Rollback before new target writes can restore the original URI through GitOps. After ANY target writes, do not blindly switch to the stale Atlas copy: pause writes again and reconcile/copy the authoritative target changes before choosing the database. Record the rollback decision and preserve both backups.

## Access from your PC

Use the SSH tunnel and Compass URI in the protected credentials file. Keep the SSH session open. The tunnel binds localhost:27018 and forwards to the cluster's private MongoDB service; no public MongoDB firewall port is opened. Localhost connection credentials remain separate from kubiq application login credentials.

## Installation acceptance — 27 October 2026 IST

All 11 collections and 1,258 documents matched the rehearsal BSON dump and index definitions. All nine real MongoDB adapters passed, including the 3 users, 6 services, 4 passkeys and 6 conversations. Authentication denials, limited retention privileges, namespace isolation, post-restart persistence and an actual off-VM restore passed. The headless systemd service completed successfully and the daily timer is active. Temporary migration resources and its extra Atlas source Secret were removed. Production still uses Atlas; final cutover has not been performed. See installation-verification-20261027.json.

## Production cutover acceptance - 27 October 2026 IST

The source was rechecked after the handoff. A service-monitor update detected during the first handoff was included in a refreshed final copy with kubiq stopped, followed by a second source stability check. The final 11-collection / 1,258-document dump matched the target BSON and indexes. Public traffic reopened only after authenticated APIs passed. All three existing enabled accounts passed server-side Native token/account lookup; users, services and audit reads returned 200. Actual user-entered password/passkey ceremonies were not performed by this automated check. Password hashes, passkey BSON and their original signing/origin configuration were preserved.

Real HTTP APM and log ingestion returned 202; unauthenticated requests returned 401. Fresh records were retained, expired records were removed under the 3-day/7-day TTL policies, and fixture cleanup passed. kubiq remains on main-157; the only application deployment setting changed was its DB_URI Secret reference. The original kubiq-runtime Secret remains unchanged. See cutover-verification-20261027.json.
