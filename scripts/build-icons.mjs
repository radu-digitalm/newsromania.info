// scripts/build-icons.mjs
// Generates every NewsRomania icon / OG / placeholder asset from the two source logos:
//   assets/logo-symbol.png (tricolor ring)  -> favicon.ico, icon.png, apple-icon.png,
//                                              public/icons/*, placeholder watermark
//   assets/logo-full.png   (wordmark lockup)-> public/og-default.png
//
// Idempotent and deterministic: safe to re-run, always overwrites with the same output.
// Run: export PATH="$HOME/bin:$PATH"; cd <project root>; node scripts/build-icons.mjs

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SYMBOL = path.join(root, 'assets', 'logo-symbol.png')
const LOGO_FULL = path.join(root, 'assets', 'logo-full.png')

// Brand palette — docs/design-direction-v2.md („Prim-Plan Tricolor”); the
// tricolor bar itself is unchanged from v1 (brand signature).
const BRAND = {
  blue: '#4463AD',
  yellow: '#F6EF49',
  red: '#ED2024',
}

// Placeholder treatment per design-direction-v2 §5.3 — ONE treatment
// site-wide: bg gradient 135° accent-bg #E9EEF9 → accent-bg-strong #DBE3F2,
// ring motif MONOCHROME #6E85C3 (brand-periwinkle) at opacity 0.18, width
// 120% of the box, anchored right:-16% / bottom:-36% (arcs crop in —
// watermark, not logo slap), and the category label bottom-left in a solid
// #FFFFFF pill, kicker style in red-text #C0121F (6.27:1 on white).
const PLACEHOLDER_BG_START = '#E9EEF9' // --color-accent-bg
const PLACEHOLDER_BG_END = '#DBE3F2' // --color-accent-bg-strong
const PLACEHOLDER_RING = { r: 0x6e, g: 0x85, b: 0xc3 } // #6E85C3, decorative only
const PLACEHOLDER_RING_OPACITY = 0.18
const PLACEHOLDER_LABEL_COLOR = '#C0121F' // --color-red-text on the white pill
const PLACEHOLDER_PILL_BG = '#FFFFFF'

// Category slugs (src/config/site.ts contract) + generic, with the label text.
const PLACEHOLDER_LABELS = {
  actualitate: 'Actualitate',
  politica: 'Politică',
  economie: 'Economie',
  international: 'Internațional',
  sport: 'Sport',
  sanatate: 'Sănătate',
  tehnologie: 'Tehnologie',
  cultura: 'Cultură',
  generic: 'NewsRomania',
}

const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 }

/** Write a buffer under the project root, creating parent directories. */
async function save(relPath, buffer) {
  const abs = path.join(root, relPath)
  await mkdir(path.dirname(abs), { recursive: true })
  await writeFile(abs, buffer)
  console.log(`  wrote ${relPath} (${buffer.length} bytes)`)
}

/** Multiply the alpha channel of a PNG buffer by `opacity` (0..1). */
async function withOpacity(pngBuffer, opacity) {
  const { data, info } = await sharp(pngBuffer).ensureAlpha().raw().toBuffer({
    resolveWithObject: true,
  })
  for (let i = 3; i < data.length; i += 4) data[i] = Math.round(data[i] * opacity)
  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: info.channels },
  })
    .png()
    .toBuffer()
}

/**
 * Recolor every non-transparent pixel to a single flat color, keeping the
 * alpha channel — turns the multicolor ring into the monochrome motif
 * design-direction-v2 §5.3 requires (yellow/red arcs are banned on light
 * surfaces).
 */
async function monochrome(pngBuffer, { r, g, b }) {
  const { data, info } = await sharp(pngBuffer).ensureAlpha().raw().toBuffer({
    resolveWithObject: true,
  })
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r
    data[i + 1] = g
    data[i + 2] = b
  }
  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: info.channels },
  })
    .png()
    .toBuffer()
}

/**
 * Render the (trimmed) ring symbol centered on a square canvas.
 * padRatio is the padding on EACH side as a fraction of the canvas size.
 */
