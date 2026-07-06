import type { CollectionConfig } from 'payload'

import { slugifyHook } from '../lib/slugify'
import { anyone, isAdmin, isEditorOrAdmin } from './access'

/**
 * `categories` — the 8 canonical slugs are seeded by scripts/seed/baseline.mjs
 * (actualitate, politica, economie, externe, sport, sanatate, tehnologie,
 * cultura); the collection stays extensible (architecture.md §3).
 */
export const Categories: CollectionConfig = {
  slug: 'categories',
  labels: {
    singular: 'Categorie',
    plural: 'Categorii',
  },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'slug'],
  },
  access: {
    read: anyone,
    create: isEditorOrAdmin,
    update: isEditorOrAdmin,
    delete: isAdmin,
  },
  fields: [
    {
      name: 'name',
      label: 'Nume',
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
        beforeValidate: [slugifyHook('name')],
      },
    },
  ],
}
