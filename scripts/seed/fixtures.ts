/**
 * Seed fixtures — the 6 Romanian evergreen originals + 8 aggregated items
 * frozen from the old mock data (see ./fixtures-source.ts for the verbatim
 * copy). Consumed by scripts/seed/baseline.mjs (run via `npx payload run`)
 * and available to tests.
 *
 * All publishers on aggregated items are FICTIONAL outlets pointing at
 * https://example.org/... — never real publications, to avoid misattribution.
 * In Payload, every original is bylined to the real „Redacția NewsRomania”
 * user (the fictional per-article authors from the mock era are dropped).
 */

import type { AggregatedItem, OriginalArticle } from '../../src/types/content'

// Mirrors siteConfig.categories (src/config/site.ts) — slugs only; baseline
// seeds the actual category docs straight from siteConfig to keep the order.
const cat = (slug: string, name: string) => ({ slug, name })
const categories = {
  actualitate: cat('actualitate', 'Actualitate'),
  politica: cat('politica', 'Politică'),
  economie: cat('economie', 'Economie'),
  externe: cat('externe', 'Externe'),
  sport: cat('sport', 'Sport'),
  sanatate: cat('sanatate', 'Sănătate'),
  tehnologie: cat('tehnologie', 'Tehnologie'),
  cultura: cat('cultura', 'Cultură'),
}

const redactia = { name: 'Redacția NewsRomania', slug: 'redactia-newsromania' }

