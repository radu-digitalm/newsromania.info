import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPageShell, LegalSection } from '@/components/layout/LegalPageShell'

// Noindex until section 1 (operator identification — owner-supplied legal
// entity data) is completed at DNS cutover. The processing descriptions
// (sections 2–8) MUST stay in sync with what actually runs. CMP reconciliation
// (2026-07): advertising consent is now collected via Google's certified CMP
// (3-choice, reject-as-easy-as-accept), not our retired first-party banner —
// the first-party CDP profiling (nr_vid) is dormant. ipHash on the technical
// access logs and the other facts remain accurate.
// follow: true keeps internal links crawlable in the meantime.
export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Politica de confidențialitate',
    description:
      'Cum prelucrează NewsRomania datele cu caracter personal: categorii de date, scopuri, temeiuri juridice și drepturile dumneavoastră.',
    robots: { index: false, follow: true },
  }
}

const linkClass = 'text-link underline decoration-1 underline-offset-2 hover:text-link-hover'

export default function PoliticaDeConfidentialitatePage() {
  return (
    <LegalPageShell
      title="Politica de confidențialitate"
      notice="Identificarea operatorului (secțiunea 1) va fi completată de proprietarul site-ului înainte de lansarea publică. Restul politicii descrie prelucrările efective ale site-ului."
    >
      <LegalSection title="1. Cine suntem (operatorul de date)">
        <p>
          Operatorul de date cu caracter personal pentru newsromania.info: denumirea entității,
          forma juridică, sediul, datele de înregistrare și datele de contact ale operatorului vor
          fi publicate aici înainte de lansarea publică a site-ului.
        </p>
      </LegalSection>

      <LegalSection title="2. Ce date prelucrăm">
        <p>Când vizitați site-ul prelucrăm următoarele categorii de date:</p>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <strong>date tehnice de acces</strong>: adresa IP și user agent-ul browserului, în
            jurnalele tehnice ale serverului, strict pentru furnizarea și securitatea site-ului;
          </li>
          <li>
            <strong>consimțământul pentru publicitate</strong>: este colectat prin platforma
            certificată de consimțământ (CMP) a Google (opțiunile „De acord”, „Nu sunt de acord”,
            „Gestionează opțiunile”); Google reține alegerea (prin șirul IAB TCF{' '}
            <code>euconsent-v2</code> și cookie-urile Google asociate). Site-ul în sine nu mai
            stochează cookie-uri proprii de consimțământ (a se vedea{' '}
            <Link href="/politica-de-cookies" className={linkClass}>
              Politica de cookies
            </Link>
            );
          </li>
          <li>
            <strong>date furnizate voluntar</strong>, de exemplu atunci când ne scrieți la adresa
            din pagina{' '}
            <Link href="/contact" className={linkClass}>
              Contact
            </Link>
            .
          </li>
        </ul>
        <p>
          Nu creăm conturi de vizitatori, nu cerem date de identificare pentru citirea site-ului și
          nu combinăm datele de mai sus cu surse externe.
        </p>
      </LegalSection>

      <LegalSection title="3. Scopurile și temeiurile prelucrării">
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <strong>furnizarea și securitatea site-ului</strong> (jurnale tehnice, limitare de abuz)
            — interes legitim (art. 6 alin. 1 lit. f GDPR);
          </li>
          <li>
            <strong>publicitate personalizată</strong> (cookie-urile Google AdSense de marketing,
            colectate prin CMP-ul certificat Google) — exclusiv pe baza consimțământului (art. 6
            alin. 1 lit. a GDPR), care poate fi retras oricând din fereastra Google;
          </li>
          <li>
            <strong>publicitate nepersonalizată</strong> (fără personalizare) pentru vizitatorii
            care refuză sau nu au ales — interes legitim.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Servicii ale unor terți">
        <p>
          Site-ul folosește servicii furnizate de terți, care pot prelucra date cu caracter
          personal:
        </p>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <strong>Google AdSense</strong> — afișarea publicității și colectarea consimțământului
            prin platforma sa certificată de consimțământ (CMP); cookie-urile de marketing se
            activează doar după consimțământ (Google Consent Mode v2). Politica Google:{' '}
            <a
              href="https://policies.google.com/privacy?hl=ro"
              rel="noopener noreferrer nofollow"
              className={linkClass}
            >
              policies.google.com/privacy
            </a>
            ;
          </li>
          <li>
            <strong>Amazon</strong> — linkuri afiliate către produse, marcate corespunzător;
            prelucrarea Amazon începe doar pe site-urile Amazon, după clic:{' '}
            <a
              href="https://www.amazon.de/gp/help/customer/display.html?nodeId=201909010"
              rel="noopener noreferrer nofollow"
              className={linkClass}
            >
              politica de confidențialitate Amazon
            </a>
            ;
          </li>
          <li>
            <strong>furnizorul de găzduire</strong> al site-ului (server în Uniunea Europeană), în
            calitate de persoană împuternicită pentru infrastructură.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="5. Durata stocării">
        <ul className="list-disc space-y-2 pl-6">
          <li>
            consimțământul pentru publicitate și cookie-urile Google asociate (inclusiv șirul{' '}
            <code>euconsent-v2</code>): reținute de Google conform politicilor sale (de regulă până
            la 13 luni), până la schimbarea alegerii din fereastra Google;
          </li>
          <li>
            jurnalele tehnice de acces (adresa IP, user agent): pe durata necesară furnizării și
            securității site-ului, apoi eliminate sau anonimizate;
          </li>
          <li>corespondența primită voluntar: pe durata soluționării solicitării.</li>
        </ul>
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
        <p>
          Pentru exercitarea acestor drepturi ne puteți scrie folosind datele din pagina{' '}
          <Link href="/contact" className={linkClass}>
            Contact
          </Link>
          . Consimțământul pentru publicitate poate fi schimbat oricând, direct și fără nicio
          cerere, redeschizând fereastra de consimțământ Google din pagina{' '}
          <Link href="/setari-cookies" className={linkClass}>
            Setări cookies
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection title="7. Retragerea consimțământului">
        <p>
          Consimțământul acordat pentru cookie-uri și pentru publicitatea personalizată poate fi
          retras în orice moment, la fel de simplu cum a fost acordat: pagina{' '}
          <Link href="/setari-cookies" className={linkClass}>
            Setări cookies
          </Link>
          , accesibilă permanent din subsolul site-ului, are un buton care redeschide fereastra de
          consimțământ Google, unde vă puteți retrage sau schimba alegerea. Fereastra oferă opțiuni
          cu greutate egală, refuzul fiind la fel de simplu ca acordul.
        </p>
      </LegalSection>

      <LegalSection title="8. Contact">
        <p>
          Întrebările privind protecția datelor se trimit folosind datele din pagina{' '}
          <Link href="/contact" className={linkClass}>
            Contact
          </Link>
          ; adresa de e-mail dedicată va fi publicată acolo înainte de lansarea publică.
        </p>
      </LegalSection>
    </LegalPageShell>
  )
}
