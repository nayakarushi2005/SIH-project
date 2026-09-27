# ──────────────────────────────────────────────────────────────────────────────
# SIH Backend – Production Dockerfile
# Multi-stage build: install deps in a builder stage, copy to slim runtime
# ──────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Install dependencies ────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy only package manifests first (Docker layer caching)
COPY package.json package-lock.json ./

# Install production dependencies only
RUN npm install --omit=dev

# ── Stage 2: Production runtime ─────────────────────────────────────────────
FROM node:20-alpine

# Security: run as non-root
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Copy installed node_modules from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy application source
COPY package.json ./
COPY server.js ./
COPY dispatcher.js ./
COPY routes/ ./routes/
COPY models/ ./models/
COPY middleware/ ./middleware/
COPY services/ ./services/

# Switch to non-root user
USER appuser

# Expose the API port
EXPOSE 3000

# Health check (Docker + orchestrator-friendly)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "const http = require('http'); http.get('http://localhost:3000/api/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); }).on('error', () => process.exit(1));"

# Start the server
CMD ["node", "server.js"]
