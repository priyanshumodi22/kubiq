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
RUN apk add --no-cache python3 make g++
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
# Build output: /app/backend/dist
RUN npm run build

# Stage 3: Production Runner
FROM node:20-slim
WORKDIR /app

# Install production dependencies only
# We need 'bcrypt' native bindings again for runtime? 
# Usually 'npm install' builds them. We copy package.json and install prod only.
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY backend/package*.json ./
RUN npm ci --omit=dev

# Copy built backend
COPY --from=server-build /app/backend/dist ./dist

# Copy built frontend to 'public' (which server.ts expects at ../public relative to dist)
# dist/server.js -> ../public -> /app/public
COPY --from=ui-build /app/frontend/dist ./public

# Create volume directories
RUN mkdir -p /app/data /app/logs
VOLUME ["/app/data", "/app/logs"]

# Environment
ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["node", "dist/server.js"]
