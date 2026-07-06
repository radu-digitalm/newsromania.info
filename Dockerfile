# syntax=docker/dockerfile:1
# ============================================================================
# newsromania.info — production image (architecture.md §9)
# Multi-stage: deps (npm ci) -> build (next build, standalone) -> runner.
#
# Build discipline on this shared VPS (see deploy/DEPLOY.md):
#   - check `df -h /` first; do NOT build with < 3 GB free
#   - afterwards: `docker builder prune -f`
# Build:  docker compose --profile app build   (or: docker build -t newsromania-app .)
# Run:    docker compose --profile app up -d   (publishes 127.0.0.1:3100)
# ============================================================================

FROM node:24-alpine AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

# ---------------------------------------------------------------------------
# deps — install node_modules from the lockfile.
# vendor/ must be present: @amzn/creatorsapi-nodejs-sdk is a file: dependency
# (npm symlinks it; its prebuilt dist/ ships in the build context — npm does
# NOT run lifecycle scripts of file:-linked packages, so no babel needed here).
# ---------------------------------------------------------------------------
FROM base AS deps
COPY package.json package-lock.json ./
COPY vendor ./vendor
RUN npm ci

# ---------------------------------------------------------------------------
# build — next build with output:'standalone'.
# The dummy ARG values below are shape-valid ONLY so payload.config.ts can be
# imported during the build; every content route is force-dynamic, so the
# build never opens a DB/Redis connection (pg Pool + ioredis are both lazy).
# NOTHING secret is baked into layers — real values come from .env at runtime
# (compose `env_file` + container-perspective overrides).
# NEXT_PUBLIC_* values ARE inlined into the client bundle by design; both
# defaults below are public-facing (CLAUDE.md).
# ---------------------------------------------------------------------------
FROM base AS build
ARG DATABASE_URL=postgres://build:build@127.0.0.1:5432/build
ARG REDIS_URL=redis://default:build@127.0.0.1:6379
ARG PAYLOAD_SECRET=build-time-dummy-secret-not-used-at-runtime
ARG NEXT_PUBLIC_SITE_URL=https://newsromania.info
ARG NEXT_PUBLIC_ADSENSE_PUBLISHER_ID=ca-pub-8098077913729716
ENV DATABASE_URL=$DATABASE_URL \
    REDIS_URL=$REDIS_URL \
    PAYLOAD_SECRET=$PAYLOAD_SECRET \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_ADSENSE_PUBLISHER_ID=$NEXT_PUBLIC_ADSENSE_PUBLISHER_ID \
    NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/vendor ./vendor
COPY . .
RUN npm run build

# ---------------------------------------------------------------------------
# runner — minimal standalone runtime, non-root.
#   - .next/standalone carries server.js + traced node_modules (sharp's musl
#     prebuilds included via @img/sharp-linuxmusl-x64 — verified in the trace)
#   - geoip-lite is copied verbatim: it fs-reads .dat files tracing can miss
#   - curl only for the HEALTHCHECK
#   - /app/media is bind-mounted by compose (rootless: see DEPLOY.md perms)
# ---------------------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3100 \
    HOSTNAME=0.0.0.0
RUN apk add --no-cache curl && mkdir -p /app/media && chown node:node /app /app/media

COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/node_modules/geoip-lite ./node_modules/geoip-lite

USER node
EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD curl -sf http://127.0.0.1:3100/api/health || exit 1
CMD ["node", "server.js"]
