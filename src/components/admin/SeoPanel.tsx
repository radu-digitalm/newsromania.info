'use client'

/**
 * Panoul SEO live din editorul de articole (PROJECT_BRIEF §20, arch §4).
 * Câmp UI Payload montat în grupul „SEO”: citește live titlul, slug-ul,
 * meta câmpurile, cuvântul-cheie și corpul Lexical din starea formularului
 * (useFormFields), re-analizează cu debounce de 500 ms și afișează semaforul,
 * lista de verificări și previzualizarea snippetului Google.
 *
 * Scorul persistat NU vine de aici — hook-ul beforeChange de pe server
 * recalculează la salvare (src/lib/seo-analyzer/hook.ts).
 */
import { useFormFields } from '@payloadcms/ui'
import React, { useEffect, useMemo, useState } from 'react'

import { analyze, type CheckStatus, type SeoReport } from '@/lib/seo-analyzer'
import { buildAnalyzerInput } from '@/lib/seo-analyzer/lexical'

const DEBOUNCE_MS = 500
const DEFAULT_MIN_WORDS = 300

const STATUS_COLOR: Record<CheckStatus, string> = {
  pass: '#15803d',
  warn: '#d97706',
  fail: '#dc2626',
}

const STATUS_ICON: Record<CheckStatus, string> = {
  pass: '✓',
  warn: '!',
  fail: '✕',
}

const SCORE_COLOR: Record<SeoReport['score'], string> = {
  green: '#15803d',
  amber: '#d97706',
  red: '#dc2626',
}

const SCORE_LABEL: Record<SeoReport['score'], string> = {
  green: 'Verde — gata de publicare',
  amber: 'Galben — mai sunt lucruri de îmbunătățit',
  red: 'Roșu — probleme critice de rezolvat',
}

const STATUS_ORDER: Record<CheckStatus, number> = { fail: 0, warn: 1, pass: 2 }

function truncate(text: string, max: number): string {
  const chars = [...text]
  if (chars.length <= max) return text
  return `${chars
    .slice(0, max - 1)
    .join('')
    .trimEnd()}…`
}

export function SeoPanel() {
  const title = useFormFields(([fields]) => (fields.title?.value as string) ?? '')
  const slug = useFormFields(([fields]) => (fields.slug?.value as string) ?? '')
  const metaTitle = useFormFields(([fields]) => (fields['seo.metaTitle']?.value as string) ?? '')
  const metaDescription = useFormFields(
    ([fields]) => (fields['seo.metaDescription']?.value as string) ?? '',
  )
  const focusKeyword = useFormFields(
    ([fields]) => (fields['seo.focusKeyword']?.value as string) ?? '',
  )
  const body = useFormFields(([fields]) => fields.body?.value)

  const [minWordCount, setMinWordCount] = useState(DEFAULT_MIN_WORDS)
  const [report, setReport] = useState<SeoReport | null>(null)

  // Numărul minim de cuvinte vine din site-config (editorial.minWordCount).
  useEffect(() => {
    let cancelled = false
    fetch('/api/globals/site-config?depth=0', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((cfg: { editorial?: { minWordCount?: number | null } } | null) => {
        const min = cfg?.editorial?.minWordCount
        if (!cancelled && typeof min === 'number' && min > 0) setMinWordCount(min)
      })
      .catch(() => {
        // Config indisponibil — rămâne valoarea implicită.
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Re-analiză cu debounce la orice modificare din formular.
  useEffect(() => {
    const timer = setTimeout(() => {
      setReport(
        analyze(
          buildAnalyzerInput({
            title,
            slug,
            metaTitle,
            metaDescription,
            focusKeyword,
            body,
            minWordCount,
          }),
        ),
      )
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [title, slug, metaTitle, metaDescription, focusKeyword, body, minWordCount])

  const sortedChecks = useMemo(
    () =>
      report
        ? [...report.checks].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status])
        : [],
    [report],
  )

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://newsromania.info').replace(
    /\/+$/,
    '',
  )
  const displayHost = siteUrl.replace(/^https?:\/\//, '')
  const snippetTitle = truncate(metaTitle.trim() || title.trim() || 'Titlul articolului', 60)
  const snippetDescription = truncate(
    metaDescription.trim() || 'Completează meta descrierea pentru a vedea previzualizarea.',
    160,
  )

  return (
    <div
      style={{
        border: '1px solid var(--theme-elevation-150)',
        borderRadius: '6px',
        background: 'var(--theme-elevation-50)',
        padding: '1rem',
        marginBottom: '1.5rem',
        fontSize: '13px',
        lineHeight: 1.5,
      }}
    >
      {/* Semafor + scor */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '4px' }} aria-hidden="true">
          {(['red', 'amber', 'green'] as const).map((s) => (
            <span
              key={s}
              style={{
                width: '14px',
                height: '14px',
                borderRadius: '50%',
                background: report?.score === s ? SCORE_COLOR[s] : 'var(--theme-elevation-200)',
                boxShadow: report?.score === s ? `0 0 6px ${SCORE_COLOR[s]}` : 'none',
              }}
            />
          ))}
        </div>
        <strong>{report ? SCORE_LABEL[report.score] : 'Analiză SEO — se calculează…'}</strong>
      </div>

      {/* Previzualizare snippet Google */}
      <div
        style={{
          background: '#ffffff',
          border: '1px solid #dadce0',
          borderRadius: '8px',
          padding: '0.75rem 1rem',
          marginBottom: '1rem',
          fontFamily: 'arial, sans-serif',
        }}
      >
        <div style={{ color: '#202124', fontSize: '12px', marginBottom: '2px' }}>
          {displayHost} › stiri › {slug || 'slug-articol'}
        </div>
        <div style={{ color: '#1a0dab', fontSize: '18px', marginBottom: '2px' }}>
          {snippetTitle}
        </div>
        <div style={{ color: '#4d5156', fontSize: '13px' }}>{snippetDescription}</div>
      </div>

      {/* Lista de verificări */}
      {report && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {sortedChecks.map((check) => (
            <li
              key={check.id}
              style={{
                display: 'flex',
                gap: '0.5rem',
                alignItems: 'baseline',
                padding: '0.3rem 0',
                borderTop: '1px solid var(--theme-elevation-100)',
              }}
            >
              <span
                aria-label={
                  check.status === 'pass'
                    ? 'trecut'
                    : check.status === 'warn'
                      ? 'avertisment'
                      : 'eșec'
                }
                style={{
                  flex: '0 0 auto',
                  width: '16px',
                  height: '16px',
                  borderRadius: '50%',
                  background: STATUS_COLOR[check.status],
                  color: '#fff',
                  fontSize: '10px',
                  lineHeight: '16px',
                  textAlign: 'center',
                  fontWeight: 700,
                }}
              >
                {STATUS_ICON[check.status]}
              </span>
              <span>
                <strong>{check.label}:</strong> {check.detail}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default SeoPanel
