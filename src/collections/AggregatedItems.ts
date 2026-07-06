import type { CollectionConfig } from 'payload'

import { purgeFeedCache } from '../lib/redis'
import { slugifyHook } from '../lib/slugify'
import { anyone, isAdmin, isEditorOrAdmin } from './access'

/**
 * `aggregated-items` — third-party stories (architecture.md §3): excerpt +
 * attribution + link out. NEVER stores full third-party text. Written mainly
 * by the ingest worker via the Local API.
 */
export const AggregatedItems: CollectionConfig = {
  slug: 'aggregated-items',
  labels: {
    singular: 'Știre preluată',
    plural: 'Știri preluate',
  },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'sourceName', 'category', 'publishedAt', 'archived'],
    description:
      'Știri de la terți: doar rezumat + atribuire + link către sursă. Niciodată text integral.',
  },
  access: {
    read: anyone,
    create: isEditorOrAdmin,
    update: isEditorOrAdmin,
    delete: isAdmin,
  },
  hooks: {
    afterChange: [
      async ({ doc, req }) => {
        try {
          await purgeFeedCache()
        } catch (err) {
          req.payload.logger.error({
            err,
            msg: 'aggregated-items afterChange: purgeFeedCache failed',
          })
        }
        return doc
      },
    ],
  },
  fields: [
    {
      name: 'title',
      label: 'Titlu',
      type: 'text',
      required: true,
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      hooks: {
        beforeValidate: [slugifyHook('title')],
      },
    },
    {
      name: 'guid',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: { description: 'Cheie de deduplicare din feedul RSS.' },
    },
    {
      name: 'sourceUrl',
      label: 'URL sursă',
      type: 'text',
      required: true,
      admin: { description: 'Adresa canonică a știrii la publicatorul original.' },
    },
    {
      name: 'sourceName',
      label: 'Nume sursă',
      type: 'text',
      required: true,
    },
    {
      name: 'sourceHomepage',
      label: 'Site sursă',
      type: 'text',
    },
    {
      name: 'feed',
      label: 'Feed',
      type: 'relationship',
      relationTo: 'feeds',
    },
    {
      name: 'excerpt',
      label: 'Rezumat',
      type: 'textarea',
      admin: {
        description: 'Rezumat AI transformativ (fair-use). Gol când elementul este doar link.',
      },
    },
    {
      name: 'linkOnly',
      label: 'Doar link',
      type: 'checkbox',
      defaultValue: true,
    },
    {
      name: 'category',
      label: 'Categorie',
      type: 'relationship',
      relationTo: 'categories',
    },
    {
      name: 'tags',
      label: 'Etichete',
      type: 'relationship',
      relationTo: 'tags',
      hasMany: true,
    },
    {
      name: 'imageUrl',
      label: 'URL imagine',
      type: 'text',
    },
    {
      name: 'imageAllowed',
      label: 'Imagine permisă',
      type: 'checkbox',
      defaultValue: false,
      admin: {
        description: 'Doar imagini din enclosure/media:content al feedului RSS.',
      },
    },
    {
      name: 'publishedAt',
      label: 'Publicat la',
      type: 'date',
      required: true,
      index: true,
    },
    {
      name: 'clusterKey',
      type: 'text',
      index: true,
      admin: { description: 'Cheie de grupare pentru știri aproape identice.' },
    },
    {
      name: 'contentHash',
      type: 'text',
      admin: { description: 'Hash de conținut — evită re-rezumarea.' },
    },
    {
      name: 'archived',
      label: 'Arhivat',
      type: 'checkbox',
      defaultValue: false,
      index: true,
    },
  ],
}
