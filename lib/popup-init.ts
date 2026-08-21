/**
 * Pure async helper for popup mount-time initialisation. Extracted from
 * popup.tsx so we can unit-test it without a JSX-aware vitest plugin.
 *
 * Design contract (the regression this protects against):
 *  - Any failure here MUST be returned as `{ ok: false, error }` — never as
 *    a thrown rejection. The popup IIFE used to swallow rejections and hang
 *    on "Loading…" forever; this shape forces the caller to surface failure.
 *  - bootstrap failures are NON-fatal: if config writes throw (e.g. quota),
 *    we still try to read whatever's in storage and return it.
 */
import type { Brand, Config, Site } from './config'
import type { SeedProfile } from './seed'
import { bootstrapConfig } from './seed'

export type PopupSessionState =
  { kind: 'applied'; appliedAt: number } | { kind: 'off' } | { kind: 'not-applied' }

export interface PopupInitOk {
  ok: true
  tabId: number
  config: Config
  currentSite: Site | null
  session: PopupSessionState
}

export interface PopupInitErr {
  ok: false
  error: string
}

export type PopupInitResult = PopupInitOk | PopupInitErr

export interface PopupInitDeps {
  queryActiveTab: () => Promise<{ id?: number; url?: string } | undefined>
  getConfig: () => Promise<Config>
  setConfig: (cfg: Config) => Promise<void>
  getTabSession: (tabId: number) => Promise<number | 'user-off' | null>
  seedBrands: Brand[]
  seedProfiles: SeedProfile[]
}

export async function initPopupState(deps: PopupInitDeps): Promise<PopupInitResult> {
  try {
    const tab = await deps.queryActiveTab()
    if (!tab?.id || !tab.url) {
      return { ok: false, error: 'No active tab' }
    }
    const tabId = tab.id

    // Self-heal: SW may not have bootstrapped yet. Best-effort — a quota
    // failure here should not block reading whatever IS in storage.
    try {
      await bootstrapConfig(deps.seedBrands, deps.seedProfiles, deps.getConfig, deps.setConfig)
    } catch (err) {
      console.warn('[BrandFilter] popup bootstrap failed:', err)
    }

    const config = await deps.getConfig()
    const hostname = new URL(tab.url).hostname
    const currentSite = config.sites.find((s) => s.hostname === hostname) ?? null

    const sessionVal = await deps.getTabSession(tabId)
    const session: PopupSessionState =
      sessionVal === 'user-off'
        ? { kind: 'off' }
        : typeof sessionVal === 'number'
          ? { kind: 'applied', appliedAt: sessionVal }
          : { kind: 'not-applied' }

    return { ok: true, tabId, config, currentSite, session }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
