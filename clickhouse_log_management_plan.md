# Kubiq Pro: Continuous Log Management & ClickHouse Plan

With ClickHouse successfully onboarded, we can now upgrade Kubiq from a "Lightweight Log Viewer" into a true **Enterprise Log Aggregator** that competes with SigNoz and Datadog. 

Here is exactly what we can build, broken down by feature and architectural choices.

---

## 1. The Storage Layer: ClickHouse Integration

ClickHouse is built for this. We will add a new database adapter to the backend.

### Proposed Changes
- **Backend:** Create `src/database/adapters/clickhouse/ClickhouseLogRepository.ts`.
- **Pipeline:** We update the `LogRetentionService` (or create an `IngestionBufferService`) to batch logs in memory for 1 second, then execute bulk `INSERT` statements into ClickHouse.
- **Data Schema:** We create a highly optimized ClickHouse table:
  ```sql
  CREATE TABLE kubiq_logs (
      timestamp DateTime64(3),
      serviceName LowCardinality(String),
      level LowCardinality(String),
      message String,
      metadata String
  ) ENGINE = MergeTree()
  ORDER BY (serviceName, timestamp);
  ```

---

## 2. Advanced Log Analytics UI (The "Pro" Dashboard)

Because ClickHouse can query millions of rows in milliseconds, we can build a brand new **Analytics Dashboard** for logs:
- **Time-Series Charts:** A bar chart showing log volume (Error vs Info vs Warn) over the last 24 hours.
- **Spike Detection:** Instantly spot when a specific service suddenly starts throwing 5x more `ERROR` logs than normal.
- **Instant Global Search:** Search across *all* services and *all* namespaces simultaneously without waiting.

---

## 3. Continuous Log Collection (The Data Ingestion Problem)

As you correctly pointed out: collecting logs continuously from VM files is easy, but Kubernetes is a different beast. 

### For VM Deployments (Agentless)
We build a background `VmLogWatcherService` in the Node.js backend. It continuously tails the file paths configured in the Kubiq UI and streams them directly into the ClickHouse ingestion buffer.

### For Kubernetes Deployments (The Big Decision)
You asked: *"...in k8s, we have to choose the namespace right for the user session, so that only that namespace application pods logs get there?"*

If we want continuous 24/7 logging in Kubernetes, we have **two architectural options**. We need to choose one:

#### Option A: The "Agentless" Approach (Strictly Namespace-Scoped)
The Kubiq backend itself connects to the Kubernetes API and streams logs from the pods in the background.
- **How it works:** In the Kubiq UI, you configure "Monitored Namespaces" (e.g., `production`, `billing`). The Kubiq backend watches these namespaces and pipes the logs into ClickHouse 24/7.
- **The Catch:** If you monitor a namespace with 100+ heavily logging pods, the Node.js event loop on the Kubiq backend will become a severe bottleneck and potentially crash.

#### Option B: The "DaemonSet" Approach (The Industry Standard)
We completely bypass the Kubernetes API for continuous logging. Instead, we provide users a simple `kubiq-agent.yaml` to deploy on their cluster.
- **How it works:** A tiny, highly optimized agent (like FluentBit) runs on every physical node in the K8s cluster. It reads the raw log files directly from the hard drive (`/var/log/containers/`) and pushes them over HTTP to the Kubiq backend.
- **The Catch:** It requires the user to run `kubectl apply -f kubiq-agent.yaml` on their cluster.
- **Why SigNoz/Datadog do this:** It is 100x more scalable. The heavy lifting of reading files happens on the edge nodes, not on your central Kubiq server.

---

## User Review Required

> [!IMPORTANT]  
> **How do you want to handle Kubernetes Continuous Logging?**
> 
> **Choice 1:** Keep it "Agentless" (Option A). We will build an admin UI to select specific Namespaces to monitor continuously, acknowledging that it might bottleneck if the user has a massive cluster.
> 
> **Choice 2:** Build a DaemonSet (Option B). We will configure an industry-standard `fluentbit` or OTEL agent that users deploy to their cluster to push logs to Kubiq automatically.

Let me know which route you want to take, and we can begin the ClickHouse integration immediately!
