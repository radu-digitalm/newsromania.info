import type { Metadata } from 'next'
import { LegalPageShell, LegalSection } from '@/components/layout/LegalPageShell'

// Noindex until the final text replaces this skeleton — indexing placeholder
// copy would be misleading for users and search engines.
// follow: true keeps internal links crawlable in the meantime.
export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Contact',
    description:
      'Datele de contact ale redacției NewsRomania și procedura de sesizare privind conținutul agregat.',
    robots: { index: false, follow: true },
  }
}

export default function ContactPage() {
  return (
    <LegalPageShell title="Contact">
      <LegalSection title="Date de contact">
        <p>
          Adresa de e-mail a redacției și datele de identificare ale operatorului site-ului vor fi
          publicate aici înainte de lansare.
        </p>
      </LegalSection>

      <LegalSection title="Sesizări privind conținutul">
        <p>
          Publicațiile care doresc corectarea sau eliminarea unui extras agregat, precum și
          cititorii care semnalează erori în articole, vor găsi aici procedura de contact dedicată.
        </p>
      </LegalSection>
    </LegalPageShell>
  )
}
