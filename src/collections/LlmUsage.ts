import type { CollectionConfig } from 'payload'

import { isAdmin, noOne } from './access'

/**
 * `llm-usage` — per-day LLM cost accounting (architecture.md §3).
 * Incremented by src/lib/llm.ts via the Local API.
 */
export const LlmUsage: CollectionConfig = {
  slug: 'llm-usage',
  labels: {
    singular: 'Consum LLM',
    plural: 'Consum LLM',
  },
  admin: {
    defaultColumns: ['day', 'provider', 'model', 'purpose', 'calls', 'estCostUsd'],
    description: 'Contorizare zilnică a apelurilor și costurilor LLM.',
  },
  access: {
    read: isAdmin,
    create: isAdmin,
    update: isAdmin,
    delete: noOne,
  },
  fields: [
    {
      name: 'day',
      label: 'Zi',
      type: 'text',
      required: true,
      index: true,
      validate: (value: null | string | undefined) =>
        typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
          ? true
          : 'Format așteptat: YYYY-MM-DD',
    },
    {
      name: 'provider',
      label: 'Furnizor',
      type: 'text',
      required: true,
    },
    {
      name: 'model',
      type: 'text',
      required: true,
    },
    {
      name: 'purpose',
      label: 'Scop',
      type: 'select',
      required: true,
      options: [
        { label: 'Rezumare', value: 'summarize' },
        { label: 'Categorizare', value: 'categorize' },
        { label: 'Texte postări', value: 'captions' },
        { label: 'Import inițial', value: 'seed' },
      ],
    },
    {
      name: 'inputTokens',
      type: 'number',
      defaultValue: 0,
    },
    {
      name: 'outputTokens',
      type: 'number',
      defaultValue: 0,
    },
    {
      name: 'calls',
      label: 'Apeluri',
      type: 'number',
      defaultValue: 0,
    },
    {
      name: 'estCostUsd',
      label: 'Cost estimat (USD)',
      type: 'number',
      defaultValue: 0,
    },
  ],
}
