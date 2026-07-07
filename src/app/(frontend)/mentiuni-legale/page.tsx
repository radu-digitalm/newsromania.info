import type { Metadata } from 'next'
import { LegalPageShell, LegalSection } from '@/components/layout/LegalPageShell'

// Noindex until the final legal text replaces this skeleton — indexing
// placeholder legal copy would be misleading for users and search engines.
// follow: true keeps internal links crawlable in the meantime.
export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Mențiuni legale',
    description:
      'Mențiuni legale NewsRomania: operatorul site-ului, date de contact, găzduire, responsabilitate editorială și publicitate.',
    robots: { index: false, follow: true },
  }
}

export default function MentiuniLegalePage() {
  return (
    <LegalPageShell title="Mențiuni legale">
      <LegalSection title="1. Operatorul site-ului">
        <p>
          Această secțiune va identifica entitatea care operează newsromania.info: denumire, formă
          juridică, sediu, cod unic de înregistrare și, dacă este cazul, numărul de înregistrare la
          Registrul Comerțului. Informațiile vor fi completate înainte de lansare.
        </p>
      </LegalSection>

      <LegalSection title="2. Date de contact">
        <p>
          Adresa de corespondență și adresa de e-mail pentru sesizări, drept la replică și
          solicitări editoriale vor fi publicate aici.
        </p>
      </LegalSection>

      <LegalSection title="3. Găzduire">
        <p>
          Datele furnizorului de găzduire a site-ului (denumire, sediu, date de contact) vor fi
          precizate aici.
        </p>
      </LegalSection>

      <LegalSection title="4. Responsabilitatea editorială">
        <p>
          NewsRomania publică articole proprii și agregă știri din surse publice. Preluăm din
          articolele agregate doar extrase foarte scurte sau scurte citate, cu atribuire și legătură
          către publicația-sursă, în condițiile art. 35 alin. (1) lit. b) și art. 94¹ alin. (2) din
          Legea nr. 8/1996 și ale art. 15 din Directiva (UE) 2019/790; răspunderea pentru conținutul
          original al acestora aparține publicațiilor citate. Persoana responsabilă editorial va fi
          indicată aici.
        </p>
      </LegalSection>

      <LegalSection title="5. Publicitate și linkuri afiliate">
        <p>
          Site-ul afișează publicitate prin Google AdSense, marcată vizibil cu eticheta
          „Publicitate”. Anumite linkuri către produse sunt linkuri afiliate (de exemplu, Amazon):
          putem primi un comision pentru achizițiile efectuate prin ele, fără niciun cost
          suplimentar pentru dumneavoastră. Modul de marcare a acestora va fi detaliat aici.
        </p>
      </LegalSection>

      <LegalSection title="6. Drepturi de autor și semnalarea conținutului">
        <p>
          Dacă sunteți deținătorul drepturilor asupra unui material citat și doriți corectarea
          atribuirii sau eliminarea extrasului, procedura de notificare și termenul de răspuns vor
          fi descrise aici.
        </p>
      </LegalSection>

      <LegalSection title="7. Protecția consumatorilor">
        <p>
          Trimiterile către Autoritatea Națională pentru Protecția Consumatorilor (ANPC) și către
          platforma europeană de soluționare online a litigiilor (SOL) vor fi adăugate aici.
        </p>
      </LegalSection>
    </LegalPageShell>
  )
}
