import type { CollectionConfig } from 'payload'

import { slugifyHook } from '../lib/slugify'
import { anyone, isAdmin, isEditorOrAdmin } from './access'

/** `tags` — free-form taxonomy (architecture.md §3). */
export const Tags: CollectionConfig = {
  slug: 'tags',
  labels: {
    singular: 'Etichetă',
    plural: 'Etichete',
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
