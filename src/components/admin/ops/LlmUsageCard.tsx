'use client'

/**
 * Cardul „Consum LLM” (PROJECT_BRIEF §17/§18 — LLM usage/cost tracking per
 * day): sparkline-din-cifre pe ultimele 7 zile — o coloană pe zi cu costul
 * estimat, plus totalurile perioadei (apeluri, tokeni, cost).
 */
import React from 'react'

import type { OpsLlmDay } from '@/lib/ops-stats'
import { formatInt, OpsCard, Stat } from './OpsCard'

const usdFormat = new Intl.NumberFormat('ro-RO', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const dayFormat = new Intl.DateTimeFormat('ro-RO', { weekday: 'short' })

function dayLabel(day: string): string {
  const date = new Date(`${day}T12:00:00Z`)
  return Number.isNaN(date.getTime()) ? day : dayFormat.format(date)
}

export function LlmUsageCard({ llm }: { llm: OpsLlmDay[] }): React.ReactElement {
  const totals = llm.reduce(
    (acc, day) => ({
      calls: acc.calls + day.calls,
      tokens: acc.tokens + day.tokens,
      estCostUsd: acc.estCostUsd + day.estCostUsd,
    }),
    { calls: 0, tokens: 0, estCostUsd: 0 },
  )

  return (
    <OpsCard title="Consum LLM — ultimele 7 zile">
      {/* Sparkline-din-cifre: costul pe fiecare zi, în ordine cronologică. */}
      <ol
        aria-label="Cost estimat pe zi (ultimele 7 zile)"
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'grid',
          gridTemplateColumns: `repeat(${Math.max(llm.length, 1)}, 1fr)`,
          gap: '2px',
          textAlign: 'center',
        }}
      >
        {llm.map((day) => (
          <li
            key={day.day}
            title={`${day.day}: ${day.calls} apeluri, ${formatInt(day.tokens)} tokeni`}
            style={{
              background: day.estCostUsd > 0 ? 'var(--theme-elevation-100)' : 'transparent',
              borderRadius: '4px',
              padding: '0.3rem 0.1rem',
            }}
          >
            <span
              style={{
                display: 'block',
                fontSize: '11px',
                color: 'var(--theme-elevation-600)',
              }}
            >
              {dayLabel(day.day)}
            </span>
            <strong style={{ fontSize: '12px', fontVariantNumeric: 'tabular-nums' }}>
              {day.estCostUsd.toFixed(2)}
            </strong>
          </li>
        ))}
      </ol>
      <Stat label="Cost total (USD)" value={usdFormat.format(totals.estCostUsd)} emphasis />
      <Stat label="Apeluri" value={formatInt(totals.calls)} />
      <Stat label="Tokeni" value={formatInt(totals.tokens)} />
    </OpsCard>
  )
}
