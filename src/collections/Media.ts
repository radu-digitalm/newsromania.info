import path from 'path'

import type { CollectionConfig } from 'payload'

import { anyone, isEditorOrAdmin, isLoggedIn } from './access'

/**
 * `media` — owned images ONLY (architecture.md §3): uploads by the redaction
 * for original articles. Third-party/aggregated images are never uploaded
 * here (aggregated-items keeps `imageUrl` + `imageAllowed` instead).
 */
export const Media: CollectionConfig = {
  slug: 'media',
  labels: {
    singular: 'Fișier media',
    plural: 'Fișiere media',
  },
  admin: {
    useAsTitle: 'alt',
    description: 'Doar imagini proprii (încărcate de redacție). Niciodată imagini preluate.',
  },
  access: {
    read: anyone,
    create: isLoggedIn,
    update: isEditorOrAdmin,
    delete: isEditorOrAdmin,
  },
  upload: {
    // ./media relative to the process working directory: repo root in dev
    // and for host-side workers, /app in the standalone container (compose
    // bind-mounts ./media:/app/media — arch §9). NOT import.meta.url-based:
    // inside the standalone bundle that would point into .next/server/.
    staticDir: path.resolve(process.cwd(), 'media'),
    mimeTypes: ['image/*'],
    imageSizes: [
      { name: 'thumbnail', width: 480 },
      { name: 'card', width: 960 },
      { name: 'hero', width: 1600 },
    ],
  },
  fields: [
    {
      name: 'alt',
      label: 'Text alternativ',
      type: 'text',
      required: true,
    },
  ],
}
