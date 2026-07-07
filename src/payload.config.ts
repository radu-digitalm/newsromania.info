import path from 'path'
import { fileURLToPath } from 'url'

import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { buildConfig } from 'payload'
import sharp from 'sharp'

import { AggregatedItems } from './collections/AggregatedItems'
import { Articles } from './collections/Articles'
import { Categories } from './collections/Categories'
import { CdpEvents } from './collections/CdpEvents'
import { CdpProfiles } from './collections/CdpProfiles'
import { ConsentRecords } from './collections/ConsentRecords'
import { Feeds } from './collections/Feeds'
import { LlmUsage } from './collections/LlmUsage'
import { Media } from './collections/Media'
import { SocialQueue } from './collections/SocialQueue'
import { Tags } from './collections/Tags'
import { Users } from './collections/Users'
import { SiteConfigGlobal } from './globals/SiteConfig'

const dirname = path.dirname(fileURLToPath(import.meta.url))

export default buildConfig({
  secret: process.env.PAYLOAD_SECRET || '',
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL,
    },
    // Dev-only schema sync (Payload skips push when NODE_ENV=production).
    // Production uses the generated migrations in src/migrations/, applied
    // HOST-SIDE against the loopback port per deploy/DEPLOY.md §1 — the
    // container entrypoint runs only `node server.js`.
    push: true,
  }),
  editor: lexicalEditor(),
  sharp,
  admin: {
    user: Users.slug,
    components: {
      // Panoul operațional (PROJECT_BRIEF §17) — deasupra dashboardului admin.
      beforeDashboard: ['@/components/admin/OpsDashboard#OpsDashboard'],
    },
    importMap: {
      baseDir: path.resolve(dirname),
    },
    meta: {
      titleSuffix: ' — NewsRomania Admin',
    },
  },
  collections: [
    Users,
    Media,
    Articles,
    AggregatedItems,
    Categories,
    Tags,
    Feeds,
    ConsentRecords,
    CdpEvents,
    CdpProfiles,
    SocialQueue,
    LlmUsage,
  ],
  globals: [SiteConfigGlobal],
  jobs: {
    // Required for versions.drafts.schedulePublish (articles): Payload queues
    // a schedulePublish job; this cron executes due jobs while the app runs.
    autoRun: [
      {
        cron: '* * * * *',
        limit: 10,
        queue: 'default',
      },
    ],
  },
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
})
