import type { Metadata } from 'next'
import { LegalPageShell, LegalSection } from '@/components/layout/LegalPageShell'

// Noindex until the final text replaces this skeleton — indexing placeholder
// copy would be misleading for users and search engines.
// follow: true keeps internal links crawlable in the meantime.
export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Despre noi',
    description:
      'Despre NewsRomania: cine suntem, cum lucrăm și cum combinăm articolele proprii cu știrile agregate, prezentate cu atribuire.',
    robots: { index: false, follow: true },
  }
}

export default function DespreNoiPage() {
  return (
    <LegalPageShell title="Despre noi">
      <LegalSection title="Cine suntem">
        <p>
          NewsRomania este o publicație online care combină articole proprii, redactate de echipa
          editorială, cu o selecție de știri agregate din surse publice, prezentate ca extrase
          scurte, cu atribuire și legătură către publicația-sursă. Descrierea completă a proiectului
          și a echipei editoriale va fi publicată aici înainte de lansare.
        </p>
      </LegalSection>

      <LegalSection title="Cum lucrăm">
        <p>
          Politica editorială, criteriile de selecție a surselor și modul în care marcăm distinct
          conținutul agregat față de articolele proprii vor fi descrise în această secțiune.
        </p>
      </LegalSection>
    </LegalPageShell>
  )
}
