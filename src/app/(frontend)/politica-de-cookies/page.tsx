import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPageShell, LegalSection } from '@/components/layout/LegalPageShell'

// Noindex until the operator identification (see Contact below) is filled in
// by the owner at DNS cutover. The cookie inventory itself is complete and
// accurate and MUST describe what actually runs (GDPR Art. 12/13): since the
// CMP reconciliation (2026-07) advertising consent is collected through
// Google's certified CMP, not our retired banner — keep this text in sync with
// the live consent path (layout.tsx + Google's CMP).
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
 * The REAL cookie inventory (CMP reconciliation 2026-07). The site itself no
 * longer sets first-party consent/tracking cookies on anonymous requests
 * (nr_consent / nr_vid retired together with our custom banner). Advertising
 * consent and its cookies are now handled by Google's certified CMP:
 * euconsent-v2 (IAB TCF consent string) + Google's ad/measurement cookies, set
 * client-side by Google's script after the CMP choice. No „Preferințe” or
 * „Statistică” first-party cookies exist on this site.
 */
const cookieRows = [
  {
    name: 'euconsent-v2',
    categorie: 'Strict necesar (consimțământ)',
    scop: 'Șirul de consimțământ IAB TCF care reține alegerea dumneavoastră din fereastra Google (CMP). Este scris de platforma Google DOAR odată cu o alegere explicită și permite site-ului și partenerilor să respecte acea alegere.',
    furnizor: 'Google (CMP certificat)',
    durata: 'până la 13 luni',
  },
  {
    name: 'Cookie-uri Google de publicitate / măsurare',
    categorie: 'Marketing / personalizare',
    scop: 'Cookie-uri plasate de Google (AdSense) pentru afișarea și măsurarea publicității; sunt personalizate DOAR dacă ați fost de acord în fereastra CMP. Fără acord, publicitatea rămâne nepersonalizată (Google Consent Mode v2).',
    furnizor: 'Google',
    durata: 'conform politicii Google (variabil)',
  },
]

export default function PoliticaDeCookiesPage() {
  return (
    <LegalPageShell title="Politica de cookies" notice={null}>
      <LegalSection title="1. Ce sunt cookie-urile">
        <p>
          Cookie-urile sunt fișiere de mici dimensiuni stocate pe dispozitivul dumneavoastră atunci
          când vizitați un site. Pe newsromania.info, site-ul în sine nu plasează cookie-uri proprii
          de urmărire sau de consimțământ — nu folosim local storage, session storage sau pixeli de
          urmărire proprii. Cookie-urile de consimțământ și de publicitate sunt plasate de Google,
          prin platforma sa certificată de consimțământ (a se vedea secțiunile de mai jos).
        </p>
      </LegalSection>

      <LegalSection title="2. Consimțământul dumneavoastră">
        <p>
          Niciun cookie neesențial nu este plasat înainte de acordarea consimțământului.
          Consimțământul pentru publicitate este colectat prin platforma certificată de consimțământ
          (CMP) a Google: la prima vizită, Google afișează o fereastră cu trei opțiuni cu greutate
          egală — „De acord”, „Nu sunt de acord” și „Gestionează opțiunile” — fiecare la un singur
          clic. Refuzul este la fel de simplu ca acordul și nu limitează în niciun fel accesul la
          conținut: site-ul poate fi citit integral, cu publicitate nepersonalizată. Alegerea poate
          fi schimbată în orice moment (a se vedea secțiunea 5).
        </p>
      </LegalSection>

      <LegalSection title="3. Cookie-urile pe care le folosim">
        <p>
          Tabelul de mai jos descrie cookie-urile care pot fi plasate în urma folosirii site-ului.
          Site-ul nu setează cookie-uri proprii de preferințe sau de statistică; cookie-urile de
          consimțământ și de publicitate sunt setate de Google după alegerea din fereastra CMP.
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
          Aceste cookie-uri sunt plasate și gestionate de Google, prin platforma sa certificată de
          consimțământ; newsromania.info nu are acces la conținutul lor.
        </p>
      </LegalSection>

      <LegalSection title="4. Cookie-uri ale terților">
        <p>
          Google AdSense afișează publicitatea pe acest site și, prin platforma sa certificată de
          consimțământ (CMP), colectează consimțământul și plasează propriile cookie-uri de
          marketing <strong>exclusiv după</strong> acordul dumneavoastră: se folosește Google
          Consent Mode v2, iar până la un acord explicit în fereastra CMP toate mecanismele de
          stocare Google rămân dezactivate (publicitate nepersonalizată). Detalii despre
          cookie-urile Google:{' '}
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
          — accesibilă permanent din subsolul site-ului — conține un buton care redeschide fereastra
          de consimțământ Google, unde vă puteți schimba oricând alegerea (acord, refuz sau
          gestionarea opțiunilor). De asemenea, puteți șterge sau bloca oricând cookie-urile din
          setările browserului dumneavoastră (secțiunea „Confidențialitate” / „Cookie-uri” din
          Chrome, Firefox, Safari sau Edge); site-ul rămâne funcțional și fără cookie-uri.
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
