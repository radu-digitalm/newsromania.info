import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'NewsRomania',
  description: 'Știri din România și din lume',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ro">
      <body>{children}</body>
    </html>
  )
}
