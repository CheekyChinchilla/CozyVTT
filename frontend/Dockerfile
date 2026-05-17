# Development Dockerfile
# For production, use Dockerfile.prod (multi-stage, serves via backend static middleware)
FROM node:20-alpine

# Create non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

RUN chown -R appuser:appgroup /app

USER appuser

EXPOSE 3000

CMD ["npm", "run", "dev"]
