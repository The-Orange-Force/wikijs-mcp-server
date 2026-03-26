# ──────────────────────────────────────────────────────────────────────────────
# Stage 1: builder
# Install all dependencies (including devDependencies) and compile TypeScript.
# node:20-alpine is used for minimal image size. All remaining dependencies are pure JavaScript.
# ──────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy manifests first to leverage Docker layer cache — only re-runs npm ci
# when package*.json changes, not on every source file change.
COPY package*.json ./

# Install all dependencies including devDependencies (tsc is a devDependency)
RUN npm ci

# Copy TypeScript config and source
COPY tsconfig.json ./
COPY src/ ./src/

# Compile TypeScript to dist/
RUN npm run build

# Strip source maps and type declarations that tsc emits.
# These are not needed at runtime and add unnecessary image size.
# Note: .dockerignore cannot do this — it only filters the host build context,
# not files generated inside the builder stage.
RUN find dist/ -name '*.map' -o -name '*.d.ts' | xargs rm -f

# ──────────────────────────────────────────────────────────────────────────────
# Stage 2: runtime
# Install production dependencies only, copy compiled output from builder.
# ──────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

WORKDIR /app

# Copy manifests first to leverage Docker layer cache
COPY package*.json ./

# Install production dependencies only — --omit=dev is the current flag
# (--only=production is deprecated as of npm v7)
RUN npm ci --omit=dev

# Copy compiled JavaScript from the builder stage (source maps and .d.ts already stripped)
COPY --from=builder /app/dist ./dist/

# Drop to non-root user before starting the process.
# node:20-alpine pre-creates the `node` system user (uid 1000).
# No chown needed — dist/ is read-only at runtime and Pino logs to stdout.
USER node

# Health check using Node's built-in http module.
# curl and wget are NOT present in node:20-alpine (purged during Node.js installation
# to keep the image minimal). The PORT fallback is 8000 — matching src/config.ts
# default: z.string().default("8000").
HEALTHCHECK --start-period=30s --interval=30s --timeout=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 8000) + '/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Start the server directly with node (not npm start).
# npm adds shell/process indirection — SIGTERM from `docker stop` reaches npm
# instead of Node, causing a hard kill instead of graceful shutdown.
CMD ["node", "dist/server.js"]
