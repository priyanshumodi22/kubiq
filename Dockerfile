# Stage 1: Build Frontend
FROM node:20-slim AS ui-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
# Kubiq is served beneath /kubiq while its API stays at /kubiq-api. Vite bakes
# both values into the frontend bundle, so they must exist before npm run build.
ARG VITE_FRONTEND_BASE_PATH=/kubiq/
ARG VITE_BACKEND_CONTEXT_PATH=/kubiq-api
ARG VITE_BACKEND_DNS=
ENV VITE_FRONTEND_BASE_PATH=$VITE_FRONTEND_BASE_PATH \
    VITE_BACKEND_CONTEXT_PATH=$VITE_BACKEND_CONTEXT_PATH \
    VITE_BACKEND_DNS=$VITE_BACKEND_DNS
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

# This production image runs inside k3s with a projected service-account token.
# Cloud CLIs and cross-cloud auth helpers are deliberately excluded: they add
# hundreds of MB and are unnecessary for this low-cost single-node deployment.
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

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
