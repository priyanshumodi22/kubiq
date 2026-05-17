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

# Install runtime dependencies
RUN apt-get update && apt-get install -y libstdc++6 libgcc1 ca-certificates && rm -rf /var/lib/apt/lists/*

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