/** 6 evergreen original articles, newest first. */
export const seedOriginalArticles: OriginalArticle[] = [
  {
    id: 'orig-01',
    type: 'original',
    slug: 'cum-functioneaza-sistemul-ro-alert-ghid-complet',
    title: 'Cum funcționează sistemul RO-Alert și ce trebuie să faci când primești o alertă',
    excerpt:
      'RO-Alert trimite mesaje de urgență direct pe telefon, fără nicio aplicație instalată. Explicăm cum funcționează tehnologia cell broadcast, în ce situații se emit alertele, cum arată un mesaj autentic și ce pași trebuie să urmezi imediat după ce îl primești.',
    category: categories.actualitate,
    tags: ['ro-alert', 'siguranță', 'ghid', 'situații de urgență'],
    publishedAt: '2026-07-06T08:30:00+03:00',
    author: redactia,
    body: [
      'RO-Alert este sistemul național prin care autoritățile transmit avertizări către populația aflată într-o zonă de risc. Spre deosebire de un SMS obișnuit, mesajele folosesc tehnologia cell broadcast: alerta este difuzată simultan către toate telefoanele conectate la antenele din zona vizată, fără ca cineva să cunoască numerele de telefon ale destinatarilor și fără costuri pentru utilizator.',
      'Alertele se emit doar în situații care pot pune viața în pericol: fenomene meteo extreme, inundații, incendii de amploare, prezența unor animale sălbatice periculoase în localități sau alte urgențe majore. Decizia de transmitere aparține autorităților responsabile cu gestionarea situațiilor de urgență, iar mesajul acoperă strict zona în care există riscul.',
      'Un mesaj RO-Alert autentic apare direct pe ecranul telefonului, de regulă însoțit de un semnal sonor distinct și de vibrații, în funcție de model și de setări. Mesajul conține descrierea pericolului, zona vizată și recomandările de urmat. Important de reținut: alertele autentice nu conțin linkuri de descărcare și nu cer niciodată date personale sau bancare.',
      'Ce faci când primești o alertă? Citește mesajul până la capăt și urmează instrucțiunile — ele sunt formulate pentru situația concretă din zona ta. Nu suna la 112 pentru a cere confirmarea alertei; numărul unic de urgență trebuie să rămână liber pentru cei care au nevoie de ajutor imediat. Dacă situația o cere, anunță-i și pe cei din jur, în special persoanele care ar putea să nu fi recepționat mesajul.',
      'Nu trebuie să instalezi nimic pentru a primi alertele: orice telefon compatibil, conectat la o rețea mobilă din România, le poate recepționa. Merită totuși să verifici în setările telefonului că opțiunea de alerte de urgență este activată — pe unele modele ea poate fi dezactivată manual. Pentru telefoanele foarte vechi, recepția poate depinde de rețeaua disponibilă în zonă.',
      'Sistemul are și limite cunoscute: pentru că difuzarea se face pe celulele rețelei mobile, mesajul poate ajunge uneori și la utilizatori aflați imediat în afara zonei de risc sau, dimpotrivă, cu o mică întârziere. De aceea, alertele trebuie privite ca un instrument de avertizare rapidă, complementar informării din sursele oficiale, nu ca unic canal de comunicare în situații de urgență.',
    ],
  },
  {
    id: 'orig-02',
    type: 'original',
    slug: 'ghid-cum-citesti-corect-factura-de-energie-electrica',
    title: 'Ghid: cum citești corect factura de energie electrică',
    excerpt:
      'Factura de energie electrică rămâne greu de descifrat pentru mulți consumatori. Trecem în revistă, pas cu pas, componentele facturii — energia activă, tarifele reglementate, taxele și TVA — și explicăm cum îți verifici indexul și cum compari ofertele furnizorilor.',
    category: categories.economie,
    tags: ['energie', 'facturi', 'ghid', 'consumatori'],
    publishedAt: '2026-07-03T09:15:00+03:00',
    author: redactia,
    body: [
      'De la liberalizarea pieței de energie, factura lunară a devenit un document stufos, cu rânduri de tarife și taxe pe care puțini consumatori le înțeleg pe deplin. Vestea bună este că structura facturii este aceeași la toți furnizorii, iar odată ce înțelegi componentele principale, poți verifica singur corectitudinea sumelor și poți compara în cunoștință de cauză ofertele din piață.',
      'Cea mai importantă componentă este energia activă: cantitatea de electricitate consumată efectiv, măsurată în kilowați-oră (kWh), înmulțită cu prețul pe kWh din contractul tău. Acest preț al energiei este singura componentă asupra căreia furnizorii concurează direct, deci merită urmărit cu atenție atât la semnarea contractului, cât și la fiecare notificare de modificare.',
      'Urmează tarifele reglementate, stabilite de autoritatea de reglementare și identice indiferent de furnizor: tariful de transport, tariful de distribuție (diferit în funcție de zona țării) și serviciile de sistem. Ele acoperă drumul energiei de la producător până la priza ta și apar distinct pe factură tocmai pentru ca partea concurențială să poată fi comparată separat.',
      'A treia categorie o formează contribuțiile și taxele: certificatele verzi, care susțin energia regenerabilă, contribuția pentru cogenerarea de înaltă eficiență, acciza și, la final, TVA aplicat întregii valori. Împreună, aceste componente pot depăși o treime din totalul facturii, ceea ce explică de ce prețul final pe kWh diferă sensibil de prețul energiei din ofertă.',
      'Verifică apoi indexul: factura poate fi emisă pe baza citirii distribuitorului, a autocitirii transmise de tine sau a unei estimări de consum. Dacă indexul este estimat, diferențele se corectează la regularizare, când se citește contorul. Transmiterea lunară a autocitirii, în intervalul comunicat de furnizor, rămâne cea mai simplă metodă de a plăti exact cât consumi.',
      'Pentru comparații între oferte, folosește comparatorul oficial al autorității de reglementare și uită-te întotdeauna la prețul final facturat pe kWh, cu toate componentele incluse, nu doar la prețul energiei active. Verifică și durata contractului, condițiile de modificare a prețului și eventualele taxe suplimentare, ca să eviți surprizele de la prima factură.',
      'La final, o regulă simplă: păstrează facturile și confirmările de plată cel puțin un an. În caz de neconcordanțe, ai la dispoziție întâi serviciul de relații cu clienții al furnizorului, iar dacă problema nu se rezolvă, poți depune o sesizare la autoritatea de reglementare — procedura este gratuită și se poate face online.',
    ],
  },
  {
    id: 'orig-03',
    type: 'original',
    slug: 'cum-iti-alegi-medicul-de-familie-pasii-de-urmat',
    title: 'Cum îți alegi medicul de familie: pașii de urmat și actele necesare',
    excerpt:
      'Medicul de familie este poarta de intrare în sistemul public de sănătate. Ghidul nostru explică unde găsești listele cu medici care primesc pacienți noi, ce documente sunt necesare la înscriere și în ce condiții poți schimba ulterior medicul ales.',
    category: categories.sanatate,
    tags: ['medic de familie', 'sănătate', 'ghid'],
    publishedAt: '2026-06-30T11:40:00+03:00',
    author: redactia,
    body: [
      'Medicul de familie este primul contact cu sistemul public de sănătate: el asigură consultațiile de bază, monitorizează bolile cronice, eliberează rețete și bilete de trimitere către specialiști și se ocupă de prevenție, de la vaccinări la evaluările periodice. Fără înscrierea pe lista unui medic de familie, accesul la multe servicii decontate devine complicat și mai costisitor.',
      'Primul pas este să găsești un medic care primește pacienți noi. Listele cabinetelor aflate în contract sunt publicate de casele de asigurări de sănătate pe site-urile lor, cu datele de contact ale fiecăruia. În practică, ajută și recomandările vecinilor sau ale colegilor, dar sună întotdeauna la cabinet înainte: listele medicilor buni se completează repede, iar numărul de locuri este limitat.',
      'Înscrierea propriu-zisă este simplă: se face direct la cabinet, pe baza actului de identitate și, acolo unde este solicitat, a cardului de sănătate. Completezi o cerere-tip prin care soliciți includerea pe lista medicului, iar cabinetul se ocupă de restul formalităților în relația cu casa de asigurări. Nu se percep taxe pentru înscriere.',
      'Pentru copii, înscrierea o fac părinții sau reprezentanții legali, cu certificatul de naștere al copilului și actul de identitate al părintelui. Persoanele neasigurate au și ele dreptul la un pachet minimal de servicii la medicul de familie, care include consultații pentru urgențe, monitorizarea sarcinii și serviciile de prevenție de bază.',
      'Dacă nu ești mulțumit, poți schimba medicul de familie, de regulă după cel puțin șase luni de la ultima înscriere — termenul exact și excepțiile (mutarea în altă localitate, de exemplu) merită verificate la casa de asigurări. Schimbarea se face printr-o cerere la noul cabinet, fără să fie nevoie de acordul medicului de la care pleci.',
      'Odată înscris, folosește relația cu medicul de familie în avantajul tău: programează evaluările preventive recomandate pentru vârsta ta, cere explicații despre tratamentele prescrise și păstrează un istoric al analizelor. O relație de durată cu același medic înseamnă un dosar medical coerent — și, de multe ori, probleme depistate la timp.',
    ],
  },
  {
    id: 'orig-04',
    type: 'original',
    slug: 'ce-este-autentificarea-in-doi-pasi-si-cum-o-activezi',
    title: 'Ce este autentificarea în doi pași și cum o activezi pe conturile tale',
    excerpt:
      'O parolă puternică nu mai este suficientă pentru a-ți proteja conturile online. Explicăm ce este autentificarea în doi pași, prin ce diferă codurile SMS de aplicațiile dedicate și de cheile fizice și cum activezi protecția pe conturile importante.',
    category: categories.tehnologie,
    tags: ['securitate', 'autentificare', 'ghid', 'conturi online'],
    publishedAt: '2026-06-27T17:05:00+03:00',
    author: redactia,
    body: [
      'Majoritatea conturilor sparte nu cad victimă unor atacuri sofisticate, ci unor parole slabe, refolosite pe mai multe site-uri sau scurse în breșe de date. Odată ce o parolă ajunge pe internet, oricine o poate încerca. Autentificarea în doi pași (cunoscută și ca 2FA sau verificare în două etape) adaugă un al doilea lacăt: chiar dacă parola este compromisă, contul rămâne protejat.',
      'Principiul este simplu: pe lângă ceva ce știi (parola), sistemul îți cere și ceva ce ai (telefonul, o aplicație, o cheie fizică). La fiecare conectare de pe un dispozitiv nou, după introducerea parolei, trebuie să confirmi identitatea prin acest al doilea factor. Un atacator care are doar parola se oprește aici.',
      'Cea mai răspândită formă este codul primit prin SMS. Este mai bună decât nimic, dar și cea mai fragilă variantă: mesajele pot fi interceptate, iar numărul de telefon poate fi preluat prin fraude de tip duplicare a cartelei. Folosește SMS-ul doar acolo unde nu există alternativă.',
      'Un pas mai sus se află aplicațiile de autentificare, care generează coduri temporare direct pe telefon, fără să depindă de rețeaua mobilă. Cel mai înalt nivel îl oferă cheile de securitate fizice și tehnologia passkey, care leagă autentificarea de dispozitivul tău și fac aproape imposibile atacurile de tip phishing, pentru că nu există niciun cod care să poată fi divulgat.',
      'Activarea durează câteva minute: intră în setările contului, secțiunea de securitate, și caută opțiunea „autentificare în doi pași” sau „verificare în două etape”. Începe cu conturile critice — e-mailul principal (cheia de recuperare a tuturor celorlalte conturi), serviciile bancare, conturile de social media și contul de la locul de muncă.',
      'La activare, serviciile îți oferă coduri de rezervă pentru situația în care pierzi telefonul. Salvează-le într-un loc sigur, separat de telefon — ideal într-un manager de parole sau imprimate. Fără ele, recuperarea unui cont cu 2FA activ poate dura zile întregi.',
      'Un ultim avertisment: niciun operator serios nu îți va cere vreodată codul de autentificare prin telefon sau mesaj. Dacă cineva ți-l solicită, este o tentativă de fraudă. Al doilea factor funcționează doar dacă rămâne ceea ce trebuie să fie: un secret care nu părăsește niciodată mâinile tale.',
    ],
  },
  {
    id: 'orig-05',
    type: 'original',
    slug: 'cum-ajunge-o-lege-sa-fie-adoptata-in-romania-traseul-legislativ',
    title: 'Cum ajunge o lege să fie adoptată în România: traseul legislativ, pe scurt',
    excerpt:
      'De la depunerea unui proiect până la publicarea în Monitorul Oficial, o lege parcurge un traseu cu reguli precise. Explicăm cine poate iniția legi, ce rol au comisiile parlamentare, cum decid cele două Camere și când intervine Curtea Constituțională.',
    category: categories.politica,
    tags: ['parlament', 'legislație', 'explicativ'],
    publishedAt: '2026-06-25T10:20:00+03:00',
    author: redactia,
    body: [
      'Orice lege începe cu o inițiativă legislativă. Dreptul de a propune legi îl au Guvernul (prin proiecte de lege), deputații și senatorii (prin propuneri legislative) și cetățenii — pentru inițiativele cetățenești este nevoie de cel puțin 100.000 de semnături, cu o distribuție teritorială minimă, iar unele domenii, precum cele fiscale, sunt excluse.',
      'Parlamentul României este bicameral, iar Constituția stabilește pentru fiecare tip de lege o „primă Cameră sesizată” și o „Cameră decizională”. Prima Cameră are un termen limitat de dezbatere — dacă nu se pronunță în acest termen, proiectul se consideră adoptat tacit și trece mai departe. Decizia finală aparține întotdeauna Camerei decizionale.',
      'Munca de detaliu se face în comisiile parlamentare de specialitate. Acolo proiectul primește avize și un raport, iar parlamentarii pot depune amendamente care modifică textul inițial. Raportul comisiei — de adoptare, de adoptare cu modificări sau de respingere — însoțește proiectul la votul din plen și cântărește decisiv în dezbatere.',
      'În plen, proiectul se dezbate mai întâi pe articole, apoi se votează în ansamblu. Majoritatea necesară depinde de tipul legii: legile ordinare au nevoie de votul majorității parlamentarilor prezenți, legile organice — de votul majorității membrilor fiecărei Camere, iar revizuirea Constituției urmează o procedură specială, cu praguri și mai ridicate.',
      'După adoptarea în ambele Camere, legea merge la președintele României pentru promulgare. Președintele poate cere Parlamentului, o singură dată, reexaminarea legii sau poate sesiza Curtea Constituțională. La rândul lor, un număr de parlamentari, Guvernul, Înalta Curte sau Avocatul Poporului pot contesta legea la Curte înainte de promulgare.',
      'Dacă Curtea Constituțională constată că legea sau părți din ea contravin Constituției, Parlamentul este obligat să pună textul de acord cu decizia Curții. Deciziile Curții sunt general obligatorii — niciun articol declarat neconstituțional nu poate intra în vigoare în forma respinsă.',
      'Ultimul pas este publicarea în Monitorul Oficial. Ca regulă generală, legea intră în vigoare la trei zile de la publicare, dacă în textul ei nu este prevăzut un alt termen. Abia din acel moment noile reguli produc efecte — iar traseul, de la idee la normă obligatorie, se încheie.',
    ],
  },
  {
    id: 'orig-06',
    type: 'original',
    slug: 'ghid-cum-iti-faci-permis-la-biblioteca-publica',
    title: 'Ghid: cum îți faci permis la biblioteca publică și ce poți împrumuta gratuit',
    excerpt:
      'Permisul de bibliotecă se obține gratuit, în câteva minute, la majoritatea bibliotecilor publice din țară. Îți arătăm ce acte sunt necesare, cum funcționează împrumutul la domiciliu, ce resurse digitale primești odată cu permisul și ce evenimente găzduiesc bibliotecile.',
    category: categories.cultura,
    tags: ['biblioteci', 'lectură', 'ghid', 'cultură'],
    publishedAt: '2026-06-23T14:50:00+03:00',
    author: redactia,
    body: [
      'România are o rețea densă de biblioteci publice — de la marile biblioteci județene până la filialele de cartier și bibliotecile comunale. Toate funcționează pe același principiu: accesul la colecții este un serviciu public, iar permisul de intrare se eliberează gratuit sau contra unei taxe simbolice, cu valabilitate de mai mulți ani și posibilitate de viză anuală.',
      'Pentru eliberarea permisului ai nevoie, de regulă, doar de actul de identitate. Minorii sunt înscriși de un părinte sau de reprezentantul legal, pe baza certificatului de naștere. Formalitățile durează câteva minute, iar multe biblioteci permit acum și preînscrierea online, urmând ca permisul fizic să fie ridicat la prima vizită.',
      'Permisul deschide accesul la împrumutul la domiciliu: de regulă câteva volume simultan, pentru două-trei săptămâni, cu posibilitate de prelungire dacă titlul nu este rezervat de altcineva. Regulamentul exact diferă de la o bibliotecă la alta, așa că merită citit la înscriere — tot acolo afli și cum funcționează rezervările pentru titlurile foarte căutate.',
      'Partea mai puțin cunoscută este oferta digitală: cataloage online în care cauți titlurile de acasă, platforme de cărți electronice și audiobookuri partenere, baze de date de presă și enciclopedii, plus acces gratuit la internet și la calculatoare în sălile bibliotecii. La multe biblioteci, permisul valabil este singura condiție pentru toate aceste servicii.',
      'Dincolo de cărți, bibliotecile publice au devenit centre comunitare: găzduiesc cluburi de lectură, ateliere pentru copii, cursuri de alfabetizare digitală pentru seniori și întâlniri cu autori. Programul evenimentelor este publicat pe site-urile și paginile de socializare ale bibliotecilor — iar participarea este, aproape fără excepție, gratuită.',
    ],
  },
]

