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

/**
 * House Amazon ads (owner v2.4) — an ALWAYS-ON path, independent of AD_PREVIEW.
 *
 * While the live Creators/PA-API is gated on sales-eligibility
 * (AssociateNotEligible) it returns nothing, so every Amazon slot would render
 * empty. Instead, when this flag is on, Amazon slots render the geo-matched
 * SiteStripe house bestseller — a REAL affiliate product with the
 * marketplace-correct partner tag — in PRODUCTION now (NOT preview, NOT fake).
 * The moment the live API becomes eligible, its contextual products take
 * precedence automatically (the house set is only the fallback).
 *
 * A DEDICATED, intentional switch (default ON) — set AMAZON_HOUSE_ADS=0 to turn
 * the house fallback off (e.g. once the live API is serving) WITHOUT touching
 * AD_PREVIEW. Server-only (not NEXT_PUBLIC): the house product for a feed slot
 * is resolved server-side and serialized into the /api/feed batch, and the SSR
 * article/rail slots render AmazonProductAd (server) — the client never needs
 * to read this flag. Default-on: an unset var reads as enabled.
 */
export const AMAZON_HOUSE_ADS = process.env.AMAZON_HOUSE_ADS !== '0'
