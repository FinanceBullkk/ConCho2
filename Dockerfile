# ── Builder stage ─────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install client dependencies and build
COPY client/package*.json ./client/
RUN cd client && npm ci --prefer-offline

COPY client/ ./client/
RUN cd client && npm run build

# ── Server stage ──────────────────────────────────────────
FROM node:20-alpine AS server-deps

WORKDIR /app
COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev --prefer-offline

# ── Final image ───────────────────────────────────────────
FROM node:20-alpine

# Non-root user for security
RUN addgroup -S tms && adduser -S tms -G tms

WORKDIR /app

# Copy server source + production node_modules
COPY --from=server-deps /app/server/node_modules ./server/node_modules
COPY server/ ./server/

# Copy built client into location server expects (/app/client/dist)
COPY --from=builder /app/client/dist ./client/dist

# Metadata
LABEL org.opencontainers.image.title="TMS v2" \
      org.opencontainers.image.description="Training Management System" \
      org.opencontainers.image.source="https://github.com/FinanceBullkk/ConCho2"

USER tms

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:5000/health || exit 1

ENV NODE_ENV=production
WORKDIR /app/server

CMD ["node", "server.js"]
