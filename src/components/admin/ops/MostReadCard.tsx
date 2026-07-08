'use client'

/**
 * Cardul „Cele mai citite” (owner ask #2b) — top articole după numărul agregat
 * de vizualizări (contor global fără PII, vezi src/lib/article-views.ts). O
 * linie per articol: rang, titlu (link către pagina proprie sau publisher) și
 * numărul de vizualizări. Stare goală prietenoasă când încă nu s-a citit nimic
 * — nu prăbușește niciodată dashboardul.
 */
import React from 'react'

import type { TopArticle } from '@/lib/umami-stats'
import { formatInt, OpsCard } from './OpsCard'

export function MostReadCard({ items }: { items: TopArticle[] }): React.ReactElement {
  return (
    <OpsCard title="Cele mai citite">
      {items.length === 0 ? (
        <p style={{ margin: 0, color: 'var(--theme-elevation-600)' }}>
          Încă nu există vizualizări înregistrate. Contorul se completează pe măsură ce cititorii
          deschid articole.
        </p>
      ) : (
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, counterReset: 'rank' }}>
          {items.map((item, index) => (
            <li
              key={item.slug}
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: '0.6rem',
                padding: '0.4rem 0',
                borderTop: '1px solid var(--theme-elevation-100)',
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  flex: '0 0 auto',
                  minWidth: '1.2rem',
                  textAlign: 'right',
                  color: 'var(--theme-elevation-500)',
                  fontVariantNumeric: 'tabular-nums',
                  fontWeight: 700,
                }}
              >
                {index + 1}.
              </span>
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                title={
                  item.type === 'aggregated'
                    ? 'Deschide articolul la sursă (filă nouă)'
                    : 'Deschide articolul pe site (filă nouă)'
                }
                style={{
                  flex: '1 1 auto',
                  minWidth: 0,
                  overflowWrap: 'anywhere',
                  color: 'var(--theme-elevation-800)',
                  textDecoration: 'none',
                  fontWeight: 600,
                }}
              >
                {item.title}
                {item.type === 'aggregated' && (
                  <span
                    style={{ marginLeft: '0.35rem', fontWeight: 400, opacity: 0.6 }}
                    aria-label="sursă externă"
                  >
                    ↗
                  </span>
                )}
              </a>
              <strong
                style={{
                  flex: '0 0 auto',
                  fontVariantNumeric: 'tabular-nums',
                  whiteSpace: 'nowrap',
                }}
              >
                {formatInt(item.views)}
              </strong>
            </li>
          ))}
        </ol>
      )}
    </OpsCard>
  )
}
