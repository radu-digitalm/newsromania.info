import type { Metadata } from 'next'
import { LegalPageShell, LegalSection } from '@/components/layout/LegalPageShell'

// Noindex until the final legal text replaces this skeleton — indexing
// placeholder legal copy would be misleading for users and search engines.
// follow: true keeps internal links crawlable in the meantime.
export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Termeni și condiții',
    description:
      'Termenii și condițiile de utilizare a site-ului NewsRomania: descrierea serviciului, proprietatea intelectuală și limitarea răspunderii.',
    robots: { index: false, follow: true },
  }
}

export default function TermeniSiConditiiPage() {
  return (
    <LegalPageShell title="Termeni și condiții">
      <LegalSection title="1. Acceptarea termenilor">
        <p>
          Această secțiune va preciza că utilizarea site-ului newsromania.info implică acceptarea
          prezentelor termeni și condiții, precum și cine este entitatea care operează site-ul.
        </p>
      </LegalSection>

      <LegalSection title="2. Descrierea serviciului">
        <p>
          NewsRomania publică articole proprii, redactate de echipa editorială, și agregă știri din
          surse publice. Materialele agregate sunt prezentate exclusiv ca extrase scurte, cu
          atribuirea sursei și legătură către publicația-sursă — niciodată ca text integral.
        </p>
      </LegalSection>

      <LegalSection title="3. Conținutul agregat și atribuirea surselor">
        <p>
          Materialele preluate aparțin publicațiilor-sursă și sunt citate în limitele dreptului de
          citare. Această secțiune va detalia modul de atribuire, precum și procedura prin care o
          publicație poate solicita corectarea sau eliminarea unui extras.
        </p>
      </LegalSection>

      <LegalSection title="4. Proprietatea intelectuală">
        <p>
          Articolele originale, elementele grafice și marca NewsRomania aparțin operatorului
          site-ului. Condițiile de preluare a conținutului original (citare, link către sursă) vor
          fi detaliate aici.
        </p>
      </LegalSection>

      <LegalSection title="5. Limitarea răspunderii">
        <p>
          Această secțiune va descrie limitele răspunderii operatorului cu privire la acuratețea
          informațiilor preluate din surse externe, la disponibilitatea serviciului și la conținutul
          site-urilor către care trimit linkurile.
        </p>
      </LegalSection>

      <LegalSection title="6. Linkuri către site-uri terțe">
        <p>
          Site-ul conține linkuri către publicații-sursă și către alte site-uri ale unor terți,
          inclusiv linkuri afiliate marcate corespunzător. Operatorul nu controlează și nu răspunde
          de conținutul acestor site-uri; detaliile vor fi completate aici.
        </p>
      </LegalSection>

      <LegalSection title="7. Modificarea termenilor">
        <p>
          Aici va fi descris modul în care termenii pot fi actualizați și cum vor fi comunicate
          modificările (data ultimei actualizări va fi afișată pe această pagină).
        </p>
      </LegalSection>

      <LegalSection title="8. Legea aplicabilă și contact">
        <p>
          Prezentul document este guvernat de legea română. Instanțele competente, precum și datele
          de contact pentru întrebări legate de acești termeni, vor fi precizate aici înainte de
          lansare.
        </p>
      </LegalSection>
    </LegalPageShell>
  )
}
