import type { AmazonProduct } from './amazon'
import { DEFAULT_MARKETPLACE } from './engine-core'

/**
 * House Amazon products — small sets of REAL best-sellers with the owner's
 * per-marketplace affiliate tag, captured via SiteStripe on the owner's
 * Associates account (one set per marketplace). Used ONLY as a preview/test
 * fallback (gated by NEXT_PUBLIC_AD_PREVIEW in AmazonProductAd) so the owner
 * can SEE Amazon placements filled — geo-correct — while the Creators/PA-API
 * is still gated on sales-eligibility (AssociateNotEligible).
 *
 * These are genuine affiliate links: each product's `url` carries the tag
 * valid for THAT marketplace (newsr01-21 for co.uk, newsromaniafr-21 for fr,
 * newsromaniade-21 for de). A purchase attributes to the account. When the
 * live API becomes eligible, real contextual products replace these; when
 * preview is off (launch) they do not render at all.
 *
 * R6 (owner in France saw UK products): AmazonProductAd picks the set for the
 * engine decision's `marketplace`, falling back to www.amazon.de (the
 * DEFAULT_MARKETPLACE for RO / unmatched countries).
 */
export const HOUSE_AMAZON_PRODUCTS_BY_MARKETPLACE: Record<string, AmazonProduct[]> = {
  'www.amazon.co.uk': [
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
      title: 'Duracell Plus AA (pachet 12)',
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
      title: 'Amazon Basics AA (pachet 20)',
      url: 'https://www.amazon.co.uk/dp/B00NTCH52W?tag=newsr01-21',
      image: {
        url: 'https://images-eu.ssl-images-amazon.com/images/I/81U2sRlmzNL._AC_UL600_SR600,400_.jpg',
        width: 500,
        height: 500,
      },
      price: '€8,84',
    },
  ],
  'www.amazon.fr': [
    {
      asin: 'B0GJTCB2QM',
      title: 'Apple AirTag (2ª generație)',
      url: 'https://www.amazon.fr/dp/B0GJTCB2QM?tag=newsromaniafr-21',
      image: {
        url: 'https://images-eu.ssl-images-amazon.com/images/I/61lBuevDnnL._AC_UL600_SR600,400_.jpg',
        width: 500,
        height: 500,
      },
      price: '€24,39',
    },
    {
      asin: 'B0DCNWN8NZ',
      title: 'Apple EarPods (USB-C)',
      url: 'https://www.amazon.fr/dp/B0DCNWN8NZ?tag=newsromaniafr-21',
      image: {
        url: 'https://images-eu.ssl-images-amazon.com/images/I/51oMc4XRaaL._AC_UL600_SR600,400_.jpg',
        width: 500,
        height: 500,
      },
      price: '€14,72',
    },
    {
      asin: 'B00LH3DMUO',
      title: 'Amazon Basics AAA (pachet 36)',
      url: 'https://www.amazon.fr/dp/B00LH3DMUO?tag=newsromaniafr-21',
      image: {
        url: 'https://images-eu.ssl-images-amazon.com/images/I/81Apg8B6+0L._AC_UL600_SR600,400_.jpg',
        width: 500,
        height: 500,
      },
      price: '€14,43',
    },
  ],
  'www.amazon.de': [
    {
      asin: 'B0FFM4BY6C',
      title: 'Amazon Basics Powerbank 20000mAh',
      url: 'https://www.amazon.de/dp/B0FFM4BY6C?tag=newsromaniade-21',
      image: {
        url: 'https://m.media-amazon.com/images/I/61j44ljOEtL._AC_UY218_.jpg',
        width: 500,
        height: 500,
      },
      price: '23,99 €',
    },
    {
      asin: 'B0GGXQFT7Q',
      title: 'Baseus 145W 25000mAh Powerbank',
      url: 'https://www.amazon.de/dp/B0GGXQFT7Q?tag=newsromaniade-21',
      image: {
        url: 'https://m.media-amazon.com/images/I/61M3JCqf4dL._AC_UY218_.jpg',
        width: 500,
        height: 500,
      },
      price: '53,99 €',
    },
    {
      asin: 'B0D7DKJ75M',
      title: 'Anker MagGo Powerbank 10000mAh',
      url: 'https://www.amazon.de/dp/B0D7DKJ75M?tag=newsromaniade-21',
      image: {
        url: 'https://m.media-amazon.com/images/I/61gHNTTUdWL._AC_UY218_.jpg',
        width: 500,
        height: 500,
      },
    },
  ],
}

/**
 * The preview house set for a marketplace — the marketplace's own products,
 * falling back to the default (amazon.de) set for any unmapped marketplace.
 */
export function houseProductsForMarketplace(marketplace: string): AmazonProduct[] {
  return (
    HOUSE_AMAZON_PRODUCTS_BY_MARKETPLACE[marketplace] ??
    HOUSE_AMAZON_PRODUCTS_BY_MARKETPLACE[DEFAULT_MARKETPLACE] ??
    []
  )
}
