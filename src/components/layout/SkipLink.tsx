/**
 * First focusable element on every page (design §6): visually hidden until it
 * receives keyboard focus, then shown as a white-on-ink pill over the masthead.
 */
export function SkipLink() {
  return (
    <a
      href="#continut"
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-ink focus:px-5 focus:py-3 focus:font-sans focus:text-[15px] focus:font-semibold focus:leading-5 focus:text-white"
    >
      Sari la conținut
    </a>
  )
}
