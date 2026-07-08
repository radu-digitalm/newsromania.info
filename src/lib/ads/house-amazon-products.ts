import type { AmazonProduct } from './amazon'
import { DEFAULT_MARKETPLACE } from './engine-core'

/**
 * House Amazon products — REAL best-sellers with the owner's per-marketplace
 * affiliate tag, harvested from each marketplace's best-seller / movers-and-
 * shakers listings and captured via SiteStripe on the owner's Associates
 * account. Used as the always-on production fallback (gated by AMAZON_HOUSE_ADS,
 * default on) while the Creators/PA-API is still gated on sales-eligibility
 * (AssociateNotEligible) — the moment the live API is eligible its contextual
 * products take precedence and this set becomes pure fallback.
 *
 * Each product's `url` carries the tag valid for THAT marketplace (newsr01-21
 * for co.uk, newsromaniafr-21 for fr, newsromaniade-21 for de). A purchase
 * attributes to the account.
 *
 * VARIETY (owner fix round): each marketplace now carries MANY products across
 * several departments (`category`), so consecutive Amazon slots on a page show
 * different products and the house selector can bias the CATEGORY toward the
 * visitor's CDP top-interest / the page category ("based on cookies + content").
 * All entries are marketplace best-sellers (`bestseller: true`).
 *
 * R6 (owner in France saw UK products): the house set is picked by the engine
 * decision's `marketplace`, falling back to www.amazon.de (DEFAULT_MARKETPLACE
 * for RO / unmatched countries).
 */
