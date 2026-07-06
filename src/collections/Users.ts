import type { CollectionConfig } from 'payload'

import { getRole, isAdmin } from './access'

/**
 * `users` — auth collection (architecture.md §3). Only admins manage users;
 * everyone may read (author bylines, relationship pickers), and each user may
 * edit their own profile (but never their own role — field-level access).
 */
export const Users: CollectionConfig = {
  slug: 'users',
  labels: {
    singular: 'Utilizator',
    plural: 'Utilizatori',
  },
  auth: true,
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'email', 'role'],
    description: 'Conturile redacției. Rolurile stabilesc drepturile de publicare.',
  },
  access: {
    read: ({ req }) => Boolean(req.user),
    create: isAdmin,
    update: ({ req }) => {
      if (getRole(req) === 'admin') return true
      if (req.user) return { id: { equals: req.user.id } }
      return false
    },
    delete: isAdmin,
    unlock: isAdmin,
  },
  fields: [
    {
      name: 'name',
      label: 'Nume',
      type: 'text',
      required: true,
    },
    {
      name: 'role',
      label: 'Rol',
      type: 'select',
      required: true,
      defaultValue: 'author',
      saveToJWT: true,
      options: [
        { label: 'Administrator', value: 'admin' },
        { label: 'Editor', value: 'editor' },
        { label: 'Autor', value: 'author' },
      ],
      access: {
        // Only admins may assign or change roles (no self-promotion).
        create: ({ req }) => getRole(req) === 'admin',
        update: ({ req }) => getRole(req) === 'admin',
      },
    },
  ],
}
