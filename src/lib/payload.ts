import config from '@payload-config'
import { getPayload } from 'payload'
import type { Payload } from 'payload'

/**
 * Cached Payload Local API client (architecture.md §4).
 *
 * `getPayload({ config })` memoizes the initialized instance on the module
 * scope inside Payload itself, so repeated calls (per request, in workers,
 * in seed scripts) reuse the same instance and DB pool.
 */
export async function getPayloadClient(): Promise<Payload> {
  return getPayload({ config })
}
