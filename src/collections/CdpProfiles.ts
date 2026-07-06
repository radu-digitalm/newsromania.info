import type { CollectionConfig } from 'payload'

import { isAdmin } from './access'

/**
 * `cdp-profiles` — aggregated visitor profiles (architecture.md §3).
 * Upserted by the profile aggregation job via the Local API.
 */
export const CdpProfiles: CollectionConfig = {
  slug: 'cdp-profiles',
  labels: {
    singular: 'Profil CDP',
    plural: 'Profiluri CDP',
  },
  admin: {
    useAsTitle: 'visitorId',
    defaultColumns: ['visitorId', 'lastRegion', 'lastSeenAt', 'visits', 'consentState'],
    description: 'Profiluri agregate de interese, doar pentru vizitatori cu consimțământ.',
  },
  access: {
    read: isAdmin,
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  fields: [
    {
      name: 'visitorId',
      type: 'text',
      required: true,
      unique: true,
      index: true,
    },
    {
      name: 'interests',
      label: 'Interese',
      type: 'json',
      admin: { description: 'Ponderi pe categorii: { categorySlug: weight }.' },
    },
    {
      name: 'lastRegion',
      label: 'Ultima regiune',
      type: 'text',
    },
    {
      name: 'lastSeenAt',
      label: 'Văzut ultima dată',
      type: 'date',
    },
    {
      name: 'visits',
      label: 'Vizite',
      type: 'number',
      defaultValue: 0,
    },
    {
      name: 'consentState',
      label: 'Stare consimțământ',
      type: 'select',
      defaultValue: 'unknown',
      options: [
        { label: 'Acceptat', value: 'accepted' },
        { label: 'Refuzat', value: 'refused' },
        { label: 'Retras', value: 'withdrawn' },
        { label: 'Necunoscut', value: 'unknown' },
      ],
    },
  ],
}
