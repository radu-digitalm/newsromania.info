/**
 * Minimal ambient types for `geoip-lite` (no @types package installed).
 * Shape mirrors node_modules/geoip-lite/lib/geoip.js `module.exports`.
 */
declare module 'geoip-lite' {
  namespace geoip {
    interface Lookup {
      range: [number, number]
      /** ISO 3166-1 alpha-2 country code, e.g. 'RO'. */
      country: string
      region: string
      eu: '0' | '1'
      timezone: string
      city: string
      ll: [number, number]
      metro: number
      area: number
    }

    function lookup(ip: string | number): Lookup | null
    function pretty(ip: number): string
    function reloadData(callback?: (err?: unknown) => void): void
    function reloadDataSync(): void
    function startWatchingDataUpdate(callback?: () => void): void
    function stopWatchingDataUpdate(): void
    function clear(): void
  }

  export = geoip
}
