import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Production runtime (arch §9): .next/standalone is what the Docker runner
  // stage ships — server.js + traced node_modules only, never the full tree.
  output: 'standalone',
  // Two packages load files in ways output-file-tracing cannot see, so they
  // must be included explicitly or the standalone server breaks:
  //   - geoip-lite fs-reads its .dat database with computed paths
  //   - sharp's libvips .so is dlopen'd via RPATH (tracing keeps the .node
  //     binding but drops libvips-cpp.so → ERR_DLOPEN_FAILED at runtime)
  // The @img glob also covers the musl variants used inside the Alpine image.
  outputFileTracingIncludes: {
    '/**/*': ['./node_modules/geoip-lite/**', './node_modules/@img/**'],
  },
  // geoip-lite reads its GeoLite2 .dat files from node_modules at runtime;
  // bundling it breaks those relative data paths (ENOENT geoip-country.dat
  // at build/runtime) — keep it external and require()d from node_modules.
  serverExternalPackages: ['geoip-lite'],
  experimental: {
    // The root layout lives in the (frontend) route group (Payload has its
    // own root layout in the (payload) group), so unmatched URLs would
    // otherwise fall through to Next's default English 404.
    // app/global-not-found.tsx provides the branded Romanian one.
    globalNotFound: true,
  },
  // Self-hosted Umami served SAME-ORIGIN (PROJECT_BRIEF §7) — first-party,
  // cookieless analytics; no third-party host, no CMP needed. Proxying is done
  // by the route handler at `src/app/stats/[[...path]]/route.ts`, NOT a rewrite
  // here: the handler must additionally rewrite Umami's root-absolute `/_next/`
  // chunk refs (baked into its client bundle at build time; unreachable by the
  // server.js assetPrefix patch) to `/stats/_next/` in the HTML/RSC response
  // body, or the dashboard never boots (blank page). A `next.config` rewrite
  // forwards the request but cannot transform the response body, so it cannot
  // fix that. See that file's header for the full rationale.
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
