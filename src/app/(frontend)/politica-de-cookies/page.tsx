import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPageShell, LegalSection } from '@/components/layout/LegalPageShell'

// Noindex until the operator identification (see Contact below) is filled in
// by the owner at DNS cutover. The cookie inventory itself is complete and
// accurate — it MUST stay in sync with src/lib/consent.ts and the consent
// banner, because consent is collected against this text (GDPR Art. 12/13).
// follow: true keeps internal links crawlable in the meantime.
export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Politica de cookies',
    description:
      'Cum folosește NewsRomania cookie-urile: categorii, consimțământ prealabil și modalități de retragere a acordului.',
    robots: { index: false, follow: true },
  }
}

/**
 * The REAL first-party cookie inventory — mirror of src/lib/consent.ts:
 * nr_consent (180 zile = gdpr.cookieRetentionDays default) and nr_vid
 * (365 zile = VISITOR_COOKIE_MAX_AGE_DAYS). No „Preferințe”/„Statistică”
 * cookies exist on this site.
 */
const cookieRows = [
  {
    name: 'nr_consent',
    categorie: 'Strict necesar',
    scop: 'Reține alegerea dumneavoastră privind consimțământul (acceptat/refuzat), versiunea consimțământului și momentul alegerii. Este scris DOAR odată cu o alegere explicită, niciodată înainte.',
    furnizor: 'newsromania.info (propriu)',
    durata: '180 de zile',
  },
  {
    name: 'nr_vid',
    categorie: 'Marketing / personalizare',
    scop: 'Identificator pseudonim de vizitator, folosit pentru a reține categoriile de știri citite și a afișa publicitate mai relevantă. Este creat EXCLUSIV după „Accept” și este șters imediat la refuz sau la retragerea consimțământului.',
    furnizor: 'newsromania.info (propriu)',
    durata: '365 de zile',
  },
]

