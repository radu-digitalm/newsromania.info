'use client'

/**
 * Cardul „Sănătatea surselor RSS” (PROJECT_BRIEF §17 — feed health
 * monitoring): o linie per sursă cu starea activ/inactiv, ultima interogare,
 * insignă ROȘIE când `consecutiveFailures > 2` și ultima eroare (trunchiată,
 * textul complet în title).
 */
import { Pill } from '@payloadcms/ui'
import React from 'react'

import type { OpsFeedStatus } from '@/lib/ops-stats'
import { OpsCard } from './OpsCard'

const FAILURE_ALERT_THRESHOLD = 2

const dateTimeFormat = new Intl.DateTimeFormat('ro-RO', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

function formatFetchedAt(iso: string | null): string {
  if (!iso) return 'niciodată'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? 'niciodată' : dateTimeFormat.format(date)
}

function truncate(text: string, max = 60): string {
  const chars = [...text]
  return chars.length <= max
    ? text
    : `${chars
        .slice(0, max - 1)
        .join('')
        .trimEnd()}…`
}

export function FeedHealthCard({ feeds }: { feeds: OpsFeedStatus[] }): React.ReactElement {
  return (
    <OpsCard title="Sănătatea surselor RSS">
      {feeds.length === 0 ? (
        <p style={{ margin: 0, color: 'var(--theme-elevation-600)' }}>
          Nicio sursă RSS configurată.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {feeds.map((feed) => {
            const failing = feed.consecutiveFailures > FAILURE_ALERT_THRESHOLD
            return (
              <li
                key={feed.name}
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.4rem 0',
                  borderTop: '1px solid var(--theme-elevation-100)',
                }}
              >
                <span
                  aria-hidden="true"
                  title={feed.active ? 'Sursă activă' : 'Sursă inactivă'}
                  style={{
                    flex: '0 0 auto',
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    background: feed.active ? '#15803d' : 'var(--theme-elevation-300)',
                  }}
                />
                <strong style={{ flex: '1 1 auto', minWidth: 0, overflowWrap: 'anywhere' }}>
                  {feed.name}
                  {!feed.active && (
                    <span style={{ fontWeight: 400, color: 'var(--theme-elevation-600)' }}>
                      {' '}
                      (inactivă)
                    </span>
                  )}
                </strong>
                <span
                  style={{
                    color: 'var(--theme-elevation-600)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {formatFetchedAt(feed.lastFetchedAt)}
                </span>
                {failing ? (
                  <Pill
                    pillStyle="error"
                    size="small"
                    aria-label={`${feed.consecutiveFailures} eșecuri consecutive`}
                  >
                    {feed.consecutiveFailures} eșecuri
                  </Pill>
                ) : feed.consecutiveFailures > 0 ? (
                  <Pill
                    pillStyle="warning"
                    size="small"
                    aria-label={`${feed.consecutiveFailures} eșecuri consecutive`}
                  >
                    {feed.consecutiveFailures} {feed.consecutiveFailures === 1 ? 'eșec' : 'eșecuri'}
                  </Pill>
                ) : null}
                {failing && feed.lastError && (
                  <span
                    role="alert"
                    title={feed.lastError}
                    style={{
                      flexBasis: '100%',
                      color: '#b91c1c',
                      fontSize: '12px',
                      paddingLeft: '1.1rem',
                    }}
                  >
                    {truncate(feed.lastError)}
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </OpsCard>
  )
}
