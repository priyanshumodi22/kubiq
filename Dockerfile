# Multi-stage build for Kubiq Dashboard

# Stage 1: Build frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm i
COPY frontend/ ./
RUN npm run build

# Stage 2: Build backend
FROM node:20-alpine AS backend-builder
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm i
COPY backend/ ./
RUN npm run build

# Stage 3: Production image
FROM node:20-alpine
WORKDIR /app/kubiq

# Install networking tools for debugging
RUN apk add --no-cache curl busybox-extras iputils

# Copy backend compiled files
COPY --from=backend-builder /app/backend/dist ./dist
COPY --from=backend-builder /app/backend/package*.json ./
COPY --from=backend-builder /app/backend/config/services.ini ./config-temp/services.ini

# Install production dependencies only
RUN npm ci --only=production

# Copy frontend built files to be served by backend
COPY --from=frontend-builder /app/frontend/dist ./public

# Create directories for persistence and logs
RUN mkdir -p /app/kubiq/data /app/kubiq/logs

# Copy configuration files
COPY backend/.env ./
RUN mv ./config-temp/services.ini ./data/services.ini && rm -rf ./config-temp

# Expose port
EXPOSE 3001
