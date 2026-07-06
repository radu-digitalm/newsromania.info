'use client'

/**
 * Primitive vizuale reutilizate de cardurile panoului operațional
 * (OpsDashboard): învelișul de card pe tema Payload + rândul „etichetă:
 * valoare”. Doar prezentare — fără fetch, fără stare.
 */
import React from 'react'

const numberFormat = new Intl.NumberFormat('ro-RO')

export function formatInt(value: number): string {
  return numberFormat.format(value)
}

export function OpsCard({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}): React.ReactElement {
  return (
    <section
      aria-label={title}
      style={{
        border: '1px solid var(--theme-elevation-150)',
        borderRadius: '6px',
        background: 'var(--theme-elevation-50)',
        padding: '1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.6rem',
        minWidth: 0,
      }}
    >
      <h3
        style={{
          margin: 0,
          fontSize: '13px',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: 'var(--theme-elevation-800)',
        }}
      >
        {title}
      </h3>
      {children}
    </section>
  )
}

export function Stat({
  label,
  value,
  emphasis = false,
}: {
  label: string
  value: string
  emphasis?: boolean
}): React.ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: '0.75rem',
        borderTop: '1px solid var(--theme-elevation-100)',
        paddingTop: '0.4rem',
      }}
    >
      <span style={{ color: 'var(--theme-elevation-700)' }}>{label}</span>
      <strong
        style={{
          fontSize: emphasis ? '20px' : '15px',
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </strong>
    </div>
  )
}
