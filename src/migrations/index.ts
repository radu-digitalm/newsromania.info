import * as migration_20260707_002408_baseline from './20260707_002408_baseline'
import * as migration_20260707_002535_add_articles_published_at from './20260707_002535_add_articles_published_at'
import * as migration_20260707_080005_add_ad_unit_article_end_slot from './20260707_080005_add_ad_unit_article_end_slot'

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
  {
    up: migration_20260707_080005_add_ad_unit_article_end_slot.up,
    down: migration_20260707_080005_add_ad_unit_article_end_slot.down,
    name: '20260707_080005_add_ad_unit_article_end_slot',
  },
]
