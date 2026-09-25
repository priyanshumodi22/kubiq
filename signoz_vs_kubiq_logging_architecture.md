# SigNoz vs. Kubiq: Log Management Architecture Analysis

This report analyzes how industry-standard observability tools (specifically **SigNoz**) handle continuous log collection, compares it to Kubiq's current architecture, and proposes an implementation plan for upgrading Kubiq to a production-grade continuous log aggregator.

## 1. How SigNoz Handles Logs (The Industry Standard)

After deeply analyzing the `signoz` repository (specifically their `deploy/docker` and `otel-collector-config.yaml`), their architecture is crystal clear: **SigNoz does not pull logs; it receives them via OpenTelemetry.**

### Architecture Breakdown
1. **The Ingestion Layer (`signoz-otel-collector`):** 
   Instead of writing custom backend workers in Go/Node.js to read files, SigNoz deploys a customized **OpenTelemetry (OTEL) Collector**. It listens on standard OTLP ports (`4317` gRPC / `4318` HTTP).
2. **The Pipeline:** 
   ```yaml
   logs:
     receivers: [otlp]
     processors: [batch]
     exporters: [clickhouselogsexporter]
   ```
   Logs pushed from the user's infrastructure hit the `otlp` receiver, are grouped by the `batch` processor (to avoid DB spam), and are written directly to the database.
3. **The Database (ClickHouse):** 
   SigNoz uses **ClickHouse**, a columnar database heavily optimized for massive scale time-series and log ingestion. It easily outperforms MongoDB for continuous logging.
4. **The "Agent" (User Responsibility):**
   SigNoz expects the user to deploy their own agents (like FluentBit, Promtail, or a local OTEL Collector) on their application servers. These agents continuously tail the log files and push them to SigNoz's OTLP port.

---

## 2. Kubiq's Current Architecture (On-Demand)

Currently, Kubiq acts as a **Pull-Based, On-Demand Viewer**:
- **WebSocket Driven:** The `LogStreamService` and `KubeLogStreamService` only attach file/Kubernetes watchers when a user opens the Kubiq dashboard.
- **Node.js Buffer:** Logs are buffered in memory (`LogRetentionService`) and written to MongoDB.
- **When tab closes:** The watchers are destroyed, and logging stops.

> [!TIP]
> **Why this is currently great for you:** Because you are on a 512MB MongoDB free tier, this on-demand architecture prevents your database from crashing in minutes.

---

## 3. The Kubiq Pro Roadmap (Continuous Logging)

To compete with tools like Datadog and SigNoz for production users with dedicated databases, Kubiq needs a continuous ingestion pipeline. I propose a hybrid approach tailored to Kubiq's strengths:

### Option A: The OpenTelemetry Standard (Recommended for Production)
Just like SigNoz, we expose an OTLP-compatible endpoint on the Kubiq backend (e.g., `/api/v1/logs/otlp`).
- Production users configure their existing agents (FluentBit, OTEL Collector) to push logs to Kubiq.
- Kubiq batches them and writes them to the database.
- **Pros:** Zero custom agents to build. Fully compliant with modern industry standards.

### Option B: The Native Background Worker (The Easy/Integrated Way)
We build a dedicated continuous background worker inside the Kubiq backend `LogStreamService`.
- When Kubiq boots, it reads the users configured Kubernetes clusters and log paths.
- It automatically spawns background file watchers (`chokidar`) and K8s stream listeners that run 24/7.
- **Pros:** Incredible "plug-and-play" experience. The user just installs Kubiq, clicks a button, and continuous logging starts instantly without deploying external FluentBit agents.

---

## 4. My Recommendation for Implementation

> [!IMPORTANT]
> **I recommend implementing Option A (OTLP Receiver) for APM/Application Logs, and Option B (Background Worker) for Kubernetes Logs.**

Kubiq's main selling point is its **simplicity**. If we force users to deploy and configure FluentBit just to get Kubernetes logs (like SigNoz does), we lose our competitive edge. 

**The Proposed Implementation Plan:**
1. **Database Upgrade:** Warn users that enabling Continuous Logging requires a dedicated database (MongoDB Atlas Dedicated or moving to a local MySQL/ClickHouse deployment).
2. **Kubiq K8s Daemon:** We upgrade `KubeLogStreamService` to run an optional 24/7 background mode that continuously tails cluster logs and buffers them into the database, even when the UI is closed.
3. **Log Rotation/TTL:** Rely heavily on the TTL indexes we just built to ensure the database rotates old logs effectively.

### User Review Required
How would you like to proceed? 
1. Should we build the **Continuous K8s Background Worker** into the backend right now?
2. Or keep Kubiq as a lightweight "On-Demand" viewer for now and focus on other features?
