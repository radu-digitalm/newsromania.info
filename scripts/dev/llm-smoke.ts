/**
 * ONE-OFF live smoke test for src/lib/llm.ts (architecture.md §4).
 * Run: npx payload run scripts/dev/llm-smoke.ts
 *
 * Makes a handful of REAL OpenAI calls (frugal: 3–5 total, including the
 * excerpt retry if triggered) and verifies:
 *  1. summarizeExcerpt → ≤55 RO words, no >8-word verbatim run, attribution;
 *  2. categorizeAndTag → valid canonical slug + ≤4 tags (JSON mode);
 *  3. writeCaptions → all three platforms, twitter ≤240 chars;
 *  4. llm-usage rows upserted for today.
 * Do NOT wire this into CI — unit tests (vitest) stay fully mocked.
 */
import { getPayloadClient } from '../../src/lib/payload'
import { categorizeAndTag, summarizeExcerpt, writeCaptions } from '../../src/lib/llm'
import { longestCommonRun, wordCount } from '../../src/lib/llm-validate'

// Fixture written for this test (not real third-party text) — 3 paragraphs.
const FIXTURE = {
  title: 'Rețeaua de termoficare din Cluj-Napoca intră într-un amplu program de modernizare',
  sourceName: 'Monitorul de Ardeal',
  sourceText: [
    'Primăria Cluj-Napoca a anunțat marți lansarea unui program de modernizare a rețelei de termoficare, cu o valoare estimată la 180 de milioane de lei. Lucrările vor începe în luna septembrie și vizează înlocuirea a peste 40 de kilometri de conducte vechi de peste trei decenii, în cartierele Mănăștur, Gheorgheni și Grigorescu.',
    'Potrivit edilului, finanțarea este asigurată în proporție de 70% din fonduri europene prin Programul Operațional Dezvoltare Durabilă, restul fiind acoperit de la bugetul local. Municipalitatea estimează că pierderile din rețea, aflate în prezent la aproximativ 35%, vor scădea sub 10% după finalizarea lucrărilor, programată pentru sfârșitul anului 2028.',
    'Locuitorii din zonele afectate vor fi anunțați cu cel puțin șapte zile înainte de fiecare etapă de intervenție, iar furnizarea apei calde va fi întreruptă doar pe tronsoane scurte, de maximum 48 de ore. Asociațiile de proprietari pot solicita în această perioadă racordarea gratuită la noul sistem de contorizare inteligentă.',
  ].join('\n\n'),
}

async function main(): Promise<void> {
  console.log('--- 1) summarizeExcerpt (live) ---')
  const excerpt = await summarizeExcerpt(FIXTURE)
  if (excerpt === null) {
    throw new Error('summarizeExcerpt a returnat null (fallback link-only) pe fixture')
  }
  const words = wordCount(excerpt)
  const run = longestCommonRun(excerpt, FIXTURE.sourceText)
  console.log(`excerpt (${words} cuvinte, run verbatim max ${run}):\n${excerpt}\n`)
  if (words > 55) throw new Error(`excerpt prea lung: ${words} cuvinte`)
  if (run > 8) throw new Error(`run verbatim prea lung: ${run} cuvinte`)

  console.log('--- 2) categorizeAndTag (live) ---')
  const cat = await categorizeAndTag({ title: FIXTURE.title, excerpt })
  console.log(JSON.stringify(cat, null, 2))
  if (typeof cat.categorySlug !== 'string' || !Array.isArray(cat.tags) || cat.tags.length > 4) {
    throw new Error('formă invalidă la categorizeAndTag')
  }

  console.log('--- 3) writeCaptions (live) ---')
  const captions = await writeCaptions({
    title: FIXTURE.title,
    excerpt,
    url: 'https://newsromania.info/agregat/termoficare-cluj-modernizare',
    type: 'aggregated',
  })
  console.log(JSON.stringify(captions, null, 2))
  for (const key of ['facebook', 'twitter', 'instagram'] as const) {
    if (typeof captions[key] !== 'string' || captions[key].length === 0) {
      throw new Error(`caption lipsă: ${key}`)
    }
  }
  if (captions.twitter.length > 240) {
    throw new Error(`tweet prea lung: ${captions.twitter.length} caractere`)
  }

  console.log('--- 4) llm-usage rows for today ---')
  const payload = await getPayloadClient()
  const day = new Date().toISOString().slice(0, 10)
  const usage = await payload.find({
    collection: 'llm-usage',
    where: { day: { equals: day } },
    limit: 20,
    overrideAccess: true,
  })
  for (const row of usage.docs) {
    console.log(
      `${row.day} ${row.provider}/${row.model} ${row.purpose}: calls=${row.calls} ` +
        `in=${row.inputTokens} out=${row.outputTokens} est=$${(row.estCostUsd ?? 0).toFixed(6)}`,
    )
  }
  if (usage.docs.length === 0) throw new Error('niciun rând llm-usage scris')

  console.log('\nSMOKE OK')
  process.exit(0)
}

// Top-level await: `payload run` exits as soon as module evaluation finishes,
// so a floating promise would be killed mid-flight.
try {
  await main()
} catch (err) {
  console.error('SMOKE FAILED:', err instanceof Error ? err.message : err)
  process.exit(1)
}
