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

  <p align="center">
    kubiq is a modern, lightweight, and beautiful monitoring solution designed for <b>VMs and Kubernetes Pods</b>.<br>
    It tracks your infrastructure's health, logs, and resources in real-time without the bloat.
  </p>
</div>

---

## ✨ Features

- **⚡ Real-Time Streaming**
  - Instant status updates via Socket.IO.
  - Live log streaming with zero latency.
  - **Glob Pattern Support:** Monitor dynamic files (e.g., `/var/log/*.log`).
  - **Auto-Rotation:** Automatically follows files across rotations.

- **📈 System Analytics**
  - Beautiful, animated gauges for **CPU & RAM**.
  - **Storage Analytics Widget:** Track disk usage trends over time.

- **💾 Multi-Database Support**
  - **JSON (Default):** Zero-config, file-based persistence for simple setups.
  - **MySQL / MongoDB:** Enterprise-grade storage drivers for scale.
  - Switch backends easily via environment variables.

- **🛡️ Enterprise Security**
  - **Native Authentication:** Secure Login/Register with JWT.
  - **RBAC:** Distinct **Admin** (Read/Write) and **Viewer** (Read-Only) roles.
  - **Data Masking:** Sensitive credentials (DB strings, Webhooks) are hidden for non-admins.

- **🔔 Smart Notifications**
  - **Channels:** SMTP (Email) and Webhooks (**Discord, Slack, Teams**).
  - **Customizable:** Configure From Name, CC, BCC, and routing rules.

- **🖥️ Cross-Platform**
  - Native support for **AMD64** and **ARM64** (Raspberry Pi, Oracle Cloud).

---

## 🚀 Quick Start

### Docker (Recommended)
Get up and running in seconds:

```bash
docker run -d \
  --name kubiq \
  -p 3000:3000 \
  -v kubiq-data:/app/data \
  priyanshumodi22/kubiq:latest
```

### Standalone Binary
Don't want Docker? Download the single binary for your architecture from the [Releases Page](https://github.com/priyanshumodi22/kubiq/releases).

---

## 🛠️ Configuration

kubiq uses environment variables or a `.env` file for configuration.

| Variable | Description | Default |
| :--- | :--- | :--- |
| `PORT` | Port to run the server on | `3000` |
| `DB_TYPE` | Storage backend: `json`, `mysql`, or `mongo` | `json` |
| `JWT_SECRET` | Secret key for session signing | `auto-generated` |

### Volume Mounts
| Path | Purpose |
| :--- | :--- |
| `/app/data` | Persists the JSON database and config files. |

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
