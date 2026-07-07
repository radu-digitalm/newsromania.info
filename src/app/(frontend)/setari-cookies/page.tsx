import type { Metadata } from 'next'
import Link from 'next/link'

import { CmpManageButton } from '@/components/consent/CmpManageButton'

/**
 * /setari-cookies — reopen and change the advertising-consent choice at any
 * time (PROJECT_BRIEF §8).
 *
 * CMP reconciliation (2026-07): consent for advertising is collected and
 * changed through Google's CERTIFIED CMP (the 3-choice Consent / Do not
 * consent / Manage options message, delivered via the AdSense tag). This page
 * no longer reads our retired `nr_consent` cookie or POSTs to /api/consent; it
 * simply reopens Google's CMP via <CmpManageButton /> (googlefc
 * showRevocationMessage), with a graceful fallback to browser settings when
 * the CMP is not loaded/applicable.
 */

export const metadata: Metadata = {
  title: 'Setări cookies',
  description:
    'Redeschideți oricând fereastra de consimțământ Google pentru a schimba alegerea privind cookie-urile și publicitatea pe newsromania.info.',
}

export default function SetariCookiesPage() {
  return (
    <div className="bg-surface">
      <div className="mx-auto w-full max-w-[1200px] px-4 md:px-6">
        <article className="mx-auto max-w-[680px] py-10 md:py-14">
          <h1 className="font-serif text-[26px] font-bold leading-8 tracking-[-0.01em] text-ink md:text-[36px] md:leading-[44px]">
            Setări cookies
          </h1>
          <div aria-hidden="true" className="relative mt-5 h-px bg-ink">
            <span className="absolute -top-px left-0 h-[3px] w-12 bg-brand-red" />
          </div>

          {/* Reopen the Google CMP */}
          <section className="mt-8 rounded-[2px] border border-border-pill bg-accent-bg px-5 py-4">
            <h2 className="font-sans text-xs font-bold uppercase tracking-[0.08em] text-ink">
              Consimțământ pentru publicitate
            </h2>
            <p className="mt-2 font-sans text-[15px] leading-[22px] text-ink-secondary">
              Consimțământul pentru cookie-uri de publicitate este gestionat prin platforma
              certificată de consimțământ (CMP) a Google. Apăsați butonul de mai jos pentru a
              redeschide fereastra Google și a schimba alegerea — „De acord”, „Nu sunt de acord” sau
              „Gestionează opțiunile” — la fel de simplu cum ați acordat-o.
            </p>
            <CmpManageButton />
          </section>

          {/* Plain-language explanation */}
          <section className="mt-10 space-y-4 font-serif text-[17px] leading-[29px] text-ink md:text-lg md:leading-[31px]">
            <h2 className="font-serif text-[21px] font-bold leading-[27px] text-ink md:text-[26px] md:leading-[33px]">
              Cum funcționează
            </h2>
            <p>
              La prima vizită, Google afișează o fereastră de consimțământ cu trei opțiuni cu
              greutate egală: <strong>De acord</strong>, <strong>Nu sunt de acord</strong> și{' '}
              <strong>Gestionează opțiunile</strong>. Refuzul este la fel de simplu ca acordul și nu
              limitează în niciun fel accesul la conținut: site-ul poate fi citit integral, iar
              publicitatea afișată rămâne nepersonalizată.
            </p>
            <p>
              Alegerea dumneavoastră este reținută de Google (prin șirul de consimțământ IAB TCF{' '}
              <code>euconsent-v2</code> și cookie-urile Google asociate) și poate fi schimbată
              oricând redeschizând fereastra de mai sus. Fereastra este afișată acolo unde se aplică
              reglementările europene (UE/SEE, Regatul Unit, Elveția).
            </p>
            <p>
              De asemenea, puteți șterge sau bloca oricând cookie-urile din setările browserului
              dumneavoastră (secțiunea „Confidențialitate” / „Cookie-uri” din Chrome, Firefox,
              Safari sau Edge); site-ul rămâne funcțional și fără cookie-uri.
            </p>
            <p>
              Detalii despre modul în care Google folosește cookie-urile pentru publicitate:{' '}
              <a
                href="https://policies.google.com/technologies/cookies?hl=ro"
                rel="noopener noreferrer nofollow"
                className="text-link underline decoration-1 underline-offset-2 hover:text-link-hover"
              >
                politica Google privind cookie-urile
              </a>
              .
            </p>
            <p>
              Mai multe informații găsiți în{' '}
              <Link
                href="/politica-de-cookies"
                className="text-link underline decoration-1 underline-offset-2 hover:text-link-hover"
              >
                Politica de cookies
              </Link>{' '}
              și în{' '}
              <Link
                href="/politica-de-confidentialitate"
                className="text-link underline decoration-1 underline-offset-2 hover:text-link-hover"
              >
                Politica de confidențialitate
              </Link>
              .
            </p>
          </section>
        </article>
      </div>
    </div>
  )
}
