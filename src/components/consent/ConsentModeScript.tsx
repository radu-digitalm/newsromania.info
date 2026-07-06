import type { ConsentState } from '@/lib/consent'

/**
 * Google Consent Mode v2 bootstrap (PROJECT_BRIEF §8, architecture.md §6).
 *
 * Rendered as the FIRST child of <body>, i.e. a plain inline <script> in the
 * server HTML. It executes synchronously during HTML parsing, which is
 * guaranteed to be BEFORE the AdSense site tag (loaded with Next's
 * strategy="afterInteractive", after hydration).
 *
 * - Always: consent 'default' with every storage type denied. The AdSense
 *   site tag itself stays unconditionally (pending site review requires it)
 *   but starts with denied defaults, so it sets no cookies.
 * - accepted (server-read nr_consent): an additional consent 'update'
 *   granting ad_storage / ad_user_data / ad_personalization.
 * - refused or unknown: defaults stay denied and adsbygoogle is flipped to
 *   non-personalized ads (requestNonPersonalizedAds=1).
 */

const CONSENT_DEFAULTS =
  'window.dataLayer=window.dataLayer||[];' +
  'function gtag(){dataLayer.push(arguments);}' +
  "gtag('consent','default',{" +
  "ad_storage:'denied'," +
  "ad_user_data:'denied'," +
  "ad_personalization:'denied'," +
  "analytics_storage:'denied'," +
  "functionality_storage:'denied'," +
  "personalization_storage:'denied'," +
  "security_storage:'granted'" +
  '});'

const CONSENT_GRANTED_UPDATE =
  "gtag('consent','update',{" +
  "ad_storage:'granted'," +
  "ad_user_data:'granted'," +
  "ad_personalization:'granted'" +
  '});'

const NON_PERSONALIZED_ADS =
  '(window.adsbygoogle=window.adsbygoogle||[]).requestNonPersonalizedAds=1;'

export function ConsentModeScript({ consent }: { consent: ConsentState }) {
  const script =
    CONSENT_DEFAULTS + (consent === 'accepted' ? CONSENT_GRANTED_UPDATE : NON_PERSONALIZED_ADS)
  // dangerouslySetInnerHTML is safe here: a static, server-built string —
  // no user input ever reaches it.
  return <script id="nr-consent-mode" dangerouslySetInnerHTML={{ __html: script }} />
}
