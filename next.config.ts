import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Payload CMS (build step 3) installs into this same app; keep config minimal.
  poweredByHeader: false,
  experimental: {
    // The root layout lives in the (frontend) route group (Payload adds its
    // own root layout in a (payload) group at step 3), so unmatched URLs
    // would otherwise fall through to Next's default English 404.
    // app/global-not-found.tsx provides the branded Romanian one.
    globalNotFound: true,
  },
}

export default nextConfig
