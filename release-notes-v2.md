# kubiq v2.0.0 - The Kubernetes Era

Welcome to **kubiq v2.0.0**! This is our first major version release, introducing a massive, commercial-grade **Kubernetes Cluster Explorer** to kubiq. 

We have completely expanded the scope of kubiq: transforming it from a robust server monitoring and APM tool into an all-in-one, high-performance, and visually stunning Kubernetes management control plane (competing directly with Lens and Portainer). 

## 🌐 Official Website & Documentation
👉 **[https://kubiq.priyanshumodi.in/](https://kubiq.priyanshumodi.in)**

---

## ⚡ What's New inside the Kubernetes Dashboard

### 1. 🔌 Multi-Cluster Context Switching
Take control of all your clusters from a single, unified menu.
*   **Automatic Discovery**: Automatically reads and parses your active Kubeconfig contexts on boot.
*   **Smart Prettification**: Auto-formats long, raw AWS EKS, Google GKE, and Azure AKS context strings into clean, beautiful tags (e.g. `arn:aws:eks:.../dev-cluster` becomes `dev-cluster [EKS:us-east-1]`).
*   **Custom Glassmorphic Tooltip Card**: Hovering over any cluster context triggers a breathtaking connection inspector card displaying the active cloud provider, authentication user, raw ARN identifiers, and backend target API endpoints.
*   **Perfect UI Scaling**: A compact 240px selector bar that handles text truncation seamlessly, accompanied by a dynamic sidebar layout ensuring zero overlap.

### 2. 🗺️ Relationship Mapping (Service Topology Map)
A mathematically aligned, pixel-perfect visual dependencies map representing your entire namespace.
*   **4-Column Dependency Graph**: Visualizes live connections from entry points to secure parameters:
    `Hosts & Ingresses ➡️ Services (ClusterPorts) ➡️ Pod Replicas ➡️ Configs/Secrets`
*   **Single-Transform Canvas Wrapper**: Combines SVG graphics and DOM node cards into a synchronized transformation wrapper. Guarantees 100% pixel-perfect alignment under zooming, panning, dragging, and resizing.
*   **Natural Bezier Curves**: Employs sloping diagonal math (`dx * 0.3`) to prevent paths from collapsing into sharp vertical lines.
*   **Active Trace Highlighting**: Hovering over any card highlights its immediate upstream inputs and downstream outputs in a gorgeous glowing Cyan (#00f0ff) trace trail.

### 3. 📝 Direct YAML Manifest Editing (Monaco Editor)
Inspect, patch, and deploy cluster resources on-the-fly inside the browser.
*   **Integrated Monaco Engine**: Features a full-scale, VS Code-powered Monaco Editor embedded directly in a slide-out drawer.
*   **JSON/YAML Schema Validation**: Built-in syntax highlighting, searching, and schema alignment.
*   **Hot-Patch Deployment**: A single click compiles your edits, sends them to a secure backend manifest parser, and executes a live `k8sService.applyResource(manifest)` hot-patch directly.

### 4. 💻 Interactive Pod Container Shell (Exec TTY)
Open secure, fully interactive container terminals directly from your dashboard.
*   **Styled Xterm.js Canvas**: Embedded terminal console with customized fonts, emerald cursors, and full support for keyboard events, arrows, tabs, and backspaces.
*   **Multi-Container Selectors**: Dropdown switching for pods containing multiple sidecars or containers.
*   **PTY Stream Management**: Backend terminal streaming service spawns container sessions asynchronously via standard Kubernetes API Exec streams with dynamic window resizing.

### 5. 📡 Real-Time Namespace Observability & Events
*   **Pod Micro-Sparklines**: Real-time inline CPU and memory historical metrics powered by Recharts.
*   **Interactive Namespace Dashboard**: Radial progress gauges representing pod health, total aggregations, and consumption limits.
*   **Live Event Watcher Feed**: A stream displaying namespace alerts, schedule failures (`FailedScheduling`), and crash cycles (`OOMKilled`, `CrashLoopBackOff`) in an active alarm center.
*   **Workload Quick Actions**: UI controls to trigger rolling restarts, deployment scaling, and safe deletions directly from cards.

---

## 🔒 Under the Hood Enhancements
*   **WebSocket log stream backpressure**: Batches and buffers streaming log emissions in 100ms intervals to prevent browser threads from choking during high-throughput log cascades.
*   **Shared Room Log Watcher**: Multiple clients viewing the same pod log room now share a single active file handle, preventing file system leaks.
*   **Zero-Dependency Setup**: Hot-reloading client contexts dynamically rebuilds internal client SDK parameters without requiring a node reboot.

---

## 🚀 Quick Start (Docker v2.0.0)
1. **Setup your environment:** Grab your latest `.env` file containing Kubeconfig paths from [kubiq.priyanshumodi.in/view/env](https://kubiq.priyanshumodi.in/view/env).
2. **Mount Kubeconfig & Run kubiq:**
```bash
docker run -d \
  --name kubiq \
  -p 3000:3000 \
  -v ~/.kube:/root/.kube:ro \
  -v kubiq-data:/app/data \
  --env-file .env \
  --restart unless-stopped \
  priyanshumodi22/kubiq:v2.0.0
```

---

## 🤝 Contributors
Built with ❤️ by [@priyanshumodi22](https://github.com/priyanshumodi22).

---
*If you like kubiq, please give us a star on [GitHub](https://github.com/priyanshumodi22/kubiq)! ⭐*