export default function PoliticaDeCookiesPage() {
  return (
    <LegalPageShell title="Politica de cookies" notice={null}>
      <LegalSection title="1. Ce sunt cookie-urile">
        <p>
          Cookie-urile sunt fișiere de mici dimensiuni stocate pe dispozitivul dumneavoastră atunci
          când vizitați un site. newsromania.info folosește exclusiv cookie-urile descrise mai jos —
          nu folosim local storage, session storage sau pixeli de urmărire proprii.
        </p>
      </LegalSection>

      <LegalSection title="2. Consimțământul dumneavoastră">
        <p>
          Niciun cookie neesențial nu este plasat înainte de acordarea consimțământului. La prima
          vizită, bannerul din partea de jos a paginii oferă două opțiuni cu greutate egală —
          „Accept” și „Refuz” — fiecare la un singur clic. Refuzul este la fel de simplu ca
          acceptarea și nu limitează în niciun fel accesul la conținut: site-ul poate fi citit
          integral, cu publicitate nepersonalizată. Alegerea poate fi schimbată în orice moment (a
          se vedea secțiunea 5).
        </p>
      </LegalSection>

      <LegalSection title="3. Cookie-urile pe care le folosim">
        <p>
          Tabelul de mai jos conține lista completă a cookie-urilor proprii plasate de
          newsromania.info. Nu folosim cookie-uri de preferințe sau de statistică.
        </p>
        {/* Focusable scroll region: keyboard users must be able to reach the
            columns clipped on narrow viewports (WCAG 2.1.1). */}
        <div
          tabIndex={0}
          role="region"
          aria-label="Cookie-urile folosite de newsromania.info"
          className="overflow-x-auto"
        >
          <table className="w-full min-w-[560px] border-collapse text-left font-sans text-sm leading-[22px]">
            <thead>
              <tr className="border-b-2 border-ink">
                <th scope="col" className="py-2.5 pr-4 align-top font-semibold text-ink">
                  Cookie
                </th>
                <th scope="col" className="py-2.5 pr-4 align-top font-semibold text-ink">
                  Categorie
                </th>
                <th scope="col" className="py-2.5 pr-4 align-top font-semibold text-ink">
                  Scop
                </th>
                <th scope="col" className="py-2.5 pr-4 align-top font-semibold text-ink">
                  Furnizor
                </th>
                <th scope="col" className="py-2.5 align-top font-semibold text-ink">
                  Durată
                </th>
              </tr>
            </thead>
            <tbody>
              {cookieRows.map((row) => (
                <tr key={row.name} className="border-b border-border">
                  <th
                    scope="row"
                    className="py-2.5 pr-4 text-left align-top font-semibold text-ink"
                  >
                    <code>{row.name}</code>
                  </th>
                  <td className="py-2.5 pr-4 align-top text-ink-secondary">{row.categorie}</td>
                  <td className="py-2.5 pr-4 align-top text-ink-secondary">{row.scop}</td>
                  <td className="py-2.5 pr-4 align-top text-ink-secondary">{row.furnizor}</td>
                  <td className="py-2.5 align-top text-ink-secondary">{row.durata}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Ambele cookie-uri sunt de tip „HttpOnly” (nu pot fi citite de scripturi din pagină) și
          sunt transmise doar către newsromania.info.
        </p>
      </LegalSection>

      <LegalSection title="4. Cookie-uri ale terților">
        <p>
          Google AdSense afișează publicitatea pe acest site și poate plasa propriile cookie-uri de
          marketing <strong>exclusiv după</strong> acordarea consimțământului: folosim Google
          Consent Mode v2, iar până la un „Accept” explicit toate mecanismele de stocare Google
          rămân dezactivate. Detalii despre cookie-urile Google:{' '}
          <a
            href="https://policies.google.com/technologies/cookies?hl=ro"
            rel="noopener noreferrer nofollow"
            className="text-link underline decoration-1 underline-offset-2 hover:text-link-hover"
          >
            policies.google.com/technologies/cookies
          </a>{' '}
          și{' '}
          <a
            href="https://business.safety.google/adscookies/"
            rel="noopener noreferrer nofollow"
            className="text-link underline decoration-1 underline-offset-2 hover:text-link-hover"
          >
            business.safety.google/adscookies
          </a>
          . Linkurile afiliate Amazon, marcate corespunzător, duc către site-ul Amazon; Amazon nu
          plasează cookie-uri pe newsromania.info — politica sa de cookie-uri se aplică doar pe
          domeniile Amazon, după ce dați clic pe un asemenea link.
        </p>
      </LegalSection>

      <LegalSection title="5. Cum gestionați sau retrageți consimțământul">
        <p>
          Pagina{' '}
          <Link
            href="/setari-cookies"
            className="text-link underline decoration-1 underline-offset-2 hover:text-link-hover"
          >
            Setări cookies
          </Link>{' '}
          — accesibilă permanent din subsolul site-ului — vă arată alegerea curentă și vă permite să
          o schimbați oricând: acceptare, refuz sau retragerea consimțământului. Retragerea șterge
          imediat identificatorul <code>nr_vid</code> și oprește publicitatea personalizată. De
          asemenea, puteți șterge sau bloca oricând cookie-urile din setările browserului
          dumneavoastră (secțiunea „Confidențialitate” / „Cookie-uri” din Chrome, Firefox, Safari
          sau Edge); site-ul rămâne funcțional și fără cookie-uri.
        </p>
      </LegalSection>

      <LegalSection title="6. Contact">
        <p>
          Pentru întrebări legate de această politică folosiți datele din pagina{' '}
          <Link
            href="/contact"
            className="text-link underline decoration-1 underline-offset-2 hover:text-link-hover"
          >
            Contact
          </Link>
          . Identificarea completă a operatorului site-ului este publicată în{' '}
          <Link
            href="/politica-de-confidentialitate"
            className="text-link underline decoration-1 underline-offset-2 hover:text-link-hover"
          >
            Politica de confidențialitate
          </Link>
          .
        </p>
      </LegalSection>
    </LegalPageShell>
  )
}
