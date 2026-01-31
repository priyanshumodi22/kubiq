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

# Build single executable binary
# Detect architecture and rename the correct binary to 'kubiq-bin'
RUN npx pkg . --out-path ./pkg-build && \
    ARCH=$(uname -m) && \
    if [ "$ARCH" = "x86_64" ]; then \
      mv ./pkg-build/kubiq-backend-linux-x64 ./kubiq-bin; \
    elif [ "$ARCH" = "aarch64" ]; then \
      mv ./pkg-build/kubiq-backend-linux-arm64 ./kubiq-bin; \
    else \
      echo "Unknown architecture: $ARCH" && exit 1; \
    fi

# Stage 3: Production Runner
FROM node:20-slim
WORKDIR /app

# Install dependencies for the binary (libraries)
RUN apt-get update && apt-get install -y libstdc++6 libgcc1 ca-certificates && rm -rf /var/lib/apt/lists/*

# Copy the binary
COPY --from=server-build /app/backend/kubiq-bin ./kubiq

# Copy built frontend (needed for UI)
COPY --from=ui-build /app/frontend/dist ./public

# Create volume directories
RUN mkdir -p /app/data /app/logs
VOLUME ["/app/data", "/app/logs"]

# Environment
ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["./kubiq"]
