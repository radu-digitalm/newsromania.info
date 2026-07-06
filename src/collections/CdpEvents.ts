import type { CollectionConfig } from 'payload'

import { isAdmin, noOne } from './access'

/**
 * `cdp-events` — first-party behavioural events (architecture.md §3).
 * Insert-only; written by src/lib/cdp.ts `trackEvents()` AFTER server-side
 * consent validation. REST access closed to the public.
 */
export const CdpEvents: CollectionConfig = {
  slug: 'cdp-events',
  labels: {
    singular: 'Eveniment CDP',
    plural: 'Evenimente CDP',
  },
  admin: {
    defaultColumns: ['visitorId', 'type', 'path', 'region', 'ts'],
    description: 'Evenimente comportamentale primare (doar cu consimțământ). Doar în adăugare.',
  },
  access: {
    read: isAdmin,
    create: isAdmin,
    update: noOne,
    delete: isAdmin,
  },
  fields: [
    {
      name: 'visitorId',
      type: 'text',
      required: true,
      index: true,
    },
    {
      name: 'type',
      label: 'Tip',
      type: 'select',
      required: true,
      options: [
        { label: 'Vizualizare pagină', value: 'page_view' },
        { label: 'Click articol', value: 'article_click' },
        { label: 'Adâncime derulare', value: 'scroll_depth' },
        { label: 'Timp pe pagină', value: 'time_on_page' },
        { label: 'Lectură categorie', value: 'category_read' },
        { label: 'Afișare reclamă', value: 'ad_impression' },
        { label: 'Click reclamă', value: 'ad_click' },
      ],
    },
    {
      name: 'path',
      type: 'text',
    },
    {
      name: 'articleId',
      type: 'text',
    },
    {
      name: 'category',
      type: 'text',
    },
    {
      name: 'value',
      type: 'number',
    },
    {
      name: 'region',
      type: 'text',
    },
    {
      name: 'ts',
      label: 'Moment',
      type: 'date',
      required: true,
      defaultValue: () => new Date().toISOString(),
      index: true,
    },
  ],
}
