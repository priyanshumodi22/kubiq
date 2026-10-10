# kubi — end-to-end implementation plan

## Summary

Build **kubi**, kubiq’s mobile-responsive Pro AI assistant. kubi answers manual operational questions using only the authenticated user’s permitted kubiq telemetry. It streams answers, shows evidence cards, retains private per-user history for 90 days, and uses the deployment’s existing BYOK AI provider configuration.

kubi is strictly read-only: no service onboarding, notification changes, scaling, restarts, YAML application, secret access, terminal access, or autonomous investigations.

## Core implementation

- Create a shared backend `KubiProviderService` for Gemini, OpenAI, and Anthropic using existing `AI_PROVIDER` and `AI_API_KEY` configuration.
  - Support provider-native tool calling and streamed output.
  - Refactor existing log summarization and Kubernetes diagnosis to use it while preserving current behavior.
  - Never expose provider keys or make browser-to-provider requests.

- Add protected `/api/kubi` endpoints:
  - `GET /status` — Pro/license/provider/feature readiness, with no secrets.
  - `POST /conversations` — create a conversation for the authenticated user.
  - `GET /conversations` and `GET /conversations/:id` — retrieve only the caller’s history.
  - `POST /conversations/:id/messages` — authenticated streamed `status`, `answer_delta`, `evidence`, `done`, and `error` events.
  - `DELETE /conversations/:id` and `DELETE /conversations` — delete one or all of the caller’s history.

- Add `KubiOrchestrator`:
  - Validates Pro license and configured provider for every question.
  - Selects only approved server-side read tools, builds bounded/redacted evidence, then requests the final answer from the provider.
  - Uses a hard tool allowlist; kubi cannot invoke arbitrary APIs, URLs, shell commands, queries, or Kubernetes commands.
  - Limits one active question per user, six tool calls per question, 50 records per tool, 48 KB maximum provider context, and a 60-second timeout.
  - Audits that a kubi question occurred without storing raw prompt or telemetry content in audit logs.

## Read-only capabilities

| Area | kubi can answer |
|---|---|
| Services | unhealthy services, uptime, historical status, recent incidents |
| Logs | bounded log searches by service/time/severity and pattern analysis |
| APM | slow/error traces, dependency paths, trace-to-log correlation, service map |
| Database work | slow database spans by service/time/database; raw SQL visible only to admins |
| Kubernetes | pods, events, deployments, nodes, workloads, storage, quotas, metrics, services/endpoints, and namespace/pod/container log investigation |
| System | health, disk and resource trends, APM readiness |
| Notifications | notification history only |
| Audit | administrator-only audit timeline questions |

Kubernetes log investigation includes permitted pod-log searches and bounded recent log tails by namespace, pod, and container. This lets users ask questions such as “why is this pod restarting?”, “show the errors from this deployment during the last hour,” or “do these Kubernetes events match the pod logs?”

Safeguards:

- Add a structured trace-repository method for slow database span lookup; kubi must not scrape the CSV export endpoint.
- Add bounded Kubernetes pod-log retrieval/search tooling that always applies existing namespace/RBAC access controls.
- Reuse existing namespace/RBAC rules for all Kubernetes tools.
- Exclude Secrets, pod terminal, raw YAML, ConfigMap values, service-check execution, notification writes/tests, and every Kubernetes mutation endpoint.
- Redact configured sensitive fields and common credential patterns before telemetry reaches the AI provider, including Kubernetes pod logs.
- Normalize/redact SQL literals before provider use; raw SQL remains an administrator-only product display capability.
- Show evidence cards that link back to the relevant kubiq page/filter, including the relevant Kubernetes workload, event, or logs view.
- kubi may provide diagnosis and safe next checks, but never restart/scale workloads, change notifications, apply manifests, or generate instructions for excluded actions.

## Persistence, UI, and configuration

- Add `IKubiConversationRepository` with MongoDB, MySQL/MariaDB, and JSON adapters.
  - Store sanitized visible messages, title, owner, timestamps, expiry, and safe evidence references only.
  - Never store raw telemetry payloads, provider requests, provider responses beyond the user-visible answer, or unredacted prompts.
  - MongoDB uses an `expiresAt` TTL index; MySQL and JSON perform expiry cleanup.
  - Enforce 90-day retention plus immediate delete-one and clear-history controls.

- Add kubi globally through the authenticated `Layout`.
  - Desktop right-side panel and accessible full-screen mobile drawer.
  - “Ask kubi” trigger, suggested questions, streamed progress, markdown-safe answers, evidence cards, retry states, conversation list, and history deletion.
  - Show clear Pro-required and provider-not-configured states.
  - Preserve current dashboard pages, AI log summaries, and Kubernetes diagnosis controls.

- Add deployment configuration:
  - `AI_KUBI_ENABLED=true`
  - `AI_KUBI_HISTORY_RETENTION_DAYS=90`
  - `AI_KUBI_MAX_TOOL_CALLS=6`
  - bounded result/context/timeout environment settings.
  - Keep `AI_API_KEY` only in the existing Kubernetes Secret.
  - Keep model/provider selection deployment-managed, with optional `AI_MODEL` override.

## Verification and rollout

- Backend tests:
  - Pro/provider gates, authentication, conversation ownership, expiry, deletion, and audit metadata.
  - tool allowlist enforcement, namespace/RBAC filtering, Kubernetes pod-log bounds, secret redaction, SQL admin boundary, and rejection of all mutation attempts.
  - mocked Gemini/OpenAI/Anthropic streamed provider behavior.
  - MongoDB, MySQL/MariaDB, and JSON conversation repository behavior.
  - slow-trace lookup plus trace/log, Kubernetes-event, and pod-log evidence construction.

- Frontend tests:
  - global trigger, streamed answer rendering, evidence links, errors/retry, history deletion, keyboard access, and mobile drawer behavior.

- Update CI to run backend/frontend linting, tests, TypeScript builds, and Docker build before Flux receives an image.

- Production acceptance:
  - verify health and authenticated kubi status;
  - test services, logs, APM, trace-to-log, Kubernetes workload/event/pod-log questions, and administrator-only slow-query questions;
  - confirm viewers cannot retrieve unavailable namespaces, pod logs, or SQL;
  - confirm history excludes raw telemetry;
  - verify desktop/mobile kubi behavior;
  - verify existing AI summaries and Kubernetes diagnosis still work.

- Rollback is safe: no destructive migration is required. Reverting the image/commit disables kubi while any stored kubi history remains isolated and ignored by the previous release.

## Assumptions locked

- kubi is manual-question-only, telemetry-only, and BYOK.
- kubi is entirely under the kubiq Pro license/paywall; UI gating is backed by mandatory server-side Pro-license enforcement for every `/api/kubi` request.
- No billing cap is imposed; operational bounds protect kubiq.
- Answers stream live and include evidence cards.
- History is per user, expires after 90 days, and users can delete it immediately.
- `kubi` is used everywhere for the AI assistant: UI, backend classes, files, endpoints, database interfaces, environment variables, audit events, tests, and documentation.
- kubiq is always written with a lowercase `k`.
