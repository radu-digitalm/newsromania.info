'use client'

/**
 * Link din adminul Payload către site-ul public (#2a). Deschide pagina de start
 * „/” într-o filă nouă.
 *
 * Montat ÎN DOUĂ locuri (src/payload.config.ts) ca să fie MEREU vizibil:
 *  1. `admin.components.actions` — colțul din dreapta-sus al AppHeader, redat pe
 *     FIECARE ecran (dashboard, listă, editare, creare, globale). Antetul nu
 *     este niciodată inert/colapsat, spre deosebire de bara laterală — aceasta
 *     este garanția „mereu vizibil” cerută de owner.
 *  2. `admin.components.beforeNavLinks` — în capul barei de navigare, util când
 *     bara e deschisă pe desktop lat.
 *
 * Un singur pill compact, potrivit atât pe rândul antetului cât și în navă.
 * Accesibil: focus vizibil, contrast WCAG AA (variabilele temei Payload).
 */
import React from 'react'

export function BackToSite(): React.ReactElement {
  return (
    <a
      href="/"
      target="_blank"
      rel="noopener noreferrer"
      title="Deschide site-ul public într-o filă nouă"
      aria-label="Vezi site-ul public (se deschide într-o filă nouă)"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.4rem',
        padding: '0.35rem 0.7rem',
        borderRadius: '4px',
        border: '1px solid var(--theme-elevation-150)',
        background: 'var(--theme-elevation-50)',
        color: 'var(--theme-elevation-800)',
        fontSize: '13px',
        fontWeight: 600,
        textDecoration: 'none',
        lineHeight: 1.2,
        whiteSpace: 'nowrap',
      }}
    >
      <span aria-hidden="true">↩</span>
      <span>Vezi site-ul</span>
      <span aria-hidden="true" style={{ opacity: 0.6, fontSize: '11px' }}>
        ↗
      </span>
    </a>
  )
}

export default BackToSite
