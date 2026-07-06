/**
 * 3px flag-order gradient bar (design §1.3) — the page's top edge and the
 * footer's top edge. Blue is anchored to the brand wordmark blue.
 */
export function TricolorBar() {
  return (
    <div
      aria-hidden="true"
      className="h-[3px] w-full bg-[linear-gradient(90deg,#4463AD_0_33.4%,#F6EF49_33.4%_66.7%,#ED2024_66.7%_100%)]"
    />
  )
}
