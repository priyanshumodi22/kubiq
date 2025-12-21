FROM node:20-alpine
WORKDIR /app/kubiq

# Install networking tools for debugging
RUN apk add --no-cache curl busybox-extras iputils

# Copy all pre-built files
COPY . .

# Ensure data and logs directories exist
RUN mkdir -p /app/kubiq/data /app/kubiq/logs

# Expose port
EXPOSE 3001

# # Start command
# CMD ["node", "dist/server.js"]