async function symbolOnSquare(symbolBuf, size, padRatio, background) {
  const inner = Math.round(size * (1 - 2 * padRatio))
  const content = await sharp(symbolBuf)
    .resize(inner, inner, { fit: 'contain', background: TRANSPARENT })
    .png()
    .toBuffer()
  const offset = Math.round((size - inner) / 2)
  return sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: content, left: offset, top: offset }])
    .png()
    .toBuffer()
}

/** Three solid rectangles forming the tricolor bar (flag order: blue, yellow, red). */
function tricolorBarComposites(width, barHeight, top) {
  const b1 = Math.round(width * 0.334)
  const b2 = Math.round(width * 0.667)
  const rect = (w, background) => ({
    create: { width: w, height: barHeight, channels: 4, background },
  })
  return [
    { input: rect(b1, BRAND.blue), left: 0, top },
    { input: rect(b2 - b1, BRAND.yellow), left: b1, top },
    { input: rect(width - b2, BRAND.red), left: b2, top },
  ]
}

async function buildFavicon(symbolBuf) {
  // Multi-size ICO from the trimmed symbol; transparency preserved, full-bleed
  // (no extra margin) so the ring stays legible at 16px.
  const pngs = []
  for (const size of [48, 32, 16]) {
    pngs.push(await symbolOnSquare(symbolBuf, size, 0, TRANSPARENT))
  }
  const ico = await pngToIco(pngs)
  await save('src/app/favicon.ico', ico)
}

async function buildAppIcons(symbolBuf) {
  // src/app/icon.png — 512x512, transparent, small safe margin (~5% per side)
  await save('src/app/icon.png', await symbolOnSquare(symbolBuf, 512, 0.05, TRANSPARENT))

  // src/app/apple-icon.png — 180x180 on white (Apple dislikes transparency), ~12% padding
  const apple = await symbolOnSquare(symbolBuf, 180, 0.12, '#FFFFFF')
  await save('src/app/apple-icon.png', await sharp(apple).removeAlpha().png().toBuffer())

  // public/icons — maskable-safe: centered on white with 20% padding on each side
  for (const size of [192, 512]) {
    const buf = await symbolOnSquare(symbolBuf, size, 0.2, '#FFFFFF')
    await save(`public/icons/icon-${size}.png`, await sharp(buf).removeAlpha().png().toBuffer())
  }
}

async function buildOgDefault() {
  // 1200x630 social card: logo-full centered at 56% width on white,
  // 6px tricolor baseline along the bottom edge (design direction §5.3). No text.
  const W = 1200
  const H = 630
  const BAR = 6
  const logo = await sharp(LOGO_FULL)
    .trim()
    .resize({ width: Math.round(W * 0.56) })
    .png()
    .toBuffer()
  const meta = await sharp(logo).metadata()
  const left = Math.round((W - meta.width) / 2)
  const top = Math.round((H - BAR - meta.height) / 2)
  const card = await sharp({ create: { width: W, height: H, channels: 4, background: '#FFFFFF' } })
    .composite([{ input: logo, left, top }, ...tricolorBarComposites(W, BAR, H - BAR)])
    .removeAlpha()
    .png()
    .toBuffer()
  await save('public/og-default.png', card)
}

/**
 * Kicker-style label raster (uppercase, bold, +0.06em tracking per v2 §2.2),
 * alpha-trimmed so the pill can be sized to the REAL text bounds instead of
 * a per-font width guess.
 */
async function kickerLabel(label, fontSize) {
  const pad = fontSize * 2
  const svg = Buffer.from(
    `<svg width="${Math.ceil(label.length * fontSize * 1.4 + pad * 2)}" ` +
      `height="${fontSize * 4}" xmlns="http://www.w3.org/2000/svg">` +
      `<text x="${pad}" y="${fontSize * 2.5}" ` +
      `font-family="Inter, 'DejaVu Sans', sans-serif" font-size="${fontSize}" ` +
      `font-weight="700" letter-spacing="${(fontSize * 0.06).toFixed(2)}" ` +
      `fill="${PLACEHOLDER_LABEL_COLOR}">${label.toUpperCase()}</text></svg>`,
  )
  const trimmed = await sharp(await sharp(svg).png().toBuffer())
    .trim()
    .png()
    .toBuffer()
  const meta = await sharp(trimmed).metadata()
  return { buf: trimmed, width: meta.width, height: meta.height }
}

