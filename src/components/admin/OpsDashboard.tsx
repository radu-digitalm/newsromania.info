'use client'

/**
 * Panoul operațional din adminul Payload (PROJECT_BRIEF §17, build step 13):
 * montat ca `admin.components.beforeDashboard`, citește /api/admin/ops-stats
 * (autentificat cu sesiunea de admin, agregat server-side, cache Redis 60 s)
 * și afișează carduri compacte: sănătatea surselor RSS, conținut, consum LLM,
 * CDP/consimțământ, coadă socială, configurare reclame.
 *
 * Se reîmprospătează automat la 60 s — aliniat cu TTL-ul cache-ului din rută.
 */
import { Banner, Button, ShimmerEffect } from '@payloadcms/ui'
import React, { useCallback, useEffect, useState } from 'react'

import type { OpsStats } from '@/lib/ops-stats'
import { FeedHealthCard } from './ops/FeedHealthCard'
import { LlmUsageCard } from './ops/LlmUsageCard'
import { MostReadCard } from './ops/MostReadCard'
import { formatInt, OpsCard, Stat } from './ops/OpsCard'

const REFRESH_MS = 60_000

// Ingestia rulează la fiecare câteva minute; peste 2 h fără articol nou =
// worker blocat sau surse căzute → evidențiem vârsta cu roșu.
const STALE_INGEST_MINUTES = 120

const timeFormat = new Intl.DateTimeFormat('ro-RO', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

/** Vârsta celui mai recent articol, în text uman (ro-RO). */
function formatFreshness(minutes: number | null): string {
  if (minutes === null) return 'niciun articol'
  if (minutes < 1) return 'chiar acum'
  if (minutes < 60) return `acum ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `acum ${hours} h`
  const daysAgo = Math.floor(hours / 24)
  return `acum ${daysAgo} ${daysAgo === 1 ? 'zi' : 'zile'}`
}

export function OpsDashboard(): React.ReactElement {
  const [stats, setStats] = useState<OpsStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)

  // Lanț de promisiuni (nu async/await) ca setState să ruleze doar în
  // callback-uri — cerință react-hooks/set-state-in-effect (vezi SeoPanel).
  const load = useCallback((): void => {
    fetch('/api/admin/ops-stats', { credentials: 'include', cache: 'no-store' })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }
        return response.json() as Promise<OpsStats>
      })
      .then((data) => {
        setStats(data)
        setError(null)
        setUpdatedAt(new Date())
      })
      .catch(() => {
        setError('Statisticile operaționale nu au putut fi încărcate.')
      })
  }, [])

  useEffect(() => {
    load()
    const timer = setInterval(load, REFRESH_MS)
    return () => clearInterval(timer)
  }, [load])

  return (
    <div style={{ marginBottom: '2rem' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: '1rem',
          flexWrap: 'wrap',
          marginBottom: '0.75rem',
        }}
      >
        <h2 style={{ margin: 0, fontSize: '18px' }}>Stare operațională</h2>
        <span aria-live="polite" style={{ fontSize: '12px', color: 'var(--theme-elevation-600)' }}>
          {updatedAt
            ? `Actualizat la ${timeFormat.format(updatedAt)} · se reîmprospătează la fiecare 60 s`
            : 'Se încarcă…'}
        </span>
      </div>

      {error && !stats && (
        <Banner type="error">
          <span style={{ marginRight: '0.75rem' }}>{error}</span>
          <Button size="small" buttonStyle="secondary" onClick={load}>
            Reîncearcă
          </Button>
        </Banner>
      )}

      {error && stats && (
        <Banner type="error">
          {error} Se afișează ultimele date cunoscute; reîmprospătarea continuă automat.
        </Banner>
      )}

      {!stats && !error && <ShimmerEffect height="180px" />}

      {stats && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '0.75rem',
            fontSize: '13px',
            lineHeight: 1.5,
          }}
        >
          <MostReadCard items={stats.mostRead} />

          <FeedHealthCard feeds={stats.feeds} />

          <OpsCard title="Conținut">
            <Stat label="Articole originale publicate" value={formatInt(stats.content.originals)} />
            <Stat label="Știri agregate active" value={formatInt(stats.content.aggregated)} />
            <Stat label="Publicate azi" value={formatInt(stats.content.publishedToday)} emphasis />
            <Stat
              label="Ingestate în ultima oră"
              value={formatInt(stats.content.ingestedLastHour)}
            />
            <Stat
              label="Cel mai recent articol"
              value={formatFreshness(stats.content.newestItemAgeMinutes)}
              alert={
                stats.content.newestItemAgeMinutes !== null &&
                stats.content.newestItemAgeMinutes > STALE_INGEST_MINUTES
              }
            />
          </OpsCard>

          <LlmUsageCard llm={stats.llm} />

          <OpsCard title="CDP și consimțământ">
            <Stat
              label="Vizualizări azi (cu consimțământ)"
              value={formatInt(stats.cdp.todayViews)}
            />
            <Stat
              label="Vizitatori unici azi"
              value={formatInt(stats.cdp.todayVisitors)}
              emphasis
            />
            <Stat label="Evenimente (24 h)" value={formatInt(stats.cdp.events24h)} />
            <Stat label="Profiluri de vizitatori" value={formatInt(stats.cdp.profiles)} />
            <Stat label="Consimțământ acceptat" value={formatInt(stats.cdp.consents.accepted)} />
            <Stat label="Consimțământ refuzat" value={formatInt(stats.cdp.consents.refused)} />
            <Stat label="Consimțământ retras" value={formatInt(stats.cdp.consents.withdrawn)} />
          </OpsCard>

          <OpsCard title="Coadă socială">
            <Stat label="În așteptare" value={formatInt(stats.social.queued)} />
            <Stat label="Aprobate" value={formatInt(stats.social.approved)} />
            <Stat label="Postate azi" value={formatInt(stats.social.postedToday)} emphasis />
          </OpsCard>

          <OpsCard title="Configurare reclame">
            <Stat
              label="Unități AdSense configurate"
              value={formatInt(stats.adConfig.unitsConfigured)}
            />
            <Stat label="Taguri partener Amazon" value={formatInt(stats.adConfig.amazonTags)} />
          </OpsCard>
        </div>
      )}
    </div>
  )
}

export default OpsDashboard
