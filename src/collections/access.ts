import type { Access, PayloadRequest } from 'payload'

/**
 * Shared role helpers (architecture.md §3, `users` collection):
 * - admin: everything, including users & site-config
 * - editor: read/write all content, may publish
 * - author: create/update OWN drafts only; never publish, never delete published
 */
export type Role = 'admin' | 'editor' | 'author'

export function getRole(req: PayloadRequest): Role | null {
  const user = req.user as ({ role?: Role } & Record<string, unknown>) | null
  return user?.role ?? null
}

export const anyone: Access = () => true

export const isLoggedIn: Access = ({ req }) => Boolean(req.user)

export const isAdmin: Access = ({ req }) => getRole(req) === 'admin'

export const isEditorOrAdmin: Access = ({ req }) => {
  const role = getRole(req)
  return role === 'admin' || role === 'editor'
}

export const noOne: Access = () => false
