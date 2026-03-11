<div align="center">
  <img src="https://raw.githubusercontent.com/priyanshumodi22/kubiq/main/frontend/public/logo/kubiq_logo.png" alt="Kubiq Logo" width="120" height="120">

  # kubiq

  **Server & Infrastructure Monitoring, Reimagined.**

  [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
  [![Docker Pulls](https://img.shields.io/docker/pulls/priyanshumodi22/kubiq)](https://hub.docker.com/r/priyanshumodi22/kubiq)
  [![Platform](https://img.shields.io/badge/Platform-linux%2Famd64%20%7C%20linux%2Farm64-lightgrey)](https://hub.docker.com/r/priyanshumodi22/kubiq/tags)
  <br>
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

*   **⚡ Real-Time Streaming & Monitoring**
    *   **Live Updates:** Sub-second latency for CPU, RAM, and Disk changes.
    *   **Service Monitoring:** Native checks for **HTTP/HTTPS** (with SSL monitoring), **TCP Ports**, **MySQL**, and **MongoDB**.
    *   **Log Streaming:** Watch logs tail live with support for glob patterns (e.g., `/var/log/*.error`) and auto-rotation.

*   **📈 Advanced Analytics**
    *   **Interactive Dashboard:** Beautiful, animated gauges and charts.
    *   **Predictive Storage Analytics:** Intelligent forecasting tells you exactly how many days until your disk is full.

*   **💾 Multi-Database Support**
    *   **JSON (Default):** Zero-config, file-based persistence. Perfect for single nodes.
    *   **MySQL / MongoDB:** Switch to enterprise-grade databases for high-availability setups.

*   **🔐 Triple-Layer Security**
    *   **Authentication:** Secure JWT-based login.
    *   **Passkeys (WebAuthn):** Passwordless biometric login (FaceID, TouchID, YubiKey).
    *   **SSO:** OpenID Connect (OIDC) support for **Keycloak** integration.
    *   **RBAC:** Granular control with **Admin** (Read/Write) and **Viewer** (Read-Only) roles.

*   **🔔 Smart Notifications**
    *   Get alerts via **Email (SMTP)** or Webhooks (**Discord, Slack, Teams**).


*  **🖥️ Cross-Platform**
   * Native support for **AMD64** and **ARM64** (Raspberry Pi, Oracle Cloud).

---

## 🚀 Quick Start

### Docker (Recommended)
Get up and running in seconds:

```bash
docker run -d \
  --name kubiq \
  -p 3000:3000 \
  -v kubiq-data:/app/data \
  --restart unless-stopped \
  priyanshumodi22/kubiq:latest
```

### 🐙 Docker Compose
Create a `docker-compose.yml` file:

```yaml
version: '3.8'
services:
  kubiq:
    image: priyanshumodi22/kubiq:latest
    container_name: kubiq
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - kubiq-data:/app/data
    environment:
      - PORT=3000
      - NODE_ENV=production
      # - DB_TYPE=mysql
      # - DB_HOST=localhost
      # - DB_USER=root
      # - DB_PASS=password

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
