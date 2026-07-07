import type { AmazonProduct } from './amazon'

/**
 * House Amazon products — a small set of REAL amazon.co.uk best-sellers with
 * the owner's affiliate tag (newsr01-21), captured via SiteStripe. Used ONLY
 * as a preview/test fallback (gated by NEXT_PUBLIC_AD_PREVIEW in
 * AmazonProductAd) so the owner can SEE Amazon placements filled while the
 * Creators/PA-API is still gated on sales-eligibility (AssociateNotEligible).
 *
 * These are genuine affiliate links: a purchase attributes to the account, and
 * OneLink auto-redirects non-UK visitors to their local marketplace + tag.
 * When the live API becomes eligible, real contextual products replace these;
 * when preview is off (launch) they do not render at all.
 */
export const HOUSE_AMAZON_PRODUCTS: AmazonProduct[] = [
  {
    asin: 'B0F7ZFCZNL',
    title: 'Amazon Fire TV Stick 4K Plus – streaming Wi‑Fi 6, Dolby Vision/Atmos',
    url: 'https://www.amazon.co.uk/dp/B0F7ZFCZNL?tag=newsr01-21',
    image: {
      url: 'https://m.media-amazon.com/images/I/61v5wbRfHkL._AC_SY741_.jpg',
      width: 500,
      height: 500,
    },
    price: '€45,66',
  },
  {
    asin: 'B093LVB4P7',
    title: 'Duracell Plus AA Batteries (pachet 12)',
    url: 'https://www.amazon.co.uk/dp/B093LVB4P7?tag=newsr01-21',
    image: {
      url: 'https://images-eu.ssl-images-amazon.com/images/I/81V1h6d+RjL._AC_UL600_SR600,400_.jpg',
      width: 500,
      height: 500,
    },
    price: '€10,54',
  },
  {
    asin: 'B00NTCH52W',
    title: 'Amazon Basics AA Alkaline Batteries (pachet 20)',
    url: 'https://www.amazon.co.uk/dp/B00NTCH52W?tag=newsr01-21',
    image: {
      url: 'https://images-eu.ssl-images-amazon.com/images/I/81U2sRlmzNL._AC_UL600_SR600,400_.jpg',
      width: 500,
      height: 500,
    },
    price: '€8,84',
  },
]
