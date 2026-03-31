# ============================================================
#  Dander API — Dockerfile
#  Multi-stage: builder installs deps, runner is lean image.
# ============================================================

# ── Stage 1: install dependencies ──────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy manifests first for better layer caching
COPY package.json package-lock.json* ./

RUN npm install --omit=dev

# ── Stage 2: runtime image ─────────────────────────────────
FROM node:20-alpine AS runner

# sharp requires libvips at runtime
RUN apk add --no-cache vips-dev

WORKDIR /app

# Copy installed node_modules from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy source
COPY . .

# Create uploads directory (volume mount will overlay in dev)
RUN mkdir -p uploads

# Non-root user for security
RUN addgroup -S dander && adduser -S dander -G dander
RUN chown -R dander:dander /app
USER dander

EXPOSE 4000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:4000/health || exit 1

CMD ["node", "src/index.js"]
