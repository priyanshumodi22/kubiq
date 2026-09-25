# Kubiq Master Implementation Plan (V4)

This master plan synthesizes our recent architectural decisions into a single, prioritized execution roadmap. It combines the **AI Cost Optimization Strategy** with the massive **Kubiq Pro (ClickHouse) Architecture Upgrade**.

---

## 🛑 CLARIFICATION: The Hybrid Database Model
To be absolutely clear, **ClickHouse does NOT replace MongoDB.** ClickHouse is a specialized time-series database. It is terrible at managing users, passwords, or configs. 

For **Kubiq Pro** users running both databases, the architecture splits the data like this based on your collections:
- **MongoDB (Core App Data):** `users`, `passkeys`, `services`, `systemconfigs`, `systempreferences`, `notifications`.
- **ClickHouse (High-Volume Telemetry):** `logs`, `apmspans`, `systemmetrics`.

---

## 📈 NEW: The Pod Metrics Strategy (CPU/Memory)
*Based on the brilliant fallback strategy for live resource trends.*

**For Free Tier (No ClickHouse):**
- **Architecture:** "Live Mode Only". 
- Metrics (CPU/RAM) are fetched live from the K8s API and stored purely in the **Browser LocalStorage / React State** for a 1-hour rolling window.
- **Why:** Costs zero database space. Acts perfectly as a live debugging dashboard.

**For Pro Tier (With ClickHouse):**
- **Architecture:** "Historical Metrics Mode".
- The Kubiq Agent (DaemonSet) continuously scrapes `kubelet` metrics and pushes them to ClickHouse.
- **Why:** Users can view historical CPU/Memory spikes from 7 days ago, matching industry standards like Datadog and Prometheus.

---

## Phase 1: AI Response Caching (Immediate Priority)
*Goal: Stop burning OpenAI credits on redundant summaries by implementing an in-memory cache.*

**Execution Steps:**
1. **Install Dependencies:** `npm install node-cache` in the backend.
2. **Create Service:** Build `src/services/AICacheService.ts` to manage in-memory storage with a strict 4-hour TTL.
3. **Update Summarization Route:** Modify `POST /api/logs/summarize` to check the cache for the requested 15-minute time bucket.
4. **Discoverability:** Build a glowing UI banner in `K8sLogViewer` and `LogViewer`.

---

## Phase 2: Database Abstraction Layer (The Hybrid Setup)
*Goal: Prepare the Kubiq backend to write Telemetry data to ClickHouse while keeping Core data in MongoDB.*

**Execution Steps:**
1. **Refactor Repositories:** Ensure all log/span insertions go through abstract interfaces (`LogRepository`, `ApmRepository`).
2. **ClickHouse Adapters:** Create `src/database/adapters/clickhouse/ClickhouseLogRepository.ts`.
3. **Environment Routing:** Implement logic in `DatabaseFactory` to route Telemetry queries to ClickHouse if `DB_TYPE=clickhouse`.

---

## Phase 3: The Continuous Ingestion Pipeline (Kubiq Pro)
*Goal: Build the endpoints required to receive 24/7 continuous logs and metrics from external DaemonSet agents.*

**Execution Steps:**
1. **OTLP/HTTP Receiver:** Create a new highly optimized backend route (e.g., `POST /api/v1/telemetry/ingest`).
2. **Batching Service:** Build `IngestionBufferService.ts` to buffer incoming telemetry for 1-2 seconds in memory before bulk inserting.

---

## Phase 4: The Kubiq Agent (DaemonSet)
*Goal: Provide the industry-standard edge collector for Kubernetes so the Kubiq backend doesn't crash.*

**Execution Steps:**
1. **Select the Agent:** We will use **FluentBit** or **OTEL Collector** (industry standards for lightweight K8s telemetry).
2. **Create the Manifest:** Write a `kubiq-agent.yaml` Kubernetes DaemonSet configuration file that collects node logs and metrics, posting them to the Kubiq backend.

---

## User Review Required

> [!IMPORTANT]
> The Pod Metrics fallback strategy is now officially integrated into the master plan!
> 
> **Which Phase do you want to execute first?**
> 1. Should we knock out **Phase 1 (AI Caching)** to save costs immediately?
> 2. Or skip straight to **Phase 2 (ClickHouse Integration)**?