export const HOUSE_AMAZON_PRODUCTS_BY_MARKETPLACE: Record<string, AmazonProduct[]> = {
  'www.amazon.co.uk': [
    {
      asin: 'B00NTCH52W',
      title: 'Amazon Basics 20-Pack AA Alkaline High-Performance Batteries, 1.5 Volt',
      url: 'https://www.amazon.co.uk/dp/B00NTCH52W?tag=newsr01-21',
      image: {
        url: 'https://m.media-amazon.com/images/I/81U2sRlmzNL._AC_SL1500_.jpg',
        width: 500,
        height: 500,
      },
      price: '£8.84',
      category: 'Electronics & Photo',
      bestseller: true,
    },
    {
      asin: 'B01CG0TO76',
      title: 'Duracell CR2032 Lithium Coin Batteries 3V (4 Pack) - Up to 70% Extra…',
      url: 'https://www.amazon.co.uk/dp/B01CG0TO76?tag=newsr01-21',
      image: {
        url: 'https://m.media-amazon.com/images/I/81Q05C0zXTL._AC_SL1500_.jpg',
        width: 500,
        height: 500,
      },
      price: '£6.44',
      category: 'Electronics & Photo',
      bestseller: true,
    },
    {
      asin: 'B093LVB4P7',
      title: 'Duracell Plus AA Batteries (12 Pack) - Alkaline 1.5V - Up To 100% Extr',
      url: 'https://www.amazon.co.uk/dp/B093LVB4P7?tag=newsr01-21',
      image: {
        url: 'https://m.media-amazon.com/images/I/811f1fU97UL._AC_SL1500_.jpg',
        width: 500,
        height: 500,
      },
      price: '£10.54',
      category: 'Electronics & Photo',
      bestseller: true,
    },
    {
      asin: 'B0F7ZFCZNL',
      title: 'Amazon Fire TV Stick 4K Plus streaming device, supports Wi-Fi 6, Dolby',
      url: 'https://www.amazon.co.uk/dp/B0F7ZFCZNL?tag=newsr01-21',
      image: {
        url: 'https://m.media-amazon.com/images/I/61v5wbRfHkL._AC_SL1500_.jpg',
        width: 500,
        height: 500,
      },
      price: '£18.73',
      category: 'Electronics & Photo',
      bestseller: true,
    },
    {
      asin: 'B07BFTX96F',
      title: 'Utopia Bedding Fitted Sheet King, Grey - Deep Pocket 14 inch (35…',
      url: 'https://www.amazon.co.uk/dp/B07BFTX96F?tag=newsr01-21',
      image: {
        url: 'https://m.media-amazon.com/images/I/61Zzv9AruOL._AC_SL1450_.jpg',
        width: 500,
        height: 500,
      },
      price: '£16.38',
      category: 'Home & Kitchen',
      bestseller: true,
    },
    {
      asin: 'B0BRV61DPY',
      title: 'Jsdoin Hand Held Fan,Portable Handheld USB Rechargeable Fans with 5…',
      url: 'https://www.amazon.co.uk/dp/B0BRV61DPY?tag=newsr01-21',
      image: {
        url: 'https://m.media-amazon.com/images/I/71LTHwczIqL._AC_SL1500_.jpg',
        width: 500,
        height: 500,
      },
      price: '£19.89',
      category: 'Home & Kitchen',
      bestseller: true,
    },
    {
      asin: 'B07JLW1TT4',
      title: '12inch Table Fan Desk Fan with 3 Speed Oscillating Stand Fan Low Noise',
      url: 'https://www.amazon.co.uk/dp/B07JLW1TT4?tag=newsr01-21',
      image: {
        url: 'https://m.media-amazon.com/images/I/81o4HaPyn4S._AC_SL1500_.jpg',
        width: 500,
        height: 500,
      },
      price: '£93.68',
      category: 'Home & Kitchen',
      bestseller: true,
    },
    {
      asin: 'B0080ZSQKS',
      title: 'Dr. Beckmann Service-it Deep Clean Washing Machine Cleaner | Removes…',
      url: 'https://www.amazon.co.uk/dp/B0080ZSQKS?tag=newsr01-21',
      image: {
        url: 'https://m.media-amazon.com/images/I/61ArfBhiU3L._AC_SL1500_.jpg',
        width: 500,
        height: 500,
      },
      category: 'Home & Kitchen',
      bestseller: true,
    },
    {
      asin: 'B09P8KM9Z6',
      title: 'INIU USB C Charger Cable, 2m Type C Cable Fast Charging, Braided USB…',
      url: 'https://www.amazon.co.uk/dp/B09P8KM9Z6?tag=newsr01-21',
      image: {
        url: 'https://m.media-amazon.com/images/I/71u4I4gKayL._SL1500_.jpg',
        width: 500,
        height: 500,
      },
      price: '£6.79',
      category: 'Computers & Accessories',
      bestseller: true,
    },
    {
      asin: 'B0B7NTY2S6',
      title: 'SanDisk 128GB Ultra microSDXC card + SD adapter, Memory card Full…',
      url: 'https://www.amazon.co.uk/dp/B0B7NTY2S6?tag=newsr01-21',
      image: {
        url: 'https://m.media-amazon.com/images/I/71ur8MxJu2L._AC_SL1500_.jpg',
        width: 500,
        height: 500,
      },
      price: '£25.75',
      category: 'Computers & Accessories',
      bestseller: true,
    },
    {
      asin: 'B07DD5YHMH',
      title: 'Anker USB C Charger Cable, 2-Pack 3 ft (0.9 m) USB to USB C Cable, USB',
      url: 'https://www.amazon.co.uk/dp/B07DD5YHMH?tag=newsr01-21',
      image: {
        url: 'https://m.media-amazon.com/images/I/71b2ahim+-L._SL1500_.jpg',
        width: 500,
        height: 500,
      },
      price: '£7.95',
      category: 'Computers & Accessories',
      bestseller: true,
    },
    {
      asin: 'B0DK4MJRF3',
      title: 'Aioneus iPhone Charger Cable 2M, MFi Certified Lightning Cable Fast…',
      url: 'https://www.amazon.co.uk/dp/B0DK4MJRF3?tag=newsr01-21',
      image: {
        url: 'https://m.media-amazon.com/images/I/51ZEZjLgr2L._SL1500_.jpg',
        width: 500,
        height: 500,
      },
      price: '£8.17',
      category: 'Computers & Accessories',
      bestseller: true,
    },
    {
      asin: 'B0C9VVCL12',
      title: 'Magnesium Glycinate 3-in-1 Complex - 1800mg Supplements as Bisglycinat',
      url: 'https://www.amazon.co.uk/dp/B0C9VVCL12?tag=newsr01-21',
      image: {
        url: 'https://m.media-amazon.com/images/I/71dlmGG7WXL._AC_SL1500_.jpg',
        width: 500,
        height: 500,
      },
      price: '£10.31',
      category: 'Health & Personal Care',
      bestseller: true,
    },
    {
      asin: 'B003AIF4Q4',
      title: 'HIGH5 ZERO Electrolyte Tablet - Hydration Tablets Enhanced with Vitami',
      url: 'https://www.amazon.co.uk/dp/B003AIF4Q4?tag=newsr01-21',
      image: {
        url: 'https://m.media-amazon.com/images/I/61m3+mP+EyL._AC_SL1500_.jpg',
        width: 500,
        height: 500,
      },
      category: 'Health & Personal Care',
      bestseller: true,
    },
    {
      asin: 'B08Z8N9L1R',
      title: 'TePe Interdental Brush, Original, Yellow, 0.7mm/ISO 4, 20pcs, efficien',
      url: 'https://www.amazon.co.uk/dp/B08Z8N9L1R?tag=newsr01-21',
      image: {
        url: 'https://m.media-amazon.com/images/I/71epRl6DMjL._AC_SL1500_.jpg',
        width: 500,
        height: 500,
      },
      price: '£12.88',
      category: 'Health & Personal Care',
      bestseller: true,
    },
    {
      asin: 'B0DQQDZGCW',
      title: 'Pure Creatine Monohydrate Powder - 315g (90 Servings) - Easy Dissolve',
      url: 'https://www.amazon.co.uk/dp/B0DQQDZGCW?tag=newsr01-21',
      image: {
        url: 'https://m.media-amazon.com/images/I/61hpo9O18iL._AC_SL1500_.jpg',
        width: 500,
        height: 500,
      },
      price: '£9.01',
      category: 'Health & Personal Care',
      bestseller: true,
    },
    {
      asin: 'B08WR5CPNB',
      title: 'Maybelline Mascara, Lash Sensational Sky High Volumizing & Thickening…',
      url: 'https://www.amazon.co.uk/dp/B08WR5CPNB?tag=newsr01-21',
      image: {
        url: 'https://m.media-amazon.com/images/I/51iG+hr4RUL._AC_SL1500_.jpg',
        width: 500,
        height: 500,
      },
      price: '£9.49',
      category: 'Beauty',
      bestseller: true,
    },
    {
      asin: 'B09V7Z4TJG',
      title: 'medicube Zero Pore Pads 2.0, Dual-Textured Facial Toner Pads for Exfol',
      url: 'https://www.amazon.co.uk/dp/B09V7Z4TJG?tag=newsr01-21',
      image: {
        url: 'https://m.media-amazon.com/images/I/71Mcspt-6AL._AC_SL1500_.jpg',
        width: 500,
        height: 500,
      },
      price: '£21.65',
      category: 'Beauty',
      bestseller: true,
    },
    {
      asin: 'B00UYJGYCK',
      title: 'Rimmel 60 Seconds Super Shine Nail Polish, Quick-Dry Nail Polish, Ultr',
      url: 'https://www.amazon.co.uk/dp/B00UYJGYCK?tag=newsr01-21',
      image: {
        url: 'https://m.media-amazon.com/images/I/618KVHLHY+L._AC_SL1500_.jpg',
        width: 500,
        height: 500,
      },
      price: '£3.94',
      category: 'Beauty',
      bestseller: true,
    },
    {
      asin: 'B0B2RM68G2',
      title: 'BIODANCE Bio-Collagen Real Deep Face Mask 4 Pcs | Hydrogel Overnight…',
      url: 'https://www.amazon.co.uk/dp/B0B2RM68G2?tag=newsr01-21',
      image: {
        url: 'https://m.media-amazon.com/images/I/51ubxqzNGIL._AC_SL1000_.jpg',
        width: 500,
        height: 500,
      },
      price: '£12.18',
      category: 'Beauty',
      bestseller: true,
    },
  ],
  'www.amazon.fr': [
    {
      asin: 'B0DY1C8X92',
      title: 'TOCOL Coque Magnétique pour iPhone 15 6,1 Pouces, Compatible avec MagS',
      url: 'https://www.amazon.fr/dp/B0DY1C8X92?tag=newsromaniafr-21',
      image: {
        url: 'https://m.media-amazon.com/images/I/71R3qBMCCtL._AC_SL1500_.jpg',
        width: 500,
        height: 500,
      },
      price: '8,56€',
      category: 'High-Tech',
      bestseller: true,
    },
    {
      asin: 'B0GJTCB2QM',
      title: 'Apple AirTag (2ᵉ génération) : Traqueur pour Porte-clés, Portefeuille',
      url: 'https://www.amazon.fr/dp/B0GJTCB2QM?tag=newsromaniafr-21',
      image: {
        url: 'https://m.media-amazon.com/images/I/61lBuevDnnL._AC_SL1500_.jpg',
        width: 500,
        height: 500,
      },
      price: '24,39€',
      category: 'High-Tech',
      bestseller: true,
    },
    {
      asin: 'B0DCNWN8NZ',
      title: 'Apple EarPods (USB-C)',
      url: 'https://www.amazon.fr/dp/B0DCNWN8NZ?tag=newsromaniafr-21',
      image: {
        url: 'https://m.media-amazon.com/images/I/51oMc4XRaaL._AC_SL1500_.jpg',
        width: 500,
        height: 500,
      },
      price: '16,00€',
      category: 'High-Tech',
      bestseller: true,
    },
    {
      asin: 'B0G35M3XGG',
      title: "NEW'C Kit de 4, 2 x Verre Trempé pour iPhone 17 (6,3 Pouces) et 2 x…",
      url: 'https://www.amazon.fr/dp/B0G35M3XGG?tag=newsromaniafr-21',
      image: {
        url: 'https://m.media-amazon.com/images/I/71BosdhiJzL._AC_SL1500_.jpg',
        width: 500,
        height: 500,
      },
      price: '7,89€',
      category: 'High-Tech',
      bestseller: true,
    },
    {
      asin: 'B008YETL18',
      title: "De'Longhi EcoDecalk Détartrant DLSC500, 5 Doses de Décalcification…",
      url: 'https://www.amazon.fr/dp/B008YETL18?tag=newsromaniafr-21',
      image: {
        url: 'https://m.media-amazon.com/images/I/7135FCZclcL._AC_SL1500_.jpg',
        width: 500,
        height: 500,
      },
      price: '8,58€',
      category: 'Cuisine et Maison',
      bestseller: true,
    },
    {
      asin: 'B0CSG46SSN',
      title: "DREO 23dB ventilateur sur pied silencieux, portée de 24M, volume d'air",
      url: 'https://www.amazon.fr/dp/B0CSG46SSN?tag=newsromaniafr-21',
      image: {
        url: 'https://m.media-amazon.com/images/I/61CkqNFygHL._AC_SL1500_.jpg',
        width: 500,
        height: 500,
      },
      price: '109,99€',
      category: 'Cuisine et Maison',
      bestseller: true,
    },
    {
      asin: 'B077SWXDS5',
      title: 'Utopia Bedding Protège Matelas 160 x 200 x 30 cm Imperméable, Certifié',
      url: 'https://www.amazon.fr/dp/B077SWXDS5?tag=newsromaniafr-21',
      image: {
        url: 'https://m.media-amazon.com/images/I/81pQBMXKzEL._AC_SL1500_.jpg',
        width: 500,
        height: 500,
      },
      price: '15,16€',
      category: 'Cuisine et Maison',
      bestseller: true,
    },
    {
      asin: 'B07BFTRLTK',
      title: 'rabbitgoo Film Anti Regard Fenetre 44.5x200cm, Film Adhesif Effet Miro',
      url: 'https://www.amazon.fr/dp/B07BFTRLTK?tag=newsromaniafr-21',
      image: {
        url: 'https://m.media-amazon.com/images/I/61Ys5nWGJBL._AC_SL1001_.jpg',
        width: 500,
        height: 500,
      },
      price: '18,99€',
      category: 'Cuisine et Maison',
      bestseller: true,
    },
    {
      asin: 'B0B7NTY2S6',
      title: 'SanDisk 128 Go Ultra microSDXC, Carte micro sd + adaptateur…',
      url: 'https://www.amazon.fr/dp/B0B7NTY2S6?tag=newsromaniafr-21',
      image: {
        url: 'https://m.media-amazon.com/images/I/71HEG21YF1L._AC_SL1500_.jpg',
        width: 500,
        height: 500,
      },
      price: '24,99€',
      category: 'Informatique',
      bestseller: true,
    },
    {
      asin: 'B08T1HR5CS',
      title: 'HP 305, Pack de 2 Cartouches d’Encre Originales, 6ZD17AE, Noir, Cyan…',
      url: 'https://www.amazon.fr/dp/B08T1HR5CS?tag=newsromaniafr-21',
      image: {
        url: 'https://m.media-amazon.com/images/I/71rqY5IE0zL._AC_SL1500_.jpg',
        width: 500,
        height: 500,
      },
      price: '23,99€',
      category: 'Informatique',
      bestseller: true,
    },
    {
      asin: 'B087DJ43K3',
      title: "HP 305 Cartouche d'encre originale,3YM61AE, Noir, Compatible avec…",
      url: 'https://www.amazon.fr/dp/B087DJ43K3?tag=newsromaniafr-21',
      image: {
        url: 'https://m.media-amazon.com/images/I/81F5KBID2NL._AC_SL1500_.jpg',
        width: 500,
        height: 500,
      },
      price: '11,99€',
      category: 'Informatique',
      bestseller: true,
    },
    {
      asin: 'B08XZ2KS1F',
      title: 'Lexar Carte Micro SD 64 Go, Carte Mémoire Micro SD+ Adaptateur, Micros',
      url: 'https://www.amazon.fr/dp/B08XZ2KS1F?tag=newsromaniafr-21',
      image: {
        url: 'https://m.media-amazon.com/images/I/71OS+Ae-fZL._AC_SL1300_.jpg',
        width: 500,
        height: 500,
      },
      price: '18,99€',
      category: 'Informatique',
      bestseller: true,
    },
    {
      asin: 'B0GT5XNPYS',
      title: 'HYDRATIS - Pastilles Hydratation Electrolytes - Mangue Passion - Améli',
      url: 'https://www.amazon.fr/dp/B0GT5XNPYS?tag=newsromaniafr-21',
      image: {
        url: 'https://m.media-amazon.com/images/I/6129y+VEQAL._AC_SL1500_.jpg',
        width: 500,
        height: 500,
      },
      price: '8,79€',
      category: 'Hygiène et Santé',
      bestseller: true,
    },
    {
      asin: 'B09JS56L1T',
      title: 'Masque de Nuit Innovant 2026 pour Hommes et Femmes, Conception Masque',
      url: 'https://www.amazon.fr/dp/B09JS56L1T?tag=newsromaniafr-21',
      image: {
        url: 'https://m.media-amazon.com/images/I/71zd96B4b6L._AC_SL1500_.jpg',
        width: 500,
        height: 500,
      },
      price: '8,49€',
      category: 'Hygiène et Santé',
      bestseller: true,
    },
    {
      asin: 'B0BZJ9W4LW',
      title: 'Collagene Marin + Acide Hyaluronique & Vitamine C - 60 Gélules pour…',
      url: 'https://www.amazon.fr/dp/B0BZJ9W4LW?tag=newsromaniafr-21',
      image: {
        url: 'https://m.media-amazon.com/images/I/51eC5THrZXL._AC_SL1254_.jpg',
        width: 500,
        height: 500,
      },
      price: '9,97€',
      category: 'Hygiène et Santé',
      bestseller: true,
    },
    {
      asin: 'B0FB9M1GWY',
      title: 'PHILIPS Philips OneBlade Replacement Blades for Face/Body Kit…',
      url: 'https://www.amazon.fr/dp/B0FB9M1GWY?tag=newsromaniafr-21',
      image: {
        url: 'https://m.media-amazon.com/images/I/71sVk97+AUL._AC_SL1500_.jpg',
        width: 500,
        height: 500,
      },
      price: '22,45€',
      category: 'Hygiène et Santé',
      bestseller: true,
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
      price: '14,43€',
      category: 'Informatique',
      bestseller: true,
    },
  ],
  'www.amazon.de': [
    {
      asin: 'B07D4N472Q',
      title: 'WoldoClean Isopropanol 99,9% 1L Reinigungsalkohol, Entfetter für Elekt',
      url: 'https://www.amazon.de/dp/B07D4N472Q?tag=newsromaniade-21',
      image: {
        url: 'https://m.media-amazon.com/images/I/71VJPOsDlRL._AC_SL1500_.jpg',
        width: 500,
        height: 500,
      },
      price: '8,20€',
      category: 'Kamera & Foto',
      bestseller: true,
    },
    {
      asin: 'B0BV6JGPTG',
      title: 'instax mini 12™ Mint-Green',
      url: 'https://www.amazon.de/dp/B0BV6JGPTG?tag=newsromaniade-21',
      image: {
        url: 'https://m.media-amazon.com/images/I/517JzEiWAYL._AC_SL1200_.jpg',
        width: 500,
        height: 500,
      },
      price: '14,99€',
      category: 'Kamera & Foto',
      bestseller: true,
    },
    {
      asin: 'B07L9W8297',
      title: 'MR.SIGA Hochwertig Mikrofaser Reinigungstücher Brillenputztuch für Bri',
      url: 'https://www.amazon.de/dp/B07L9W8297?tag=newsromaniade-21',
      image: {
        url: 'https://m.media-amazon.com/images/I/815aTFNKJwL._AC_SL1500_.jpg',
        width: 500,
        height: 500,
      },
      price: '8,99€',
      category: 'Kamera & Foto',
      bestseller: true,
    },
    {
      asin: 'B0DDL8WGH5',
      title: 'DJI Mic Mini (2 Sender, 1 Empfänger, Ladeschale), Kabelloses Lavalier',
      url: 'https://www.amazon.de/dp/B0DDL8WGH5?tag=newsromaniade-21',
      image: {
        url: 'https://m.media-amazon.com/images/I/610KZmuio2L._AC_SL1500_.jpg',
        width: 500,
        height: 500,
      },
      price: '84,00€',
      category: 'Kamera & Foto',
      bestseller: true,
    },
    {
      asin: 'B01BYTG0WM',
      title: 'Jacobson Jersey Spannbettlaken Spannbetttuch Baumwolle Bettlaken…',
      url: 'https://www.amazon.de/dp/B01BYTG0WM?tag=newsromaniade-21',
      image: {
        url: 'https://m.media-amazon.com/images/I/61w4jIWTCnL._AC_SL1500_.jpg',
        width: 500,
        height: 500,
      },
      price: '9,00€',
      category: 'Küche, Haushalt & Wohnen',
      bestseller: true,
    },
    {
      asin: 'B07BFVKFTK',
      title: 'Utopia Bedding - Spannbettlaken 180x200cm - Grau - Gebürstete Polyeste',
      url: 'https://www.amazon.de/dp/B07BFVKFTK?tag=newsromaniade-21',
      image: {
        url: 'https://m.media-amazon.com/images/I/61oG2ZqV2tL._AC_SL1450_.jpg',
        width: 500,
        height: 500,
      },
      price: '8,86€',
      category: 'Küche, Haushalt & Wohnen',
      bestseller: true,
    },
    {
      asin: 'B008YETL18',
      title: "De'Longhi EcoDecalk Entkalker DLSC500, 5 Entkalkungs Dosen, Kaffee Mas",
      url: 'https://www.amazon.de/dp/B008YETL18?tag=newsromaniade-21',
      image: {
        url: 'https://m.media-amazon.com/images/I/7135FCZclcL._AC_SL1500_.jpg',
        width: 500,
        height: 500,
      },
      price: '5,99€',
      category: 'Küche, Haushalt & Wohnen',
      bestseller: true,
    },
    {
      asin: 'B09886CTWD',
      title: 'Buymax Spannbettlaken 140x200cm Baumwolle 100% Spannbetttuch Bettlaken',
      url: 'https://www.amazon.de/dp/B09886CTWD?tag=newsromaniade-21',
      image: {
        url: 'https://m.media-amazon.com/images/I/61FVdbNj9QL._AC_SL1500_.jpg',
        width: 500,
        height: 500,
      },
      price: '10,92€',
      category: 'Küche, Haushalt & Wohnen',
      bestseller: true,
    },
    {
      asin: 'B08T1HR5CS',
      title: 'HP 305 Original Druckerpatronen Schwarz und Tri-Color, 2er-Pack',
      url: 'https://www.amazon.de/dp/B08T1HR5CS?tag=newsromaniade-21',
      image: {
        url: 'https://m.media-amazon.com/images/I/71-Y5p8erIL._AC_SL1500_.jpg',
        width: 500,
        height: 500,
      },
      price: '25,99€',
      category: 'Computer & Zubehör',
      bestseller: true,
    },
    {
      asin: 'B0BR3L78XN',
      title: 'INIU 240W USB C Kabel, [2 Stück 2m] PD Schnellladekabel USB C auf USB',
      url: 'https://www.amazon.de/dp/B0BR3L78XN?tag=newsromaniade-21',
      image: {
        url: 'https://m.media-amazon.com/images/I/814lZbU+YYL._AC_SL1500_.jpg',
        width: 500,
        height: 500,
      },
      price: '9,99€',
      category: 'Computer & Zubehör',
      bestseller: true,
    },
    {
      asin: 'B0B7NTY2S6',
      title: 'SanDisk Ultra Android microSDXC UHS-I Speicherkarte 128 GB + Adapter…',
      url: 'https://www.amazon.de/dp/B0B7NTY2S6?tag=newsromaniade-21',
      image: {
        url: 'https://m.media-amazon.com/images/I/71HMMAm+TlL._AC_SL1500_.jpg',
        width: 500,
        height: 500,
      },
      price: '23,74€',
      category: 'Computer & Zubehör',
      bestseller: true,
    },
    {
      asin: 'B087DJ43K3',
      title: 'HP 305 (3YM61AE) Original Druckerpatrone Schwarz DeskJet 27xx, 41xx…',
      url: 'https://www.amazon.de/dp/B087DJ43K3?tag=newsromaniade-21',
      image: {
        url: 'https://m.media-amazon.com/images/I/81XLbeVrKCL._AC_SL1500_.jpg',
        width: 500,
        height: 500,
      },
      price: '12,41€',
      category: 'Computer & Zubehör',
      bestseller: true,
    },
    {
      asin: 'B0D26GWWD1',
      title: 'heat it - Insektenstichheiler für dein Smartphone - Chemiefreie Behand',
      url: 'https://www.amazon.de/dp/B0D26GWWD1?tag=newsromaniade-21',
      image: {
        url: 'https://m.media-amazon.com/images/I/71TnNDQ6IjL._AC_SL1500_.jpg',
        width: 500,
        height: 500,
      },
      price: '24,99€',
      category: 'Drogerie & Körperpflege',
      bestseller: true,
    },
    {
      asin: 'B0BGM7NFZG',
      title: 'sanotact Elektrolyte Plus (20 Beutel) • Elektrolyt Pulver für Flüssigk',
      url: 'https://www.amazon.de/dp/B0BGM7NFZG?tag=newsromaniade-21',
      image: {
        url: 'https://m.media-amazon.com/images/I/71Pge83U50L._AC_SL1500_.jpg',
        width: 500,
        height: 500,
      },
      price: '3,95€',
      category: 'Drogerie & Körperpflege',
      bestseller: true,
    },
    {
      asin: 'B089GRH43R',
      title: 'Beurer BiteX Original Insektenstichheiler BR 60, Mückenstich Hitzestif',
      url: 'https://www.amazon.de/dp/B089GRH43R?tag=newsromaniade-21',
      image: {
        url: 'https://m.media-amazon.com/images/I/7140c8oMt0L._AC_SL1500_.jpg',
        width: 500,
        height: 500,
      },
      price: '22,99€',
      category: 'Drogerie & Körperpflege',
      bestseller: true,
    },
    {
      asin: 'B09GGDPKSZ',
      title: 'by Amazon Classic Toilettenpapier, 3-lagig, 10 Rollen…',
      url: 'https://www.amazon.de/dp/B09GGDPKSZ?tag=newsromaniade-21',
      image: {
        url: 'https://m.media-amazon.com/images/I/61OURVpeF8L._AC_SL1500_.jpg',
        width: 500,
        height: 500,
      },
      price: '4,31€',
      category: 'Drogerie & Körperpflege',
      bestseller: true,
    },
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
      category: 'Computer & Zubehör',
      bestseller: true,
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
      category: 'Computer & Zubehör',
      bestseller: true,
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
      price: '19,99 €',
      category: 'Computer & Zubehör',
      bestseller: true,
    },
  ],
}

/**
 * The house set for a marketplace — the marketplace's own products, falling
 * back to the default (amazon.de) set for any unmapped marketplace.
 */
export function houseProductsForMarketplace(marketplace: string): AmazonProduct[] {
  return (
    HOUSE_AMAZON_PRODUCTS_BY_MARKETPLACE[marketplace] ??
    HOUSE_AMAZON_PRODUCTS_BY_MARKETPLACE[DEFAULT_MARKETPLACE] ??
    []
  )
}
