'use client'

/**
 * Link din adminul Payload către site-ul public (#6a): montat ca
 * `admin.components.beforeNavLinks`, deschide pagina de start „/” într-o filă
 * nouă. Se aliniază vizual cu celelalte legături din bara de navigare
 * (variabilele temei Payload) și rămâne accesibil (focus vizibil, WCAG AA).
 */
import React from 'react'

export function BackToSite(): React.ReactElement {
  return (
    <a
      href="/"
      target="_blank"
      rel="noopener noreferrer"
      title="Deschide site-ul public într-o filă nouă"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        margin: '0 0 0.5rem',
        padding: '0.5rem 0.75rem',
        borderRadius: '4px',
        border: '1px solid var(--theme-elevation-150)',
        background: 'var(--theme-elevation-50)',
        color: 'var(--theme-elevation-800)',
        fontWeight: 600,
        textDecoration: 'none',
        lineHeight: 1.2,
      }}
    >
      <span aria-hidden="true">←</span>
      <span>Vezi site-ul</span>
      <span aria-hidden="true" style={{ marginLeft: 'auto', opacity: 0.6, fontSize: '12px' }}>
        ↗
      </span>
    </a>
  )
}

export default BackToSite
