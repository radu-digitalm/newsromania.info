import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import Link from 'next/link'

import { readConsent, type ConsentState } from '@/lib/consent'

/**
 * /setari-cookies — withdraw or change the cookie choice at any time
 * (PROJECT_BRIEF §8). Server-rendered from the HttpOnly nr_consent cookie;
 * the forms POST natively to /api/consent (works without JS — the API
 * answers with a 303 redirect back here, re-rendered with the new state).
 */

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Setări cookies',
  description:
    'Vedeți și schimbați oricând alegerea privind cookie-urile pe newsromania.info: acceptare, refuz sau retragerea consimțământului.',
}

const buttonClass =
  'inline-flex h-11 w-full items-center justify-center rounded-[2px] bg-link px-5 font-sans text-[15px] font-semibold leading-5 text-white transition-colors hover:bg-link-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus active:opacity-85 sm:w-auto sm:min-w-[220px]'

const STATE_LABEL: Record<ConsentState, string> = {
  accepted: 'Ați acceptat cookie-urile de publicitate personalizată.',
  refused: 'Ați refuzat cookie-urile de publicitate personalizată.',
  unknown: 'Nu ați făcut încă o alegere privind cookie-urile.',
}

const STATE_DETAIL: Record<ConsentState, string> = {
  accepted:
    'Publicitatea afișată poate fi personalizată pe baza interesului de lectură. Puteți retrage consimțământul oricând, cu efect imediat.',
  refused:
    'Site-ul funcționează integral, cu publicitate nepersonalizată. Nu construim niciun profil și nu folosim cookie-uri de urmărire.',
  unknown:
    'Până la o alegere explicită nu plasăm niciun cookie și nu colectăm nicio informație. Site-ul poate fi citit integral și fără o alegere.',
}

function ChoiceForm({ consent }: { consent: ConsentState }) {
  if (consent === 'accepted') {
    return (
      <form method="post" action="/api/consent" className="mt-6">
        <button type="submit" name="choice" value="withdrawn" className={buttonClass}>
          Retrag consimțământul
        </button>
      </form>
    )
  }
  if (consent === 'refused') {
    return (
      <form method="post" action="/api/consent" className="mt-6">
        <button type="submit" name="choice" value="accepted" className={buttonClass}>
          Accept cookie-urile
        </button>
      </form>
    )
  }
  // No choice yet: the same binary, equal-weight choice as the banner.
  return (
    <form method="post" action="/api/consent" className="mt-6 flex flex-col gap-3 sm:flex-row">
      <button type="submit" name="choice" value="accepted" className={buttonClass}>
        Accept
      </button>
      <button type="submit" name="choice" value="refused" className={buttonClass}>
        Refuz
      </button>
    </form>
  )
}

export default async function SetariCookiesPage() {
  const consent = await readConsent(await cookies())

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

          {/* Current state */}
          <section
            aria-live="polite"
            className="mt-8 rounded-[2px] border border-border-pill bg-accent-bg px-5 py-4"
          >
            <h2 className="font-sans text-xs font-bold uppercase tracking-[0.08em] text-ink">
              Alegerea dumneavoastră actuală
            </h2>
            <p className="mt-2 font-sans text-[15px] font-semibold leading-[22px] text-ink">
              {STATE_LABEL[consent]}
            </p>
            <p className="mt-1 font-sans text-[15px] leading-[22px] text-ink-secondary">
              {STATE_DETAIL[consent]}
            </p>
            <ChoiceForm consent={consent} />
          </section>

          {/* Plain-language explanation */}
          <section className="mt-10 space-y-4 font-serif text-[17px] leading-[29px] text-ink md:text-lg md:leading-[31px]">
            <h2 className="font-serif text-[21px] font-bold leading-[27px] text-ink md:text-[26px] md:leading-[33px]">
              Ce înseamnă fiecare alegere
            </h2>
            <p>
              <strong>Accept</strong> — permitem Google AdSense să folosească cookie-uri pentru
              publicitate personalizată și reținem, printr-un identificator propriu, categoriile de
              știri care vă interesează, pentru a afișa reclame mai relevante.
            </p>
            <p>
              <strong>Refuz</strong> — site-ul rămâne complet accesibil, cu publicitate
              nepersonalizată (fără cookie-uri de urmărire și fără profil de interese). Refuzul nu
              are nicio consecință asupra accesului la conținut.
            </p>
            <p>
              <strong>Retragerea consimțământului</strong> — dacă ați acceptat, puteți reveni
              oricând. Retragerea șterge imediat identificatorul de vizitator și oprește
              publicitatea personalizată; înregistrăm retragerea pentru conformitate.
            </p>
            <p>
              Singurul cookie strict necesar este <code>nr_consent</code>, care reține chiar
              alegerea dumneavoastră — este scris doar odată cu alegerea, niciodată înainte.
            </p>
            <p>
              Mai multe detalii găsiți în{' '}
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
