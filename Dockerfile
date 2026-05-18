# Stage 1: Build Frontend
FROM node:20-slim AS ui-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
# Build output: /app/frontend/dist
RUN npm run build 

# Stage 2: Build Backend
FROM node:20-slim AS server-build
WORKDIR /app/backend
# Install build tools for native modules (bcrypt, etc.)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build
# Bundle with ncc (creates single JS file, preserves native crypto API)
RUN npm run build:ncc

# Stage 3: Production Runner
FROM node:20-slim
WORKDIR /app

# Install runtime dependencies, AWS CLI, and utilities
RUN apt-get update && apt-get install -y \
    libstdc++6 \
    libgcc1 \
    ca-certificates \
    awscli \
    curl \
    unzip \
    gnupg \
    apt-transport-https \
    && rm -rf /var/lib/apt/lists/*

# Install Azure AKS kubelogin
RUN curl -LO https://github.com/Azure/kubelogin/releases/download/v0.1.4/kubelogin-linux-amd64.zip && \
    unzip kubelogin-linux-amd64.zip && \
    mv bin/linux_amd64/kubelogin /usr/local/bin/kubelogin && \
    rm -rf kubelogin-linux-amd64.zip bin

# Install Google Cloud CLI & GKE Auth Plugin
RUN echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" | tee -a /etc/apt/sources.list.d/google-cloud-sdk.list && \
    curl https://packages.cloud.google.com/apt/doc/crt.gpg | gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg && \
    apt-get update && apt-get install -y google-cloud-cli-gke-gcloud-auth-plugin && \
    rm -rf /var/lib/apt/lists/*

# Copy the ncc bundle (single file)
COPY --from=server-build /app/backend/build/index.js ./index.js
# We still need the frontend build
COPY --from=ui-build /app/frontend/dist ./public

# Create volume directories
RUN mkdir -p /app/data /app/logs
VOLUME ["/app/data", "/app/logs"]

# Environment
ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["node", "index.js"]
