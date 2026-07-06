import path from 'path'
import { fileURLToPath } from 'url'

import type { CollectionConfig } from 'payload'

import { anyone, isEditorOrAdmin, isLoggedIn } from './access'

const dirname = path.dirname(fileURLToPath(import.meta.url))

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
    // Repo-root ./media — bind-mounted by compose in production (arch §9).
    staticDir: path.resolve(dirname, '../../media'),
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
