import type { Metadata } from 'next'
import { LegalPageShell, LegalSection } from '@/components/layout/LegalPageShell'

// Noindex until the final legal text replaces this skeleton — indexing
// placeholder legal copy would be misleading for users and search engines.
// follow: true keeps internal links crawlable in the meantime.
export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Politica de confidențialitate',
    description:
      'Cum prelucrează NewsRomania datele cu caracter personal: categorii de date, scopuri, temeiuri juridice și drepturile dumneavoastră.',
    robots: { index: false, follow: true },
  }
}

export default function PoliticaDeConfidentialitatePage() {
  return (
    <LegalPageShell title="Politica de confidențialitate">
      <LegalSection title="1. Cine suntem (operatorul de date)">
        <p>
          Această secțiune va identifica operatorul de date cu caracter personal pentru
          newsromania.info: denumirea entității, forma juridică, sediul, datele de înregistrare și
          datele de contact ale operatorului. Informațiile vor fi completate înainte de lansare.
        </p>
      </LegalSection>

      <LegalSection title="2. Ce date prelucrăm">
        <p>
          Aici vor fi enumerate categoriile de date prelucrate atunci când vizitați site-ul.
          Orientativ, acestea vor include:
        </p>
        <ul className="list-disc space-y-2 pl-6">
          <li>date tehnice: adresa IP, tipul de browser și de dispozitiv, paginile vizitate;</li>
          <li>
            date colectate prin cookie-uri și tehnologii similare — exclusiv după acordarea
            consimțământului (a se vedea Politica de cookies);
          </li>
          <li>date furnizate voluntar, de exemplu prin formularul de contact.</li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Scopurile și temeiurile prelucrării">
        <p>
          Această secțiune va detalia scopurile prelucrării (furnizarea și securitatea site-ului,
          măsurarea audienței, afișarea publicității) și temeiul juridic aferent fiecărui scop:
          consimțământul, interesul legitim sau obligația legală, conform Regulamentului (UE)
          2016/679 (GDPR).
        </p>
      </LegalSection>

      <LegalSection title="4. Servicii ale unor terți">
        <p>
          Site-ul folosește servicii furnizate de terți, care pot prelucra date cu caracter
          personal. Lista completă a furnizorilor, împreună cu trimiteri către politicile lor de
          confidențialitate, va fi publicată aici. Orientativ:
        </p>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            Google AdSense — afișarea publicității; cookie-urile de marketing se activează doar după
            consimțământ;
          </li>
          <li>Amazon — linkuri afiliate către produse, marcate corespunzător;</li>
          <li>furnizorul de găzduire a site-ului.</li>
        </ul>
      </LegalSection>

      <LegalSection title="5. Durata stocării">
        <p>
          Aici vor fi precizate perioadele de păstrare pentru fiecare categorie de date și
          criteriile pe baza cărora acestea sunt stabilite.
        </p>
      </LegalSection>

      <LegalSection title="6. Drepturile dumneavoastră">
        <p>În conformitate cu GDPR, beneficiați de următoarele drepturi:</p>
        <ul className="list-disc space-y-2 pl-6">
          <li>dreptul de acces la datele dumneavoastră;</li>
          <li>dreptul la rectificarea datelor inexacte;</li>
          <li>dreptul la ștergerea datelor („dreptul de a fi uitat”);</li>
          <li>dreptul la restricționarea prelucrării;</li>
          <li>dreptul la portabilitatea datelor;</li>
          <li>dreptul de opoziție la prelucrare;</li>
          <li>dreptul de a depune o plângere la ANSPDCP (www.dataprotection.ro).</li>
        </ul>
        <p>Modalitățile concrete de exercitare a acestor drepturi vor fi descrise aici.</p>
      </LegalSection>

      <LegalSection title="7. Retragerea consimțământului">
        <p>
          Consimțământul acordat pentru cookie-uri și prelucrările bazate pe consimțământ va putea
          fi retras în orice moment, la fel de simplu cum a fost acordat. Mecanismul de retragere
          (accesibil permanent din subsolul site-ului) va fi descris aici.
        </p>
      </LegalSection>

      <LegalSection title="8. Contact">
        <p>
          Adresa de e-mail dedicată solicitărilor privind protecția datelor va fi publicată aici
          înainte de lansare.
        </p>
      </LegalSection>
    </LegalPageShell>
  )
}
