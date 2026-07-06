import type { ReactNode } from 'react'

/**
 * Shared reading layout for the legal pages: white reading column (max 680px,
 * design §3.5), broadsheet section rule under the title and the visible
 * "work in progress" notice required until the legal texts are finalized.
 */
export function LegalPageShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="bg-surface">
      <div className="mx-auto w-full max-w-[1200px] px-4 md:px-6">
        <article className="mx-auto max-w-[680px] py-10 md:py-14">
          <h1 className="font-serif text-[26px] font-bold leading-8 tracking-[-0.01em] text-ink md:text-[36px] md:leading-[44px]">
            {title}
          </h1>
          {/* Section rule: 1px ink line with the 48×3px red segment flush left (§3.3) */}
          <div aria-hidden="true" className="relative mt-5 h-px bg-ink">
            <span className="absolute -top-px left-0 h-[3px] w-12 bg-brand-red" />
          </div>
          <p className="mt-6 rounded-[2px] border border-[#C9D4EC] bg-accent-bg px-5 py-4 font-sans text-[15px] leading-[22px] text-ink">
            Această pagină este în curs de finalizare și va fi completată înainte de lansare.
          </p>
          <div className="mt-10 space-y-10">{children}</div>
        </article>
      </div>
    </div>
  )
}

/** A titled section of a legal page: serif subhead + serif reading prose. */
export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="font-serif text-[21px] font-bold leading-[27px] text-ink md:text-[26px] md:leading-[33px]">
        {title}
      </h2>
      <div className="mt-4 space-y-4 font-serif text-[17px] leading-[29px] text-ink md:text-lg md:leading-[31px]">
        {children}
      </div>
    </section>
  )
}
