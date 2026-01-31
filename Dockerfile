# Stage 1: Build Frontend
FROM node:18-slim AS ui-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
# Build output: /app/frontend/dist
RUN npm run build 

# Stage 2: Build Backend
FROM node:18-slim AS server-build
WORKDIR /app/backend
# Install build tools for native modules (bcrypt, etc.)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build

# Build single executable binary
# Build single executable binary
# Detect architecture and build ONLY the necessary binary to ./kubiq-bin
RUN ARCH=$(uname -m) && \
    if [ "$ARCH" = "x86_64" ]; then \
      TARGET="node18-linux-x64"; \
    elif [ "$ARCH" = "aarch64" ]; then \
      TARGET="node18-linux-arm64"; \
    else \
      echo "Unknown architecture: $ARCH" && exit 1; \
    fi && \
    npx pkg . -t $TARGET --output ./kubiq-bin

# Stage 3: Production Runner
FROM node:18-slim
WORKDIR /app

# Install dependencies for the binary (libraries)
RUN apt-get update && apt-get install -y libstdc++6 libgcc1 ca-certificates && rm -rf /var/lib/apt/lists/*

# Copy the binary
COPY --from=server-build /app/backend/kubiq-bin ./kubiq

# Copy node_modules (for native bindings like bcrypt)
COPY --from=server-build /app/backend/node_modules ./node_modules

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
