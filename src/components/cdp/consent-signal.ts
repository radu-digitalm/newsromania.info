/**
 * Google-CMP consent reader (client-only) — the signal that RE-ACTIVATES the
 * first-party CDP (PROJECT_BRIEF §8, CMP reconciliation 2026-07).
 *
 * Since our own banner was retired, advertising/analytics consent is owned by
 * Google's certified CMP, delivered through the AdSense tag. We must read ITS
 * decision, not the removed `nr_consent` cookie. Two complementary sources —
 * both provided by the same CMP — are consulted, TCF first:
 *
 *   1. IAB TCF v2 — `window.__tcfapi('getTCData', 2, cb)` and its
 *      'addEventListener' updates. We treat consent as GRANTED when the CMP is
 *      loaded ('tcloaded' | 'useractioncomplete') and EITHER gdprApplies is
 *      false (visitor outside the EEA — TCF does not apply) OR the visitor has
 *      granted the storage/analytics purposes we rely on (Purpose 1 = "store
 *      and/or access information on a device", the legal basis for our
 *      first-party visitor-id cookie). Absent Purpose 1 there is no lawful
 *      basis to persist nr_vid, so we stay dormant.
 *
 *   2. Google Consent Mode v2 — as a fallback where TCF is not present, we read
 *      the CMP's default+update via the shared `dataLayer`, granting only when
 *      the latest consent state sets BOTH analytics_storage AND ad_storage to
 *      'granted' (the CDP feeds ad targeting, so we require the ad basis too).
 *
 * The reader is CONSERVATIVE: any ambiguity (no CMP, no signal yet, malformed
 * data, errors) resolves to 'unknown' → the CDP stays dormant and no cookies
 * are written. It never itself touches cookies or storage.
 */

/** Purpose 1 (store/access info on device) — the basis for the nr_vid cookie. */
const REQUIRED_TCF_PURPOSE = 1

export type CmpConsentSignal = 'granted' | 'denied' | 'unknown'

/** Subscribe callback: fires with the current signal now and on every change. */
export type CmpConsentListener = (signal: CmpConsentSignal) => void

interface TcData {
  eventStatus?: string
  gdprApplies?: boolean
  purpose?: { consents?: Record<string, boolean> }
  /** Present only in the addEventListener registration callback. */
  listenerId?: number
}

type TcfApi = (
  command: 'getTCData' | 'addEventListener' | 'removeEventListener',
  version: number,
  callback: (tcData: TcData, success: boolean) => void,
  listenerId?: number,
) => void

interface ConsentModeEntry {
  analytics_storage?: string
  ad_storage?: string
}

interface CmpWindow extends Window {
  __tcfapi?: TcfApi
  dataLayer?: unknown[]
}

function cmpWindow(): CmpWindow | null {
  return typeof window === 'undefined' ? null : (window as CmpWindow)
}

/** Map one TCData payload to a signal (null = not decided yet, keep waiting). */
export function signalFromTcData(tcData: TcData, success: boolean): CmpConsentSignal | null {
  if (!success || typeof tcData !== 'object' || tcData === null) return null
  const status = tcData.eventStatus
  // Only act once the CMP has finished loading or the user has acted.
  if (status !== 'tcloaded' && status !== 'useractioncomplete') return null
  // TCF does not apply (outside the EEA): no GDPR gate on storage here.
  if (tcData.gdprApplies === false) return 'granted'
  const consents = tcData.purpose?.consents
  return consents && consents[REQUIRED_TCF_PURPOSE] === true ? 'granted' : 'denied'
}

/** Latest Consent Mode state from the dataLayer (fallback when TCF is absent). */
export function consentModeSignal(win: Pick<CmpWindow, 'dataLayer'>): CmpConsentSignal {
  const layer = win.dataLayer
  if (!Array.isArray(layer)) return 'unknown'
  let latest: ConsentModeEntry | null = null
  for (const entry of layer) {
    // gtag consent pushes arrive as ['consent', 'default'|'update', {...}].
    if (Array.isArray(entry) && entry[0] === 'consent' && typeof entry[2] === 'object') {
      latest = entry[2] as ConsentModeEntry
    }
  }
  if (!latest) return 'unknown'
  const analytics = latest.analytics_storage
  const ad = latest.ad_storage
  if (analytics === 'granted' && ad === 'granted') return 'granted'
  if (analytics === 'denied' || ad === 'denied') return 'denied'
  return 'unknown'
}

/**
 * Subscribe to the CMP consent signal. Invokes `listener` with the current
 * signal as soon as it is known and again whenever the CMP updates it. Returns
 * an unsubscribe function. Safe to call on the server (no-op, returns a noop).
 */
export function subscribeCmpConsent(listener: CmpConsentListener): () => void {
  const win = cmpWindow()
  if (!win) return () => {}

  let listenerId: number | undefined
  let disposed = false

  const emit = (signal: CmpConsentSignal) => {
    if (!disposed) listener(signal)
  }

  // --- 1. TCF v2 (preferred) -------------------------------------------------
  if (typeof win.__tcfapi === 'function') {
    const tcfapi = win.__tcfapi
    try {
      tcfapi('addEventListener', 2, (tcData, success) => {
        // TCF returns our registration id via the first callback (tcData.listenerId).
        if (typeof tcData?.listenerId === 'number' && listenerId === undefined) {
          listenerId = tcData.listenerId
        }
        const signal = signalFromTcData(tcData, success)
        if (signal !== null) emit(signal)
      })
    } catch {
      // TCF present but misbehaving — fall through to Consent Mode below.
    }
  }

  // --- 2. Consent Mode fallback (poll the dataLayer briefly) -----------------
  // The CMP writes its default/update pushes asynchronously; poll a few times
  // so a granted state that lands just after mount is still picked up. This is
  // only consulted when TCF has not already produced a definitive 'granted'.
  let polls = 0
  const interval = win.setInterval(() => {
    polls += 1
    const signal = consentModeSignal(win)
    if (signal !== 'unknown') emit(signal)
    if (polls >= 20 || disposed) win.clearInterval(interval)
  }, 500)

  return () => {
    disposed = true
    win.clearInterval(interval)
    if (typeof win.__tcfapi === 'function' && listenerId !== undefined) {
      try {
        win.__tcfapi('removeEventListener', 2, () => {}, listenerId)
      } catch {
        // best-effort teardown
      }
    }
  }
}