/**
 * 8 aggregated items, newest first — baseline.mjs seeds only the freshest
 * TWO (arch §8 keeps the baseline minimal; the rest stay available for tests).
 */
export const seedAggregatedItems: AggregatedItem[] = [
  {
    id: 'agg-01',
    type: 'aggregated',
    slug: 'analiza-cum-functioneaza-spatiul-schengen-pentru-calatori',
    title: 'Analiză: cum funcționează spațiul Schengen și ce înseamnă pentru călători',
    excerpt:
      'Spațiul Schengen permite trecerea frontierelor interne fără controale sistematice, dar regulile de ședere și documentele necesare rămân adesea neclare pentru călători. Materialul explică pe înțelesul tuturor cum funcționează zona de liberă circulație, ce verificări pot apărea în situații excepționale și ce drepturi au pasagerii care călătoresc frecvent între statele membre.',
    category: categories.externe,
    tags: ['schengen', 'călătorii', 'uniunea europeană'],
    publishedAt: '2026-07-05T19:10:00+03:00',
    source: { name: 'Meridianul de Est', url: 'https://example.org/meridianul-de-est' },
    sourceUrl: 'https://example.org/meridianul-de-est/analiza-spatiul-schengen-calatori',
  },
  {
    id: 'agg-02',
    type: 'aggregated',
    slug: 'ghid-pentru-alergatorii-incepatori-primul-semimaraton',
    title: 'Ghid pentru alergătorii începători: cum te pregătești pentru primul semimaraton',
    excerpt:
      'Tot mai mulți alergători amatori se înscriu la curse de semimaraton, însă pregătirea corectă face diferența dintre o experiență plăcută și o accidentare. Articolul trece în revistă planurile de antrenament recomandate începătorilor, echipamentul de bază, greșelile frecvente din primele săptămâni și semnalele corpului care nu trebuie ignorate în timpul alergării.',
    category: categories.sport,
    tags: ['alergare', 'semimaraton', 'sport amator'],
    publishedAt: '2026-07-04T07:45:00+03:00',
    source: { name: 'Arena Presei', url: 'https://example.org/arena-presei' },
    sourceUrl: 'https://example.org/arena-presei/ghid-incepatori-primul-semimaraton',
  },
  {
    id: 'agg-03',
    type: 'aggregated',
    slug: 'ce-trebuie-sa-stii-despre-incarcarea-corecta-a-bateriilor',
    title: 'Ce trebuie să știi despre încărcarea corectă a bateriilor de telefon',
    excerpt:
      'Bateriile telefoanelor moderne nu mai au nevoie de descărcări complete, iar obiceiurile de încărcare moștenite din generațiile vechi de acumulatori pot face mai mult rău decât bine. Analiza explică pe scurt cum funcționează acumulatorii litiu-ion, de ce încărcarea parțială prelungește durata de viață și ce setări din telefon ajută la păstrarea capacității în timp.',
    category: categories.tehnologie,
    tags: ['baterii', 'telefoane', 'sfaturi'],
    publishedAt: '2026-07-02T16:20:00+03:00',
    source: { name: 'Cronica Digitală', url: 'https://example.org/cronica-digitala' },
    sourceUrl: 'https://example.org/cronica-digitala/incarcarea-corecta-a-bateriilor-de-telefon',
  },
  {
    id: 'agg-04',
    type: 'aggregated',
    slug: 'explicativ-ce-este-inflatia-si-cum-iti-afecteaza-economiile',
    title: 'Explicativ: ce este inflația și cum îți afectează economiile',
    excerpt:
      'Inflația influențează direct puterea de cumpărare și valoarea economiilor păstrate în conturi curente. Materialul explică pe scurt cum se măsoară creșterea prețurilor, ce înseamnă rata anuală a inflației pentru bugetul unei familii și ce instrumente simple de economisire pot proteja banii pe termen lung, de la depozite bancare la titluri de stat.',
    category: categories.economie,
    tags: ['inflație', 'economisire', 'finanțe personale'],
    publishedAt: '2026-07-01T12:00:00+03:00',
    source: { name: 'Radar Economic', url: 'https://example.org/radar-economic' },
    sourceUrl: 'https://example.org/radar-economic/explicativ-inflatia-si-economiile',
  },
  {
    id: 'agg-05',
    type: 'aggregated',
    slug: 'cum-se-obtine-cartea-electronica-de-identitate-pasii-necesari',
    title: 'Cum se obține cartea electronică de identitate: pașii și documentele necesare',
    excerpt:
      'Cartea electronică de identitate se eliberează treptat în tot mai multe județe, iar procedura ridică întrebări frecvente în rândul cetățenilor. Ghidul prezintă pașii de programare, documentele necesare la depunerea cererii, diferențele față de cartea de identitate clasică și ce trebuie să știe titularii despre certificatele digitale incluse în noul document.',
    category: categories.actualitate,
    tags: ['carte de identitate', 'documente', 'administrație'],
    publishedAt: '2026-06-29T09:30:00+03:00',
    source: { name: 'Curierul Carpaților', url: 'https://example.org/curierul-carpatilor' },
    sourceUrl: 'https://example.org/curierul-carpatilor/cartea-electronica-de-identitate-pasi',
  },
  {
    id: 'agg-06',
    type: 'aggregated',
    slug: 'de-ce-conteaza-hidratarea-vara-recomandarile-specialistilor',
    title: 'De ce contează hidratarea vara: recomandările specialiștilor, pe scurt',
    excerpt:
      'În sezonul cald, deshidratarea se instalează mai repede decât cred cei mai mulți, iar senzația de sete este un semnal întârziat. Sinteza prezintă recomandările specialiștilor privind consumul zilnic de lichide, categoriile de persoane expuse riscului, semnele timpurii ale deshidratării și băuturile care ajută sau, dimpotrivă, accentuează pierderea de apă.',
    category: categories.sanatate,
    tags: ['hidratare', 'vară', 'prevenție'],
    publishedAt: '2026-06-28T13:15:00+03:00',
    source: { name: 'Puls Medical', url: 'https://example.org/puls-medical' },
    sourceUrl: 'https://example.org/puls-medical/hidratarea-vara-recomandari',
  },
  {
    id: 'agg-07',
    type: 'aggregated',
    slug: 'explicativ-ce-face-un-europarlamentar-si-cum-te-reprezinta',
    title: 'Explicativ: ce face un europarlamentar și cum îți reprezintă interesele',
    excerpt:
      'Mulți alegători știu puține despre activitatea zilnică a unui europarlamentar după încheierea campaniilor electorale. Explicativul descrie cum lucrează comisiile Parlamentului European, cum se negociază rapoartele legislative, ce instrumente au aleșii pentru a influența deciziile Comisiei Europene și cum pot cetățenii urmări voturile și declarațiile reprezentanților lor.',
    category: categories.politica,
    tags: ['parlamentul european', 'explicativ', 'instituții'],
    publishedAt: '2026-06-26T15:40:00+03:00',
    source: { name: 'Gazeta de Mâine', url: 'https://example.org/gazeta-de-maine' },
    sourceUrl: 'https://example.org/gazeta-de-maine/ce-face-un-europarlamentar',
  },
  {
    id: 'agg-08',
    type: 'aggregated',
    slug: 'ghid-muzee-cu-acces-gratuit-cum-functioneaza-intrarea-libera',
    title: 'Ghid: muzeele cu acces gratuit și cum funcționează intrarea liberă',
    excerpt:
      'Vizitarea muzeelor nu trebuie să fie costisitoare: numeroase instituții publice de cultură oferă acces gratuit în anumite zile sau pentru anumite categorii de public. Ghidul explică unde găsești programul actualizat al muzeelor, cum funcționează intrarea liberă pentru elevi și studenți și ce expoziții permanente merită văzute măcar o dată.',
    category: categories.cultura,
    tags: ['muzee', 'cultură', 'timp liber'],
    publishedAt: '2026-06-24T18:25:00+03:00',
    source: { name: 'Scena și Litera', url: 'https://example.org/scena-si-litera' },
    sourceUrl: 'https://example.org/scena-si-litera/ghid-muzee-acces-gratuit',
  },
]

/** Starter Romanian RSS feeds — shipped DISABLED (legal gate, PROJECT_BRIEF 0.1). */
export interface SeedFeed {
  name: string
  url: string
  homepage: string
  defaultCategorySlug: string
}

export const seedFeeds: SeedFeed[] = [
  {
    name: 'Digi24',
    url: 'https://www.digi24.ro/rss',
    homepage: 'https://www.digi24.ro',
    defaultCategorySlug: 'actualitate',
  },
  {
    name: 'HotNews',
    url: 'https://hotnews.ro/feed',
    homepage: 'https://hotnews.ro',
    defaultCategorySlug: 'actualitate',
  },
  {
    name: 'G4Media',
    url: 'https://www.g4media.ro/feed',
    homepage: 'https://www.g4media.ro',
    defaultCategorySlug: 'actualitate',
  },
  {
    name: 'Agerpres',
    url: 'https://www.agerpres.ro/rss',
    homepage: 'https://www.agerpres.ro',
    defaultCategorySlug: 'actualitate',
  },
  {
    name: 'Libertatea',
    url: 'https://www.libertatea.ro/feed',
    homepage: 'https://www.libertatea.ro',
    defaultCategorySlug: 'actualitate',
  },
]
