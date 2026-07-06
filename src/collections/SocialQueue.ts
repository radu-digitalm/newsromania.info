import type { CollectionConfig } from 'payload'

import { isEditorOrAdmin } from './access'

/**
 * `social-queue` — prepared social posts (architecture.md §3). Filled by
 * scripts/worker/social.mjs, reviewed in /admin (queued → approved), then
 * executed MANUALLY via Claude in Chrome per docs/social-posting-runbook.md
 * (approved → posted/skipped) — no Meta/X APIs anywhere in the codebase.
 */
export const SocialQueue: CollectionConfig = {
  slug: 'social-queue',
  labels: {
    singular: 'Postare socială',
    plural: 'Coadă socială',
  },
  // Review order = posting order: the list opens on the next thing due.
  defaultSort: 'scheduledFor',
  admin: {
    useAsTitle: 'caption',
    defaultColumns: ['caption', 'platform', 'status', 'scheduledFor', 'contentType', 'postedAt'],
    description:
      'Postări pregătite pentru rețele sociale — aprobate aici, publicate manual (Claude in Chrome), fără API-uri Meta/X.',
  },
  access: {
    read: isEditorOrAdmin,
    create: isEditorOrAdmin,
    update: isEditorOrAdmin,
    delete: isEditorOrAdmin,
  },
  fields: [
    {
      name: 'contentType',
      label: 'Tip conținut',
      type: 'select',
      required: true,
      options: [
        { label: 'Articol original', value: 'original' },
        { label: 'Știre preluată', value: 'aggregated' },
      ],
    },
    {
      name: 'refId',
      type: 'text',
      required: true,
      index: true,
      admin: { description: 'ID-ul articolului sau al știrii preluate.' },
    },
    {
      name: 'platform',
      label: 'Platformă',
      type: 'select',
      required: true,
      options: [
        { label: 'Facebook', value: 'facebook' },
        { label: 'Instagram', value: 'instagram' },
        { label: 'Twitter / X', value: 'twitter' },
      ],
    },
    {
      name: 'caption',
      label: 'Text postare',
      type: 'textarea',
      admin: { description: 'Formatat per platformă.' },
    },
    {
      name: 'imageUrl',
      label: 'URL imagine',
      type: 'text',
    },
    {
      name: 'link',
      type: 'text',
    },
    {
      name: 'scheduledFor',
      label: 'Programat pentru',
      type: 'date',
      index: true,
    },
    {
      name: 'status',
      label: 'Stare',
      type: 'select',
      required: true,
      defaultValue: 'queued',
      options: [
        { label: 'În coadă', value: 'queued' },
        { label: 'Aprobat', value: 'approved' },
        { label: 'Postat', value: 'posted' },
        { label: 'Omis', value: 'skipped' },
      ],
    },
    {
      name: 'postedAt',
      label: 'Postat la',
      type: 'date',
    },
  ],
}
