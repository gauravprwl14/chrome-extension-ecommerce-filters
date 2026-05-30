/** Alternative name match rule for a brand. */
export interface BrandVariant {
  type: 'string' | 'regex'
  /** Literal string value or regex pattern string (no delimiters, no flags). */
  value: string
}

/** A brand in the master library. May belong to multiple profiles. */
export interface Brand {
  /** URL-safe slug, e.g. "tommy-hilfiger" */
  id: string
  /** Display name, e.g. "Tommy Hilfiger" */
  name: string
  /** Alternative names used for matching on different sites. */
  variants?: BrandVariant[]
}

/** A named subset of masterBrands assigned to one or more sites. */
export interface Profile {
  id: string
  name: string
  /** Single emoji for visual identification. */
  icon: string
  /** References Brand.id. A brand may appear in multiple profiles. */
  brandIds: string[]
  /**
   * True iff this profile was created by the bootstrap seed and the user has
   * not modified its name, icon, or brand membership. System profiles are
   * locked in the UI; the user must Duplicate to edit. Optional for
   * legacy/test fixtures — `bootstrapConfig` + the v1→v2 migration
   * guarantee the field is set on every persisted profile.
   */
  isSystem?: boolean
}

/** Per-site configuration. */
export interface Site {
  id: string
  /** e.g. "www.myntra.com" */
  hostname: string
  /** Profile id that auto-applies on page load. */
  defaultProfileId: string
  enabled: boolean
  /**
   * null for built-in adapters.
   * For taught sites: CSS selector targeting the brand filter checkbox container.
   * e.g. ".brand-list input[type=checkbox]"
   */
  customSelector: string | null
}

/** Root config object stored in chrome.storage.sync. */
export interface Config {
  /** Schema version. Currently "1". */
  version: string
  /** Single source of truth for all brands. */
  masterBrands: Brand[]
  /** Named subsets of masterBrands. */
  profiles: Profile[]
  /** Per-site settings. */
  sites: Site[]
}

export const DEFAULT_CONFIG: Config = {
  version: '2',
  masterBrands: [],
  profiles: [],
  sites: [
    {
      id: 'myntra',
      hostname: 'www.myntra.com',
      defaultProfileId: '',
      enabled: true,
      customSelector: null,
    },
    {
      id: 'ajio',
      hostname: 'www.ajio.com',
      defaultProfileId: '',
      enabled: true,
      customSelector: null,
    },
  ],
}

/** Message sent from background to content script to trigger filter application. */
export interface ApplyMessage {
  action: 'applyProfile'
  profileId: string
}

/** Message sent from background to content script to clear applied filters. */
export interface ClearMessage {
  action: 'clearFilters'
}

/** Message sent from popup to background to trigger re-apply. */
export interface ReapplyMessage {
  action: 'reapply'
  tabId: number
  profileId: string
}

/** Message sent from popup to background to turn off filters. */
export interface TurnOffMessage {
  action: 'turnOff'
  tabId: number
}

/**
 * Message sent from popup → content script to read the brands the user has
 * currently selected on the page (for "create profile from this page").
 * Unlike ApplyMessage this is READ-ONLY and never navigates, so its handler
 * keeps the message channel open and responds asynchronously (return true).
 */
export interface CaptureSelectionMessage {
  action: 'captureSelection'
}

/** Response to CaptureSelectionMessage, content script → popup. */
export type CaptureSelectionResponse =
  | { ok: true; isFilterPage: boolean; brands: string[] }
  | { ok: false; reason: string }

export type ExtensionMessage =
  | ApplyMessage
  | ClearMessage
  | ReapplyMessage
  | TurnOffMessage
  | CaptureSelectionMessage