async function buildPlaceholders(symbolBuf) {
  // 1200x675 (16:9) branded placeholders per design-direction-v2 §5.3 — one
  // treatment site-wide: gradient bg 135° #E9EEF9 → #DBE3F2, the ring
  // recolored to MONOCHROME periwinkle at opacity 0.18, width 120% of the
  // box, anchored right:-16% / bottom:-36% so only the sweeping arcs crop
  // into frame, plus the category label bottom-left in a solid white pill
  // (kicker style, red-text #C0121F, 12px CSS inset).
  const W = 1200
  const H = 675
  // The raster is 1200px wide but typically displayed ~380px (3-col grid
  // card), so CSS-pixel values from the spec scale by ~3.16 to stay true at
  // the common display sizes: 11px kicker → 35, 12px inset → 38,
  // 10px/3px pill padding → 32/10.
  const FONT_SIZE = 35
  const INSET = 38
  const PILL_PAD_X = 32
  const PILL_PAD_Y = 10

  const gradientBg = Buffer.from(
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">` +
      `<defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">` +
      `<stop offset="0%" stop-color="${PLACEHOLDER_BG_START}"/>` +
      `<stop offset="100%" stop-color="${PLACEHOLDER_BG_END}"/>` +
      `</linearGradient></defs>` +
      `<rect width="${W}" height="${H}" fill="url(#g)"/></svg>`,
  )

  const ring = await sharp(await monochrome(symbolBuf, PLACEHOLDER_RING))
    .resize({ width: Math.round(W * 1.2) })
    .png()
    .toBuffer()
  const rm = await sharp(ring).metadata()

  // CSS-equivalent anchoring: right: -16%; bottom: -36% (fractions of the container)
  const left = W + Math.round(W * 0.16) - rm.width
  const top = H + Math.round(H * 0.36) - rm.height

  // sharp requires the overlay to fit inside the canvas: crop to the visible intersection
  const srcX = Math.max(0, -left)
  const srcY = Math.max(0, -top)
  const dstX = Math.max(0, left)
  const dstY = Math.max(0, top)
  const visW = Math.min(rm.width - srcX, W - dstX)
  const visH = Math.min(rm.height - srcY, H - dstY)
  const cropped = await sharp(ring)
    .extract({ left: srcX, top: srcY, width: visW, height: visH })
    .png()
    .toBuffer()
  const watermark = await withOpacity(cropped, PLACEHOLDER_RING_OPACITY)

  for (const [slug, label] of Object.entries(PLACEHOLDER_LABELS)) {
    const text = await kickerLabel(label, FONT_SIZE)
    const pillW = text.width + PILL_PAD_X * 2
    const pillH = text.height + PILL_PAD_Y * 2
    const pillLeft = INSET
    const pillTop = H - INSET - pillH
    const pillSvg = Buffer.from(
      `<svg width="${pillW}" height="${pillH}" xmlns="http://www.w3.org/2000/svg">` +
        `<rect width="${pillW}" height="${pillH}" rx="${(pillH / 2).toFixed(1)}" ` +
        `fill="${PLACEHOLDER_PILL_BG}"/></svg>`,
    )
    const img = await sharp(gradientBg)
      .composite([
        { input: watermark, left: dstX, top: dstY },
        { input: pillSvg, left: pillLeft, top: pillTop },
        {
          input: text.buf,
          left: pillLeft + PILL_PAD_X,
          top: pillTop + Math.round((pillH - text.height) / 2),
        },
      ])
      .removeAlpha()
      .png()
      .toBuffer()
    await save(`public/placeholders/${slug}.png`, img)
  }
}

async function main() {
  console.log('NewsRomania — building icons & static brand assets')
  const symbolBuf = await sharp(SYMBOL).trim().png().toBuffer()

  await buildFavicon(symbolBuf)
  await buildAppIcons(symbolBuf)
  await buildOgDefault()
  await buildPlaceholders(symbolBuf)

  console.log('Done.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
