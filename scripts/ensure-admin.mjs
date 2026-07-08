/**
 * ensure-admin — idempotent UPSERT of the Payload admin account from the
 * environment (fix round #2: owner set PAYLOAD_ADMIN_EMAIL=contact@newsromania.info
 * but the DB admin was still admin@newsromania.info, so login failed).
 *
 * Run from the project root with Payload's standalone-script runner (loads the
 * TS config + .env):
 *
 *   npx payload run scripts/ensure-admin.mjs
 *
 * Behaviour (all via the Payload Local API, idempotent, no direct SQL):
 *   1. A user with PAYLOAD_ADMIN_EMAIL already exists
 *        → ensure role='admin'; reset password IF PAYLOAD_ADMIN_PASSWORD is set.
 *   2. That email does NOT exist, but exactly ONE admin exists under a
 *      different email
 *        → RENAME that admin's email to PAYLOAD_ADMIN_EMAIL (Payload keeps the
 *          password hash in a separate column, so an email change preserves the
 *          existing password). Reset password only if PAYLOAD_ADMIN_PASSWORD is
 *          set. This is the least-surprise fix for the stale-email case and
 *          guarantees exactly one admin whose email matches .env.
 *   3. No matching email and no lone existing admin to adopt
 *        → CREATE a fresh admin (requires PAYLOAD_ADMIN_PASSWORD).
 *
 * SECRETS: reads process.env only; NEVER prints, logs, or echoes the password.
 * Re-running is a true no-op once the DB admin matches .env.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { getPayload } from 'payload'

// Loaded through payload run's tsx runtime, so .ts imports work directly.
import configPromise from '../src/payload.config.ts'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(dirname, '..')

/**
 * Fallback .env loader for plain `node` invocations (`payload run` already
 * loads env). Fills ONLY missing keys and never logs a single value.
 */
function loadDotEnv(file) {
  if (!fs.existsSync(file)) return
  for (const rawLine of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line
      .slice(0, eq)
      .replace(/^export\s+/, '')
      .trim()
    if (!key || process.env[key] !== undefined) continue
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    process.env[key] = value
  }
}

loadDotEnv(path.join(projectRoot, '.env'))

for (const required of ['DATABASE_URL', 'PAYLOAD_SECRET']) {
  if (!process.env[required]) {
    console.error(`[ensure-admin] Variabila de mediu lipsește: ${required}`)
    process.exit(1)
  }
}

const adminEmail = (process.env.PAYLOAD_ADMIN_EMAIL ?? '').trim()
const adminPassword = process.env.PAYLOAD_ADMIN_PASSWORD // never printed
if (!adminEmail) {
  console.error('[ensure-admin] PAYLOAD_ADMIN_EMAIL lipsește din mediu.')
  process.exit(1)
}

const payload = await getPayload({ config: configPromise })

async function findByEmail(email) {
  const { docs } = await payload.find({
    collection: 'users',
    where: { email: { equals: email } },
    limit: 1,
    depth: 0,
  })
  return docs[0] ?? null
}

let action = 'noop'
try {
  const existing = await findByEmail(adminEmail)

  if (existing) {
    // --- Case 1: the target email already exists → normalise to admin. --------
    const data = {}
    if (existing.role !== 'admin') data.role = 'admin'
    if (adminPassword) data.password = adminPassword
    if (Object.keys(data).length > 0) {
      await payload.update({ collection: 'users', id: existing.id, data, depth: 0 })
      action = existing.role !== 'admin' ? 'promoted+password' : 'password-reset'
    } else {
      action = 'already-admin'
    }
  } else {
    // --- Target email absent: adopt a lone existing admin if there is one. ----
    const { docs: admins } = await payload.find({
      collection: 'users',
      where: { role: { equals: 'admin' } },
      limit: 2,
      depth: 0,
    })

    if (admins.length === 1) {
      // Case 2: exactly one admin under a stale email → rename it. Payload
      // stores the password hash separately, so the email change preserves the
      // existing password unless PAYLOAD_ADMIN_PASSWORD explicitly resets it.
      const data = { email: adminEmail }
      if (adminPassword) data.password = adminPassword
      await payload.update({ collection: 'users', id: admins[0].id, data, depth: 0 })
      action = adminPassword ? 'renamed+password' : 'renamed'
    } else {
      // Case 3: create a fresh admin (needs a password — nothing to preserve).
      if (!adminPassword) {
        console.error(
          '[ensure-admin] Niciun admin de adoptat și PAYLOAD_ADMIN_PASSWORD lipsește — ' +
            'nu pot crea contul fără parolă.',
        )
        process.exit(1)
      }
      await payload.create({
        collection: 'users',
        data: {
          name: 'Administrator',
          email: adminEmail,
          password: adminPassword,
          role: 'admin',
        },
        depth: 0,
      })
      action = 'created'
    }
  }

  // Post-condition: exactly one admin, and its email matches .env.
  const { totalDocs: adminCount } = await payload.count({
    collection: 'users',
    where: { role: { equals: 'admin' } },
  })
  const finalAdmin = await findByEmail(adminEmail)
  const emailMatches = Boolean(finalAdmin) && finalAdmin.role === 'admin'

  console.log(`[ensure-admin] acțiune: ${action}`)
  console.log(`[ensure-admin] conturi admin: ${adminCount}`)
  console.log(
    `[ensure-admin] admin cu emailul din .env: ${emailMatches ? 'da' : 'NU'}` +
      (adminCount > 1 ? ' (atenție: există mai mulți admini)' : ''),
  )
  console.log('[ensure-admin] Gata — rularea repetată este idempotentă.')
} finally {
  await payload.destroy()
}

process.exit(0)
