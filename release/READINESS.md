# Release readiness: local fixes

Branch: `fix/release-readiness`; based on GitHub main `6ae348c784b73db786b464197a2763bbb28b49ce`.
No UI animation changes, merge, push, publication or deployment. `frontend/src` is unchanged.
The divergent local main/login fix is preserved; the newer upstream login already fixes the footer.

## Changes
- Service list/status/SSE/detail/create/update responses redact connection passwords for all roles.
  Database endpoints remain hidden entirely when database.read is absent.
- Saving an unchanged masked endpoint retains the server-side credential. Altered masked endpoints
  fail with a kubiq form error until a complete replacement is supplied. Storage is not mutated by reads.
- Custom-check endpoint diagnostics redact URL passwords too.
- Updated HTTP/parser/system dependencies; pinned DOMPurify 3.4.17 and Jaeger propagator 2.12.0.
  Pinned the existing Jest/ts-jest versions and explicit peer imports after newer Jest type definitions
  broke pre-existing test mocks; no production behavior depends on those test-only pins.
- Removed Node 18 pkg configuration. Linux ZIP jobs now package Node 22, the ncc application,
  external tracing runtime, public assets, license, explicit example config and a relocatable launcher.
  No developer backend/.env is copied. Linux glibc compatibility is documented in the bundle.
- Architecture validation, fresh-output guard, --check/--version, and disposable JSON-storage HTTP smoke
  checks run before release uploads. The launcher loads .env before tracing bootstrap.
- Expanded application verification path filters and added a high/critical production-audit gate.
  Exact-commit CI/Sonar gates remain enforced, without bypasses.
  Manual application verification now defaults to verification-only (publish_image=false), so it can
  approve the exact main head without an image-update bot commit moving that head again.
  Deployment requires explicitly opting into publish_image=true.

## Local verification
- Frontend: 413 tests, lint and TypeScript/Vite production build passed.
- Backend: 512 tests and TypeScript build passed. Existing lint: 0 errors, 382 warnings.
- 25 package/release/policy unit tests passed; workflow YAML and JavaScript syntax parsed successfully.
- Installed production tracing runtime: 8 tests passed with overridden propagator dependency.
- Real request/child-span log-context fixture passed (exported spans match retained/stdout events).
- Real HTTP/Socket.IO Kubernetes log transport fixture passed, including replacement pods, permission
  revocation, namespace boundaries, completed Jobs and cleanup.
- ncc production bundle built successfully.
- Local release preview: localhost:3002/kubiq (backend 3003), authorized MongoDB/Kubernetes forwards.
  Card and edit input verified masked, no production configuration save performed.
  At widths 390, 768 and 1440: no document horizontal overflow; footer below main.
- Final ncc bundle under local WSL Ubuntu x86_64: official Node 22.23.4 SHA256 verified;
  --check, --version, HTTP readiness and public frontend passed with disposable JSON storage.
  No production database used for this smoke test. Final artifact: D:/PriyanshuGCP/Private/kubiq-local-layout/linux-review.0KTViB/bundle.
- Linux Sonar operations suite: 12 tests passed under WSL Ubuntu (the earlier Windows fcntl limitation is resolved).

## Dependency audit scope and remaining findings
Audited locked production dependency graphs (npm audit --omit=dev); not a full exploitability proof.
All three high/critical audit gates pass. The moderate review is complete for the application scope:
frontend 0, backend 42 and tracing 42 graph findings. The latter graphs repeat the same two
OpenTelemetry advisories. [DEPENDENCY-REVIEW.md](DEPENDENCY-REVIEW.md) records four patched
advisories and the two tested, narrowly scoped non-reachability assessments. The machine-readable
assessment expires 2026-12-02; CI rejects unknown findings, elevated severity, SDK/scope drift,
incomplete audit data or expired assessments. No findings are hidden from the output.

The Docker image and application CI now use supported Node 22, matching the tested Linux bundles.
The unchanged standalone SDK/auto entry point is explicitly outside this assessment. Its next
publication needs a separate migration/review.

NPMScan enrichment reported no KEV-listed finding; this does not make an advisory harmless. Flagged-package
maintainer/provenance checks found no source/provenance mismatch. OpenTelemetry has recent legitimate
co-maintainer additions (low signal); its selected propagator publication has matching official provenance.

Updated package references:
- [DOMPurify 3.4.17](https://npmscan.com/package/dompurify)
- [follow-redirects 1.16.2](https://npmscan.com/package/follow-redirects)
- [body-parser 2.4.0](https://npmscan.com/package/body-parser)
- [joi 17.13.9](https://npmscan.com/package/joi)
- [systeminformation 5.33.19](https://npmscan.com/package/systeminformation)
- [Jaeger propagator 2.12.0](https://npmscan.com/package/%40opentelemetry%2Fpropagator-jaeger)

## Release checklist
- [x] Base release branch on current GitHub main without importing motion work.
- [x] Fix password output and prove safe edits using disposable HTTP fixtures.
- [x] Remove high/critical production dependency findings; document remaining moderate findings.
- [x] Replace obsolete Linux packaging with supported runtime and smoke-test gates.
- [x] Run frontend/backend builds, tests and local masked-UI checks.
- [x] Review moderate dependency findings: four patched; two application-scoped assessments verified and guarded until 2026-12-02 (standalone SDK excluded).
- [x] Verify local AMD64 execution and ARM64 execution under QEMU (see ARM64-VERIFICATION.md).
- [ ] Run the complete ARM64 CI build/ZIP workflow before publication.
- [x] Run Linux-only Sonar operations tests under WSL: 12 passed.
- [ ] Review/merge the release branch and reconcile local main with upstream, preserving login fix.
- [ ] Obtain exact-final-commit application verification and fresh Sonar proof on main.
- [ ] Choose release version/changelog, smoke deployed candidate, publish only after approval.

## Local runtime limitation
The duplicate local monitor and retention sweeps are disabled using a worktree-specific preload.
The local PC initially had no Docker command. WSL Ubuntu required a startup retry; Linux tests use an
independently checksum-verified official Node 22 runtime and task-owned temporary storage.

ARM64 user-mode execution passed locally with Node 22.23.4 and QEMU aarch64 10.2.1. This is an emulated execution check, not native hardware or full cross-architecture build proof.

After the moderate dependency updates, AMD64 and emulated ARM64 bundle smoke checks passed again, as did both installed-runtime boundary checks and the real LogStreamService glob check under Node 22.23.4. The changed Docker image still requires its normal CI image build before release.
