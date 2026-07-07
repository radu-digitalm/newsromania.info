/**
 * Ad PREVIEW mode (owner visualization aid — NOT ad serving).
 *
 * While AdSense review is pending, real slots stay inert-empty (honest-ads
 * contract). To let the owner SEE where ads land and how the layout reads,
 * NEXT_PUBLIC_AD_PREVIEW='1' makes every reserved slot render a clearly
 * LABELLED, non-clickable demo box ("Spațiu publicitar · previzualizare")
 * sized to the real unit — never fake ad creative, never a real advertiser's
 * content, so it is not an AdSense policy violation. It only ever renders in
 * place of the empty reserved field (a slot with a real unitId shows the real
 * ad even in preview).
 *
 * MUST be '0' (default) for public launch. It is a NEXT_PUBLIC build-time flag
 * (inlined into the client bundle) so it applies identically to SSR page 1 and
 * the client-rendered infinite-scroll batches — wired as a Docker build ARG
 * (see Dockerfile / compose.yaml build.args / .env NEXT_PUBLIC_AD_PREVIEW).
 */
export const AD_PREVIEW = process.env.NEXT_PUBLIC_AD_PREVIEW === '1'
