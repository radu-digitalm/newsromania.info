import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  poweredByHeader: false,
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
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
