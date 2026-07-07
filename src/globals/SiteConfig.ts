import type { GlobalConfig } from 'payload'

import { isAdmin, isLoggedIn } from '../collections/access'

/**
 * Global `site-config` — the Section 10 admin schema (architecture.md §3):
 * every runtime knob lives here so behaviour changes need no code changes.
 * Read server-side via the Local API; only admins may edit.
 */
export const SiteConfigGlobal: GlobalConfig = {
  slug: 'site-config',
  label: 'Configurare site',
  admin: {
    description: 'Toate setările de funcționare: reclame, GDPR, CDP, editorial, agregare.',
  },
  access: {
    read: isLoggedIn,
    update: isAdmin,
  },
  fields: [
    {
      name: 'adNetworks',
      label: 'Rețele de publicitate',
      type: 'group',
      fields: [
        {
          name: 'adSensePublisherId',
          label: 'ID editor AdSense',
          type: 'text',
          defaultValue: () =>
            process.env.NEXT_PUBLIC_ADSENSE_PUBLISHER_ID ?? 'ca-pub-8098077913729716',
          admin: { description: 'Identificator public — nu este secret.' },
        },
        {
          name: 'adUnitIds',
          label: 'Unități AdSense',
          type: 'array',
          fields: [
            {
              name: 'slot',
              label: 'Poziție',
              type: 'select',
              required: true,
              options: [
                { label: 'Flux (feed)', value: 'feed' },
                { label: 'Articol — în corp (article)', value: 'article' },
                { label: 'Articol — final (article-end)', value: 'article-end' },
                { label: 'Coloană laterală desktop (rail)', value: 'rail' },
                { label: 'Banner sus (leaderboard)', value: 'leaderboard' },
              ],
            },
            { name: 'unitId', label: 'ID unitate', type: 'text', required: true },
            { name: 'format', type: 'text' },
          ],
        },
        {
          name: 'amazonPartnerTags',
          label: 'Taguri partener Amazon',
          type: 'array',
          // Seeded per arch §3 — pending owner confirmation.
          defaultValue: [{ marketplace: 'www.amazon.de', tag: 'newsr01-21' }],
          fields: [
            { name: 'marketplace', type: 'text', required: true },
            { name: 'tag', type: 'text', required: true },
          ],
        },
      ],
    },
    {
      name: 'localeRules',
      label: 'Reguli regionale',
      type: 'array',
      admin: {
        description: 'Maparea țară → regiune → set de reclame folosită de motorul geo/ads.',
      },
      // Seeded per arch §3/PROJECT_BRIEF §6.2: GB→UK, RO→RO; any unmatched
      // country falls back to region/adSet 'default' in resolveGeo().
      defaultValue: [
        { country: 'GB', region: 'UK', adSet: 'UK' },
        { country: 'RO', region: 'RO', adSet: 'RO' },
      ],
      fields: [
        { name: 'country', label: 'Țară (cod)', type: 'text', required: true },
        { name: 'region', label: 'Regiune', type: 'text', required: true },
        { name: 'adSet', label: 'Set reclame', type: 'text', required: true },
      ],
    },
    {
      name: 'adFrequency',
      label: 'Frecvență reclame',
      type: 'array',
      // v2.2 owner decision: every 3rd post for ALL regions (owner-tunable).
      defaultValue: [
        { region: 'UK', everyNth: 3 },
        { region: 'RO', everyNth: 3 },
        { region: 'default', everyNth: 3 },
      ],
      fields: [
        { name: 'region', label: 'Regiune', type: 'text', required: true },
        { name: 'everyNth', label: 'La fiecare al N-lea articol', type: 'number', required: true },
      ],
    },
    {
      name: 'behaviouralTargeting',
      label: 'Targetare comportamentală',
      type: 'group',
      fields: [
        {
          name: 'enabled',
          label: 'Activă',
          type: 'checkbox',
          defaultValue: true,
        },
        {
          name: 'requiresConsent',
          label: 'Necesită consimțământ',
          type: 'checkbox',
          defaultValue: true,
          admin: {
            readOnly: true,
            description: 'Cerință GDPR — nu poate fi dezactivată.',
          },
          access: {
            update: () => false,
          },
        },
      ],
    },
    {
      name: 'socialPlatforms',
      label: 'Rețele sociale',
      type: 'group',
      fields: [
        {
          name: 'pageUrls',
          label: 'Pagini oficiale',
          type: 'array',
          fields: [
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
            { name: 'url', type: 'text', required: true },
          ],
        },
        {
          name: 'postingSchedule',
          label: 'Ore de postare',
          type: 'array',
          defaultValue: [
            { time: '09:00' },
            { time: '13:00' },
            { time: '18:00' },
            { time: '21:00' },
          ],
          fields: [
            {
              name: 'time',
              label: 'Ora (HH:mm)',
              type: 'text',
              required: true,
              validate: (value: null | string | undefined) =>
                typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
                  ? true
                  : 'Format așteptat: HH:mm (ex. 09:00)',
            },
          ],
        },
      ],
    },
    {
      name: 'gdpr',
      label: 'GDPR',
      type: 'group',
      fields: [
        {
          name: 'consentVersion',
          label: 'Versiune consimțământ',
          type: 'number',
          defaultValue: 1,
          min: 1,
          admin: {
            description: 'Mărește valoarea pentru a cere din nou consimțământul vizitatorilor.',
          },
        },
        {
          name: 'cookieRetentionDays',
          label: 'Retenție cookie (zile)',
          type: 'number',
          defaultValue: 180,
        },
      ],
    },
    {
      name: 'cdp',
      label: 'CDP',
      type: 'group',
      fields: [
        {
          name: 'retentionDays',
          label: 'Retenție date (zile)',
          type: 'number',
          defaultValue: 365,
          admin: {
            description:
              'Se aplică evenimentelor CDP și profilurilor de interese: profilurile nevăzute mai mult de atât sunt șterse de workerul de profile.',
          },
        },
      ],
    },
    {
      name: 'editorial',
      label: 'Editorial',
      type: 'group',
      fields: [
        {
          name: 'seoLanguage',
          label: 'Limbă SEO',
          type: 'text',
          defaultValue: 'ro',
        },
        {
          name: 'minWordCount',
          label: 'Număr minim de cuvinte',
          type: 'number',
          defaultValue: 300,
        },
        {
          name: 'blockPublishOnRed',
          label: 'Blochează publicarea la scor SEO roșu',
          type: 'checkbox',
          defaultValue: false,
        },
      ],
    },
    {
      name: 'aggregation',
      label: 'Agregare',
      type: 'group',
      fields: [
        {
          name: 'itemTtlDays',
          label: 'Durată de viață știri (zile)',
          type: 'number',
          defaultValue: 14,
        },
        {
          name: 'frontPageMaxAgeHours',
          label: 'Vechime maximă prima pagină (ore)',
          type: 'number',
          defaultValue: 72,
        },
        {
          name: 'maxSummariesPerRun',
          label: 'Rezumate maxime per rulare',
          type: 'number',
          defaultValue: 40,
        },
      ],
    },
  ],
}
