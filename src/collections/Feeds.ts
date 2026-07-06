import type { CollectionConfig } from 'payload'

import { isAdmin, isLoggedIn } from './access'

/**
 * `feeds` — RSS sources (architecture.md §3). New feeds start inactive with
 * `link-only`; the owner flips `excerptPolicy` to `ai-excerpt` only after
 * checking the publisher's T&Cs (legal gate 0.1) — hence admin-only writes.
 */
export const Feeds: CollectionConfig = {
  slug: 'feeds',
  labels: {
    singular: 'Sursă RSS',
    plural: 'Surse RSS',
  },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'active', 'excerptPolicy', 'lastFetchedAt', 'consecutiveFailures'],
    description:
      'Surse RSS agregate. Activarea și politica de rezumat se schimbă doar după verificarea termenilor publicatorului.',
  },
  access: {
    read: isLoggedIn,
    create: isAdmin,
    update: isAdmin,
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
      name: 'url',
      label: 'URL feed',
      type: 'text',
      required: true,
      unique: true,
      index: true,
    },
    {
      name: 'homepage',
      label: 'Pagină principală',
      type: 'text',
    },
    {
      name: 'active',
      label: 'Activ',
      type: 'checkbox',
      defaultValue: false,
    },
    {
      name: 'excerptPolicy',
      label: 'Politică rezumat',
      type: 'select',
      required: true,
      defaultValue: 'link-only',
      options: [
        { label: 'Doar link (fără rezumat AI)', value: 'link-only' },
        { label: 'Rezumat AI (după verificarea T&C)', value: 'ai-excerpt' },
      ],
    },
    {
      name: 'defaultCategory',
      label: 'Categorie implicită',
      type: 'relationship',
      relationTo: 'categories',
    },
    {
      name: 'pollMinutes',
      label: 'Interval interogare (minute)',
      type: 'number',
      defaultValue: 30,
      min: 5,
    },
    {
      // Presentational only (collapsible keeps the contract's flat field
      // names: lastFetchedAt, lastItemAt, lastError, consecutiveFailures).
      label: 'Stare feed',
      type: 'collapsible',
      admin: { description: 'Actualizat automat de workerul de ingestie.' },
      fields: [
        {
          name: 'lastFetchedAt',
          label: 'Ultima interogare',
          type: 'date',
          admin: { readOnly: true },
        },
        {
          name: 'lastItemAt',
          label: 'Ultimul articol',
          type: 'date',
          admin: { readOnly: true },
        },
        {
          name: 'lastError',
          label: 'Ultima eroare',
          type: 'text',
          admin: { readOnly: true },
        },
        {
          name: 'consecutiveFailures',
          label: 'Eșecuri consecutive',
          type: 'number',
          defaultValue: 0,
          admin: { readOnly: true },
        },
      ],
    },
  ],
}
