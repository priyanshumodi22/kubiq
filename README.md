<div align="center">
  <img src="https://raw.githubusercontent.com/priyanshumodi22/kubiq/main/frontend/public/logo/kubiq_logo.png" alt="Kubiq Logo" width="120" height="120">

  # kubiq

  **Server & Infrastructure Monitoring, Reimagined.**

  [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
  [![Docker Pulls](https://img.shields.io/docker/pulls/priyanshumodi22/kubiq)](https://hub.docker.com/r/priyanshumodi22/kubiq)
  [![Platform](https://img.shields.io/badge/Platform-linux%2Famd64%20%7C%20linux%2Farm64-lightgrey)](https://hub.docker.com/r/priyanshumodi22/kubiq/tags)
  <br>
  <a href="https://www.producthunt.com/products/kubiq?embed=true&utm_source=badge-featured&utm_medium=badge&utm_campaign=badge-kubiq" target="_blank"><img src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1154261&theme=light" alt="kubiq - Unify APM, monitoring, observability & Kubernetes management | Product Hunt" style="width: 250px; height: 54px;" width="250" height="54" /></a>
  <br><br>
  ![React](https://img.shields.io/badge/react-%2320232a.svg?style=flat&logo=react&logoColor=%2361DAFB)
  ![Vite](https://img.shields.io/badge/vite-%23646CFF.svg?style=flat&logo=vite&logoColor=white)
  ![TailwindCSS](https://img.shields.io/badge/tailwindcss-%2338B2AC.svg?style=flat&logo=tailwind-css&logoColor=white)
  ![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=flat&logo=typescript&logoColor=white)
  <br>
  ![NodeJS](https://img.shields.io/badge/node.js-%2343853D.svg?style=flat&logo=node.js&logoColor=white)
  ![Express.js](https://img.shields.io/badge/express.js-%23404d59.svg?style=flat&logo=express&logoColor=%2361DAFB)
  ![Socket.io](https://img.shields.io/badge/Socket.io-black?style=flat&logo=socket.io&badgeColor=010101)
  ![Docker](https://img.shields.io/badge/docker-%230db7ed.svg?style=flat&logo=docker&logoColor=white)

</div>

<p align="center">
  <b>kubiq</b> is a modern, lightweight, and self-hosted monitoring solution designed for <b>VMs, Bare Metal, and Kubernetes Pods</b>.<br>
  It provides real-time visibility into your infrastructure with zero latency, utilizing Socket.IO for live streaming of logs and system stats.<br>
  Built with performance and aesthetics in mind, kubiq helps you keep track of your servers, databases, and services without the bloat of enterprise monitoring tools.
</p>

---
👉 <b>Official Website & Docs:</b> [https://kubiq.priyanshumodi.in](https://kubiq.priyanshumodi.in).


## ✨ Key Features

*   **⚖️ v2.1.0 — Autoscaling Management (Latest)**
    *   **HPA & VPA Resource Control:** Full support for fetching, reading, and managing raw YAML for Horizontal and Vertical Pod Autoscalers, including secure deletion workflows.

*   **📊 v2.0.1 — Advanced APM Trace Exports**
    *   **Spreadsheet-Ready CSV Exports:** Download trace data and slow queries directly from the APM dashboard into clean CSV files for external analysis, reporting, and archiving.
    *   **Precision Filtering & Formatting:** Filter exports by custom 12-hour time ranges, specific services, minimum duration thresholds, or "Errors Only". Automatically maps OpenTelemetry attributes (e.g., `db.statement`, `http.url`) into organized columns.

*   **☸️ v2.0.0 — The Kubernetes Control Plane**
    *   **Multi-Cluster Context Switching:** Switch between local or remote EKS/AKS/GKE clusters on the fly with custom connection inspect tooltips displaying active cloud provider details, users, and API endpoints.
    *   **Pixel-Perfect Service Topology Map:** A mathematically aligned 4-column dependency graph (Hosts/Ingresses ➡️ Services ➡️ Pods ➡️ Configs/Secrets) with custom SVG curves, active hover-tracing, zoom controls, and touchscreen touch/drag gesture support.
    *   **Direct YAML Monaco Editor:** Embedded full-scale VS Code-powered Monaco Editor for YAML manifest search, live schema validation, and instant hot-patch deployments.
    *   **Interactive TTY Pod Container Shell:** Styled Xterm.js terminal canvas supporting multi-container sidecar switching and real-time execution streaming (Exec streams).
    *   **Real-time Observability & Sparklines:** Pod CPU/RAM live utilization sparklines, radial progress resource limit gauges, and real-time active alarm logs (OOMKilled, CrashLoopBackOff).

*   **📈 APM & Trace Ingestion Engine (v1.2.0 Observability)**
    *   **Zero-Config `kubiq-apm`:** Automatic instrumentation NPM package for Node.js apps serving real-time overviews of throughput (RPM), latency (P95), and query trace waterfalls.
    *   **Global Ingestion Filtering:** Drop entire trace trees for ignored background paths (e.g. `/health`, `/metrics`) to drastically reduce DB storage and eliminate orphaned span leakage.
    *   **Faceted Trace Search & Analytics:** Filter traces by route attributes, custom latency thresholds (e.g. `> 2s`), and instant `Errors Only` search toggles with visual status icons.

*   **🤫 Alert Debouncing & Stability (v1.1.0 Reliability)**
    *   **Anti-Flapping Controls:** Configure custom consecutive failure thresholds per service to prevent notification spam from 1-second glitches.
    *   **Hardened Notification Engine:** Strict 5-second webhook timeouts, SMTP connection pooling/caching to decrease CPU load, and automatic exponential backoff retries (3 attempts).

*   **⚡ High-Throughput Log Streaming (v1.1.0 Logs Overhaul)**
    *   **WebSocket Backpressure Handling:** Batches and buffers log emission cascades in 100ms intervals (or 64KB chunks) to prevent client UI browser freeze.
    *   **Shared Watcher Reference Counting:** Multiple client log views of the same pod are automatically bound to a single active watcher thread, eliminating severe file system descriptor leaks.
    *   **Advanced Log Management:** Real-time log streaming using full Glob pattern matchings (e.g., `/var/log/**/*.log`).

*   **⏱️ Core Uptime & Per-Service Control (v1.0.1 Patch)**
    *   **Custom Polling Intervals:** Set service checks individually (10s, 30s, 1m, 5m, 10m) from the dashboard, respecting the global fallback.
    *   **Dark-Theme Portal Dropdowns:** Replaced all native OS browser select menus with clean, consistent portals ensuring zero overflow clipping in modals.

*   **💾 Enterprise Storage & Security (v1.0.0 Launch)**
    *   **Uptime Monitoring:** Live TCP ports, HTTP/HTTPS connectivity checks, and database checks (MySQL/MongoDB).
    *   **Predictive Storage Analytics:** Multi-linear regression analytics engine providing intelligent "Days Remaining" disk full forecasting.
    *   **Triple-Layer Security:** Secure JWT sessions, passwordless biometric Passkeys (WebAuthn: FaceID, TouchID, YubiKey), and OpenID Connect (OIDC) SSO support for Keycloak.
    *   **RBAC Control:** Granular separation between Admin (Full Read/Write) and Viewer (Read-Only) users.
    *   **Cross-Platform Architecture:** Native builds optimized for `AMD64` and `ARM64` (Raspberry Pi, Oracle Cloud VPS).

---

## 🚀 Quick Start

### ⚙️ 1. Setup Environment (.env)
Create a `.env` file in your directory to configure kubiq:

```env
PORT=3001
NODE_ENV=production
# Add your VPS domain if using HTTPS, otherwise leave as is
FRONTEND_DNS=http://localhost:3001
CORS_ORIGIN=http://localhost:3001
BACKEND_DNS=http://localhost:3001
DB_TYPE=json
```
*(Grab the full `.env.example` configurations template from [kubiq.priyanshumodi.in/view/env](https://kubiq.priyanshumodi.in/view/env))*

### 🐳 2. Run with Docker
Run kubiq based on your desired operational mode:

#### Option A: Lightweight VPS & System Monitor (Default)
```bash
docker run -d \
  --name kubiq \
  -p 3001:3001 \
  -v kubiq-data:/app/data \
  --env-file .env \
  --restart unless-stopped \
  priyanshumodi22/kubiq:latest
```

#### Option B: With Local Kubernetes Cluster Access (Minikube / k3s / On-Premise)
```bash
docker run -d \
  --name kubiq \
  -p 3001:3001 \
  -v ~/.kube:/root/.kube:ro \
  -v kubiq-data:/app/data \
  --env-file .env \
  --restart unless-stopped \
  priyanshumodi22/kubiq:latest
```

#### Option C: With Multi-Cloud Managed Clusters (AWS EKS, GCP GKE, Azure AKS)
Mount your local cloud credentials and run in host network mode to authorize credentials securely:
```bash
docker run -d \
  --name kubiq \
  --network host \
  -e KUBECONFIG=/root/.kube/config \
  -v ~/.kube:/root/.kube:ro \
  -v ~/.aws:/root/.aws:ro \
  -v ~/.azure:/root/.azure:ro \
  -v ~/.config/gcloud:/root/.config/gcloud:ro \
  -v kubiq-data:/app/data \
  --env-file .env \
  --restart unless-stopped \
  priyanshumodi22/kubiq:latest
```

### 🐙 3. Run with Docker Compose
Alternatively, save this `docker-compose.yml` to orchestrate your setup:

```yaml
version: '3.8'
services:
  kubiq:
    image: priyanshumodi22/kubiq:latest
    container_name: kubiq
    restart: unless-stopped
    ports:
      - "3001:3001"
    volumes:
      - kubiq-data:/app/data
      - ~/.kube:/root/.kube:ro
    env_file:
      - .env

volumes:
  kubiq-data:
```

Run it:
```bash
docker-compose up -d
```

---

### Standalone Binary
Don't want Docker? Download the single binary for your architecture from the [Releases Page](https://github.com/priyanshumodi22/kubiq/releases).

---

## 🛠️ Configuration

kubiq is configured via Environment Variables.

| Variable | Description | Default |
| :--- | :--- | :--- |
| `PORT` | Port to run the server on | `3000` |
| `DB_TYPE` | Storage backend: `json`, `mysql`, `mongo` | `json` |
| `ENABLE_PERSISTENCE` | Enable/Disable data saving | `true` |
| `POLL_INTERVAL` | Service check interval (ms) | `30000` |
| `JWT_SECRET` | Secret for sessions (Change this!) | `auto-generated` |
| `KEYCLOAK_ENABLED` | Enable OIDC SSO | `false` |
| `NATIVE_AUTH_ENABLED` | Enable Username/Pass login | `true` |

*For a full list of configuration options, check the [Official Documentation](https://kubiq.priyanshumodi.in/).*

---

## 💻 Development

### Prerequisites
*   Node.js 18+
*   npm or yarn

### Setup
1.  **Clone the repository:**
    ```bash
    git clone https://github.com/priyanshumodi22/kubiq.git
    cd kubiq
    ```

2.  **Install dependencies:**
    ```bash
    cd backend && npm install
    cd ../frontend && npm install
    ```

3.  **Run locally:**
    ```bash
    # Terminal 1: Backend
    cd backend && npm run dev

    # Terminal 2: Frontend
    cd frontend && npm run dev
    ```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

<p align="center">
  Built with ❤️ by <a href="https://github.com/priyanshumodi22">Priyanshu Modi</a>
</p>
