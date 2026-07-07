# syntax=docker/dockerfile:1
# ============================================================================
# newsromania.info — production image (architecture.md §9)
# Multi-stage: build (npm ci + next build, standalone) -> runner.
#
# BUILD CACHING (2026-07): the docker buildx plugin is installed
# (~/.docker/cli-plugins/docker-buildx), so `docker compose build` uses
# BuildKit — not the classic builder. Two cache mounts below make rebuilds
# ~4-5x faster: npm's download cache and Next's incremental build cache persist
# ACROSS builds in the BuildKit cache (NOT in the image layer, so the runtime
# image stays lean). Measured: cold 165s, unchanged 2s, one-file change ~106s
# (was ~480s from-scratch every time). Deps layer is skipped when package*.json
# are unchanged. Single build stage (not split deps/build) keeps PEAK disk low.
#
# Build discipline on this shared VPS (see deploy/DEPLOY.md):
#   - check `df -h /` first; do NOT build with < 3 GB free
#   - afterwards: `docker image prune -f` (removes dangling stage images).
#     Do NOT run `docker builder prune` casually — it WIPES the ~2 GB build
#     cache and the next build goes cold again. Only prune it under real disk
#     pressure, e.g. `docker builder prune --keep-storage 2GB`.
# Build:  docker compose --profile app build   (or: docker build -t newsromania-app .)
# Run:    docker compose --profile app up -d   (publishes 127.0.0.1:3100)
# ============================================================================

FROM node:24-alpine AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

# ---------------------------------------------------------------------------
# build — npm ci, then next build with output:'standalone'.
# vendor/ must be present: @amzn/creatorsapi-nodejs-sdk is a file: dependency
# (npm symlinks it; its prebuilt dist/ ships in the build context — npm does
# NOT run lifecycle scripts of file:-linked packages, so no babel needed).
# npm cache clean happens in the SAME layer as npm ci: the tarball cache
# (~0.5 GB) would otherwise be committed into the layer (disk discipline).
#
# The dummy ARG values below are shape-valid ONLY so payload.config.ts can be
# imported during the build; every content route is force-dynamic, so the
# build never opens a DB/Redis connection (pg Pool + ioredis are both lazy).
# NOTHING secret is baked into layers — real values come from .env at runtime
# (compose `env_file` + container-perspective overrides).
# NEXT_PUBLIC_* values ARE inlined into the client bundle by design; both
# defaults below are public-facing (CLAUDE.md).
# ---------------------------------------------------------------------------
FROM base AS build
# npm ci BEFORE any NODE_ENV=production ENV — devDependencies (typescript,
# tailwind, …) are required to run `next build`.
COPY package.json package-lock.json ./
COPY vendor ./vendor
# BuildKit cache mount: npm's download cache persists ACROSS builds (in the
# builder cache, NOT the image layer), so `npm ci` re-downloads nothing when
# the lockfile is unchanged — and this whole layer is skipped entirely when
# package*.json don't change. No `npm cache clean` needed: the cache lives in
# the mount, never in the committed layer.
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm ci --prefer-offline --no-audit --no-fund
ARG DATABASE_URL=postgres://build:build@127.0.0.1:5432/build
ARG REDIS_URL=redis://default:build@127.0.0.1:6379
ARG PAYLOAD_SECRET=build-time-dummy-secret-not-used-at-runtime
ARG NEXT_PUBLIC_SITE_URL=https://newsromania.info
ARG NEXT_PUBLIC_ADSENSE_PUBLISHER_ID=ca-pub-8098077913729716
# Ad PREVIEW mode (labelled demo boxes so the owner can see ad placement while
# AdSense review is pending) — '0' for public launch. Inlined at build time.
ARG NEXT_PUBLIC_AD_PREVIEW=0
ENV DATABASE_URL=$DATABASE_URL \
    REDIS_URL=$REDIS_URL \
    PAYLOAD_SECRET=$PAYLOAD_SECRET \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_ADSENSE_PUBLISHER_ID=$NEXT_PUBLIC_ADSENSE_PUBLISHER_ID \
    NEXT_PUBLIC_AD_PREVIEW=$NEXT_PUBLIC_AD_PREVIEW \
    NODE_ENV=production
COPY . .
# BuildKit cache mount: Next's incremental build cache (.next/cache) persists
# ACROSS builds in the builder cache, so a source change recompiles only what
# changed instead of the whole app (~2-3x faster rebuilds). It lives in the
# mount, never in the committed layer, so the runtime image stays lean and no
# `rm -rf .next/cache` is needed (only .next/standalone + static are copied to
# the runner stage).
RUN --mount=type=cache,target=/app/.next/cache,sharing=locked \
    npm run build

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
