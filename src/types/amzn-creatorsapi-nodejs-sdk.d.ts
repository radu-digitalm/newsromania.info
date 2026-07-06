/**
 * Minimal ambient types for the vendored Amazon Creators API SDK
 * (vendor/creatorsapi-nodejs-sdk — CommonJS, ships no .d.ts). Only the
 * surface src/lib/ads/amazon.ts touches is declared; response shapes are
 * modelled there (SdkSearchResponse) since the SDK returns plain objects.
 */
declare module '@amzn/creatorsapi-nodejs-sdk' {
  export class ApiClient {
    credentialId: string | null
    credentialSecret: string | null
    /** Credential version, e.g. '3.2' = EU region + LWA auth. */
    version: string | null
    basePath: string
    timeout: number
  }

  export class DefaultApi {
    constructor(apiClient?: ApiClient)
    searchItems(
      xMarketplace: string,
      opts: { searchItemsRequestContent: Record<string, unknown> },
    ): Promise<unknown>
  }

  export class SearchItemsRequestContent {
    partnerTag?: string
    keywords?: string
    searchIndex?: string
    itemCount?: number
    resources?: string[]
  }
}
