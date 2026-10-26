# kubiq on the Priyanshu k3s node

This is the production setup for `https://priyanshumodi.in/kubiq`.

- Namespace: `kubiq-system`
- Ingress: the bundled k3s Traefik ingress controller
- Delivery: GitHub Actions builds and publishes the image; FluxCD in k3s
  watches Git and Docker Hub, commits the elected image tag, then reconciles it
- Database: authenticated MongoDB 8.0.34 in `mongodb-system`, reached through a private ClusterIP; `DB_URI` is explicitly supplied by the `kubiq-mongodb` Secret.
  The original Atlas URI remains unused in `kubiq-runtime` for controlled recovery; changing that old URI does not switch the live database.
- Telemetry: MongoDB-backed APM is enabled with 3-day retention; ingested logs use 7-day retention. ClickHouse is not required for this deployment.
- Kubernetes access: read access and guarded namespace-scoped operations follow the RBAC in the manifest and kubiq user permissions.

Before the first apply, create `kubiq-runtime` from the example using values
that never enter Git. FluxCD's `kubiq-gitops.yaml` requires a dedicated GitHub
deploy key stored only as the `flux-system/kubiq-git-auth` Kubernetes Secret.
No GitHub Action has SSH access to the VM.

Before rolling out authenticated telemetry/APM ingestion, add
`KUBIQ_INGESTION_TOKEN` to the live `kubiq-runtime` Secret first. Then update
the Fluent Bit DaemonSet and OTLP/Zipkin clients with `Authorization: Bearer
<token>`, and only then roll out the backend. This order prevents agent pod
startup failures and avoids a gap in log or trace ingestion.

The public hostname cannot be switched until the Portfolio is also behind this
same Traefik ingress, because Cloudflare DNS cannot route only `/kubiq` while
the root hostname still points to Vercel.

## Self-hosted MongoDB migration

The production switch completed on 27 October 2026 IST using the existing main-157 application image. The final Atlas BSON copy was verified after pausing writes, and the application signing/encryption secrets, users, roles, passkeys and stored identifiers were preserved. MongoDB credentials are separate from kubiq login credentials.

Follow [the MongoDB runbook](../../ops/mongodb/README.md) for bootstrap Secrets, private access, daily off-VM backups and restore instructions. Provision the MongoDB and application connection Secrets before starting a fresh deployment. The retained Atlas copy becomes stale after production writes to the new database; do not blindly point the application back to it.
