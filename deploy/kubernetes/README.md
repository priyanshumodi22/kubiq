# Kubiq on the Priyanshu k3s node

This is the production setup for `https://priyanshumodi.in/kubiq`.

- Namespace: `kubiq-system`
- Ingress: the bundled k3s Traefik ingress controller
- Delivery: GitHub Actions builds and publishes the image; FluxCD in k3s
  watches Git and Docker Hub, commits the elected image tag, then reconciles it
- Database: the private MongoDB URI stored in the `kubiq-runtime` Secret
- Logs: live pod-streaming only; ClickHouse/APM/history collection and the pod shell are disabled
- Kubernetes access: read-only plus `pods/log`; no exec, apply, delete, scale, or Secret access

Before the first apply, create `kubiq-runtime` from the example using values
that never enter Git. FluxCD's `kubiq-gitops.yaml` requires a dedicated GitHub
deploy key stored only as the `flux-system/kubiq-git-auth` Kubernetes Secret.
No GitHub Action has SSH access to the VM.

The public hostname cannot be switched until the Portfolio is also behind this
same Traefik ingress, because Cloudflare DNS cannot route only `/kubiq` while
the root hostname still points to Vercel.
