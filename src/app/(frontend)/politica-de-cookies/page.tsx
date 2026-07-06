import type { Metadata } from 'next'
import { LegalPageShell, LegalSection } from '@/components/layout/LegalPageShell'

// Noindex until the final legal text replaces this skeleton — indexing
// placeholder legal copy would be misleading for users and search engines.
// follow: true keeps internal links crawlable in the meantime.
export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Politica de cookies',
    description:
      'Cum folosește NewsRomania cookie-urile: categorii, consimțământ prealabil și modalități de retragere a acordului.',
    robots: { index: false, follow: true },
  }
}

const cookieCategories = [
  {
    name: 'Strict necesare',
    scop: 'Funcționarea de bază a site-ului, inclusiv reținerea alegerii dumneavoastră privind consimțământul.',
    exemple: 'Va fi completat înainte de lansare.',
    durata: 'Va fi completat.',
  },
  {
    name: 'Preferințe',
    scop: 'Reținerea preferințelor de afișare (de exemplu, regiunea sau limba).',
    exemple: 'Va fi completat înainte de lansare.',
    durata: 'Va fi completat.',
  },
  {
    name: 'Statistică',
    scop: 'Măsurarea audienței; se activează exclusiv după consimțământ.',
    exemple: 'Va fi completat înainte de lansare.',
    durata: 'Va fi completat.',
  },
  {
    name: 'Marketing',
    scop: 'Afișarea publicității prin Google AdSense; se activează exclusiv după consimțământ.',
    exemple: 'Va fi completat înainte de lansare.',
    durata: 'Va fi completat.',
  },
]

export default function PoliticaDeCookiesPage() {
  return (
    <LegalPageShell title="Politica de cookies">
      <LegalSection title="1. Ce sunt cookie-urile">
        <p>
          Cookie-urile sunt fișiere de mici dimensiuni stocate pe dispozitivul dumneavoastră atunci
          când vizitați un site. Această secțiune va explica pe scurt ce sunt cookie-urile și
          tehnologiile similare (local storage, pixeli) folosite de newsromania.info.
        </p>
      </LegalSection>

      <LegalSection title="2. Consimțământul dumneavoastră">
        <p>
          Niciun cookie neesențial nu este plasat înainte de acordarea consimțământului. Refuzul
          este la fel de simplu ca acceptarea, iar alegerea poate fi schimbată în orice moment.
          Funcționarea bannerului de consimțământ va fi descrisă aici, la implementarea acestuia.
        </p>
      </LegalSection>

      <LegalSection title="3. Categoriile de cookie-uri">
        <p>
          Tabelul de mai jos prezintă categoriile de cookie-uri folosite. Lista completă (denumire,
          furnizor, scop, durată) va fi completată înainte de lansare.
        </p>
        {/* Focusable scroll region: keyboard users must be able to reach the
            columns clipped on narrow viewports (WCAG 2.1.1). */}
        <div
          tabIndex={0}
          role="region"
          aria-label="Categoriile de cookie-uri"
          className="overflow-x-auto"
        >
          <table className="w-full min-w-[560px] border-collapse text-left font-sans text-sm leading-[22px]">
            <thead>
              <tr className="border-b-2 border-ink">
                <th scope="col" className="py-2.5 pr-4 align-top font-semibold text-ink">
                  Categorie
                </th>
                <th scope="col" className="py-2.5 pr-4 align-top font-semibold text-ink">
                  Scop
                </th>
                <th scope="col" className="py-2.5 pr-4 align-top font-semibold text-ink">
                  Exemple
                </th>
                <th scope="col" className="py-2.5 align-top font-semibold text-ink">
                  Durată
                </th>
              </tr>
            </thead>
            <tbody>
              {cookieCategories.map((category) => (
                <tr key={category.name} className="border-b border-border">
                  <th
                    scope="row"
                    className="py-2.5 pr-4 text-left align-top font-semibold text-ink"
                  >
                    {category.name}
                  </th>
                  <td className="py-2.5 pr-4 align-top text-ink-secondary">{category.scop}</td>
                  <td className="py-2.5 pr-4 align-top text-ink-secondary">{category.exemple}</td>
                  <td className="py-2.5 align-top text-ink-secondary">{category.durata}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </LegalSection>

      <LegalSection title="4. Cookie-uri ale terților">
        <p>
          Servicii ale unor terți pot plasa cookie-uri proprii, exclusiv după consimțământ.
          Orientativ: Google AdSense (publicitate, integrat cu Google Consent Mode) și Amazon
          (linkuri afiliate). Trimiterile către politicile acestor furnizori vor fi adăugate aici.
        </p>
      </LegalSection>

      <LegalSection title="5. Cum gestionați sau retrageți consimțământul">
        <p>
          Veți putea redeschide oricând panoul de consimțământ din subsolul site-ului pentru a vă
          schimba opțiunile. De asemenea, cookie-urile pot fi șterse sau blocate din setările
          browserului; instrucțiuni pentru browserele populare vor fi adăugate aici.
        </p>
      </LegalSection>

      <LegalSection title="6. Contact">
        <p>
          Pentru întrebări legate de această politică, datele de contact vor fi publicate aici
          înainte de lansare.
        </p>
      </LegalSection>
    </LegalPageShell>
  )
}
