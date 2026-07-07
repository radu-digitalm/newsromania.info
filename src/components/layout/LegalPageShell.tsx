import type { ReactNode } from 'react'

/**
 * Shared reading layout for the legal pages (design direction v2): white
 * elevated reading card (radius 16px) on the cool page canvas, headline face
 * for titles, Inter reading prose. The default notice is the
 * "work in progress" banner required while a page's legal text is still a
 * skeleton; pages whose content is final can pass a tailored `notice`
 * (or `null` to omit it entirely).
 */
export function LegalPageShell({
  title,
  children,
  notice = 'Această pagină este în curs de finalizare și va fi completată înainte de lansare.',
}: {
  title: string
  children: ReactNode
  notice?: ReactNode | null
}) {
  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 pb-16 pt-8 md:px-6 xl:px-8">
      <article className="mx-auto max-w-[760px] rounded-[16px] border border-border bg-surface px-5 py-8 shadow-[0_1px_2px_rgba(16,22,31,0.06),0_1px_3px_rgba(16,22,31,0.04)] md:px-10 md:py-12">
        <div className="mx-auto max-w-[680px]">
          {/* Section accent: the 4×20px red bar of the v2 section-head grammar. */}
          <span aria-hidden="true" className="inline-block h-5 w-1 rounded-[2px] bg-brand-red" />
          <h1 className="mt-3 font-serif text-[28px] font-extrabold leading-[34px] tracking-[-0.015em] text-ink md:text-[38px] md:leading-[44px]">
            {title}
          </h1>
          {notice !== null && (
            <p className="mt-6 rounded-[10px] border border-border-pill bg-accent-bg px-5 py-4 font-sans text-[15px] leading-[22px] text-ink">
              {notice}
            </p>
          )}
          <div className="mt-8 space-y-10">{children}</div>
        </div>
      </article>
    </div>
  )
}

/** A titled section of a legal page: headline-face subhead + Inter reading prose. */
export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="font-serif text-[22px] font-bold leading-7 tracking-[-0.01em] text-ink md:text-[28px] md:leading-[34px]">
        {title}
      </h2>
      <div className="mt-4 space-y-4 font-sans text-[17px] leading-7 text-ink md:text-lg md:leading-[30px]">
        {children}
      </div>
    </section>
  )
}
