import * as migration_20260707_002408_baseline from './20260707_002408_baseline'
import * as migration_20260707_002535_add_articles_published_at from './20260707_002535_add_articles_published_at'

export const migrations = [
  {
    up: migration_20260707_002408_baseline.up,
    down: migration_20260707_002408_baseline.down,
    name: '20260707_002408_baseline',
  },
  {
    up: migration_20260707_002535_add_articles_published_at.up,
    down: migration_20260707_002535_add_articles_published_at.down,
    name: '20260707_002535_add_articles_published_at',
  },
]
