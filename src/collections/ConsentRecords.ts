import type { CollectionConfig } from 'payload'

import { isAdmin, noOne } from './access'

/**
 * `consent-records` — GDPR proof-of-consent log (architecture.md §3).
 * Create-only, written exclusively by POST /api/consent through the Local
 * API; no public read, never updated. `ipHash` = sha256(ip + PAYLOAD_SECRET),
 * never the raw IP.
 *
 * SUPERSEDED by Google's certified CMP (CMP reconciliation 2026-07): the
 * custom banner that POSTed to /api/consent was retired, so no new rows are
 * written in production — advertising consent (and its proof) is now handled
 * by Google's CMP. This collection is left in place (harmless) in case the
 * first-party consent flow is ever reinstated.
 */
export const ConsentRecords: CollectionConfig = {
  slug: 'consent-records',
  labels: {
    singular: 'Înregistrare consimțământ',
    plural: 'Înregistrări consimțământ',
  },
  admin: {
    defaultColumns: ['choice', 'ts', 'visitorId'],
    description: 'Jurnal GDPR, doar în adăugare. Scris exclusiv de API-ul de consimțământ.',
  },
  access: {
    // The /api/consent route inserts via the Local API (bypasses access);
    // Payload REST stays closed to the public.
    read: isAdmin,
    create: isAdmin,
    update: noOne,
    delete: isAdmin,
  },
  fields: [
    {
      name: 'choice',
      label: 'Alegere',
      type: 'select',
      required: true,
      options: [
        { label: 'Acceptat', value: 'accepted' },
        { label: 'Refuzat', value: 'refused' },
        { label: 'Retras', value: 'withdrawn' },
      ],
    },
    {
      name: 'ts',
      label: 'Moment',
      type: 'date',
      required: true,
      defaultValue: () => new Date().toISOString(),
    },
    {
      name: 'visitorId',
      type: 'text',
      admin: {
        description:
          'La acceptare: ID-ul nou emis. La refuz/retragere: ID-ul existent cedat ' +
          '(dacă există) — folosit de workerul de profile pentru ștergerea datelor CDP.',
      },
    },
    {
      name: 'ipHash',
      type: 'text',
      admin: { description: 'sha256(ip + secret) — niciodată IP-ul brut.' },
    },
    {
      name: 'userAgent',
      type: 'text',
      maxLength: 160,
    },
  ],
}
