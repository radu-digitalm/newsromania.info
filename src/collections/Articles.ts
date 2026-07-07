import type { CollectionConfig, Where } from 'payload'
import { Forbidden } from 'payload'

import { purgeFeedCache } from '../lib/redis'
import { seoAnalyzeBeforeChange } from '../lib/seo-analyzer/hook'
import { slugifyHook } from '../lib/slugify'
import { getRole, isEditorOrAdmin, isLoggedIn } from './access'

/**
 * `articles` — ORIGINAL in-house articles (architecture.md §3). Full body on
 * site, author byline, self-canonical. Drafts + autosave + scheduled publish.
 * Access: published readable by all; drafts by owner/editor+; authors never
 * publish and never delete published content.
 */
export const Articles: CollectionConfig = {
  slug: 'articles',
  labels: {
    singular: 'Articol',
    plural: 'Articole',
  },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'category', 'author', '_status', 'seo.seoScore'],
    description: 'Articole originale ale redacției — text integral, semnătură de autor.',
  },
  versions: {
    drafts: {
      autosave: true,
      schedulePublish: true,
    },
    maxPerDoc: 20,
  },
  access: {
    read: ({ req }) => {
      const role = getRole(req)
      if (role === 'admin' || role === 'editor') return true
      if (req.user) {
        const ownOrPublished: Where = {
          or: [{ _status: { equals: 'published' } }, { author: { equals: req.user.id } }],
        }
        return ownOrPublished
      }
      return { _status: { equals: 'published' } }
    },
    create: isLoggedIn,
    update: ({ req }) => {
      const role = getRole(req)
      if (role === 'admin' || role === 'editor') return true
      if (req.user) return { author: { equals: req.user.id } }
      return false
    },
    delete: ({ req }) => {
      const role = getRole(req)
      if (role === 'admin' || role === 'editor') return true
      if (req.user) {
        // Authors: only their own never-published drafts.
        const ownDrafts: Where = {
          and: [{ author: { equals: req.user.id } }, { _status: { not_equals: 'published' } }],
        }
        return ownDrafts
      }
      return false
    },
    readVersions: isEditorOrAdmin,
  },
  hooks: {
    beforeChange: [
      ({ data, req, originalDoc }) => {
        const role = getRole(req)
        if (role === 'author') {
          // Authors never publish (arch §3) — neither directly nor by editing
          // an already-published doc.
          if (data?._status === 'published' || originalDoc?._status === 'published') {
            throw new Forbidden(req.t)
          }
          // Authors always write under their own byline.
          if (req.user) data.author = req.user.id
        }
        return data
      },
      // Stamp publishedAt on the FIRST draft→published transition (covers
      // schedulePublish jobs too — they update with _status 'published').
      // Never overwritten afterwards; editors may still adjust it manually.
      ({ data, originalDoc }) => {
        if (data?._status === 'published' && !data.publishedAt && !originalDoc?.publishedAt) {
          data.publishedAt = new Date().toISOString()
        }
        return data
      },
      // Adevărul SEO de pe server: scrie seo.seoScore/seoReport și aplică
      // poarta de publicare blockPublishOnRed (arch §4).
      seoAnalyzeBeforeChange,
    ],
    afterChange: [
      async ({ doc, previousDoc, req }) => {
        // Draft autosaves don't affect the public feed — only (un)publishing
        // or editing a published article invalidates the cache.
        const touchesPublished =
          doc?._status === 'published' || previousDoc?._status === 'published'
        if (!touchesPublished) return doc
        try {
          await purgeFeedCache()
        } catch (err) {
          req.payload.logger.error({ err, msg: 'articles afterChange: purgeFeedCache failed' })
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
      admin: {
        position: 'sidebar',
        description: 'Se generează automat din titlu; poate fi ajustat manual.',
      },
      hooks: {
        beforeValidate: [slugifyHook('title')],
      },
    },
    {
      name: 'category',
      label: 'Categorie',
      type: 'relationship',
      relationTo: 'categories',
      required: true,
      admin: { position: 'sidebar' },
    },
    {
      name: 'tags',
      label: 'Etichete',
      type: 'relationship',
      relationTo: 'tags',
      hasMany: true,
      admin: { position: 'sidebar' },
    },
    {
      name: 'author',
      label: 'Autor',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      defaultValue: ({ user }) => user?.id,
      admin: { position: 'sidebar' },
      access: {
        // Only editors+ may reassign a byline.
        update: ({ req }) => {
          const role = getRole(req)
          return role === 'admin' || role === 'editor'
        },
      },
    },
    {
      name: 'publishedAt',
      label: 'Data publicării',
      type: 'date',
      index: true,
      admin: {
        position: 'sidebar',
        date: { pickerAppearance: 'dayAndTime' },
        description:
          'Setată automat la prima publicare (inclusiv programată). Baza pentru ordinea în flux, byline, JSON-LD și sitemap.',
      },
    },
    {
      name: 'excerpt',
      label: 'Rezumat',
      type: 'textarea',
      maxLength: 300,
    },
    {
      name: 'body',
      label: 'Conținut',
      type: 'richText',
      required: true,
    },
    {
      name: 'featuredImage',
      label: 'Imagine principală',
      type: 'upload',
      relationTo: 'media',
      admin: { position: 'sidebar' },
    },
    {
      name: 'seo',
      label: 'SEO',
      type: 'group',
      fields: [
        {
          // Panoul live „Analiză SEO” (semafor + verificări + snippet Google).
          name: 'seoPanel',
          type: 'ui',
          admin: {
            components: {
              Field: '@/components/admin/SeoPanel#SeoPanel',
            },
          },
        },
        {
          name: 'metaTitle',
          label: 'Meta titlu',
          type: 'text',
        },
        {
          name: 'metaDescription',
          label: 'Meta descriere',
          type: 'textarea',
        },
        {
          name: 'focusKeyword',
          label: 'Cuvânt-cheie principal',
          type: 'text',
        },
        {
          name: 'seoScore',
          label: 'Scor SEO',
          type: 'select',
          defaultValue: 'unscored',
          options: [
            { label: 'Verde', value: 'green' },
            { label: 'Galben', value: 'amber' },
            { label: 'Roșu', value: 'red' },
            { label: 'Neevaluat', value: 'unscored' },
          ],
          admin: {
            readOnly: true,
            description: 'Calculat automat de analizatorul SEO la salvare.',
          },
        },
        {
          name: 'seoReport',
          type: 'json',
          admin: { hidden: true },
        },
      ],
    },
  ],
}
