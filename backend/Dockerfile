# Development Dockerfile
# For production, use Dockerfile.prod (multi-stage, non-root, compiled output)
FROM node:20-alpine

# bash: required by start.sh (#!/bin/bash shebang); not included in alpine by default
# postgresql-client: required for pg_dump (backup) and psql (restore)
RUN apk add --no-cache bash postgresql-client openssl

# Create non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Install dependencies as root (need write access to node_modules)
COPY package*.json ./
RUN npm ci

# Copy application code
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Copy and fix startup script
COPY scripts/start.sh /usr/local/bin/start.sh
RUN sed -i 's/\r$//' /usr/local/bin/start.sh && chmod +x /usr/local/bin/start.sh

# Create uploads and logs dirs, hand ownership to appuser
RUN mkdir -p /app/uploads /app/logs && chown -R appuser:appgroup /app

USER appuser

EXPOSE 4000

ENTRYPOINT ["/usr/local/bin/start.sh"]
CMD ["npm", "run", "dev"]
