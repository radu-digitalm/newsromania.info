import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'NewsRomania — Știri din România, la zi',
    short_name: 'NewsRomania',
    description:
      'Știri din România, la zi: actualitate, politică, economie, internațional, sport, tehnologie, sănătate și cultură.',
    lang: 'ro',
    start_url: '/',
    display: 'standalone',
    background_color: '#FAF9F6',
    theme_color: '#FFFFFF',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
