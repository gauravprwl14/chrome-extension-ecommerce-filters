/**
 * Background orchestration — extracted into pure async functions so the
 * ordering between session-flag writes and content-script messages can be
 * unit-tested. The hard-won rule pinned by tests in tests/auto-apply.test.ts:
 *
 *   ALWAYS set the session flag BEFORE sending applyProfile/clearFilters.
 *   NEVER set it after.
 *
 * Why this matters: Myntra (and many e-commerce SPAs) does a real top-level
 * navigation on every brand-filter click — chrome.tabs.onUpdated fires
 * `status: 'loading'` per click. If the session flag isn't set until the
 * adapter finishes (which takes ~30s for a 20-brand profile because the
 * adapter awaits each click), the second onUpdated sees session=null and
 * re-triggers applyProfile on the freshly-loaded page → fresh adapter →
 * fresh clicks → fresh navigations → infinite loop.
 *
 * Setting the flag first means: any onUpdated that fires DURING the apply
 * cycle sees a non-null session and skips. If sendMessage rejects (e.g. the
 * content script was destroyed mid-flight by a navigation), we clear the
 * flag so the user's next manual Apply can succeed.
 */
import type { Config, ExtensionMessage } from './config'

export interface AutoApplyDeps {
  getConfig: () => Promise<Config>
  getTabSession: (tabId: number) => Promise<number | 'user-off' | null>
  setTabSession: (tabId: number, value: number | 'user-off') => Promise<void>
  clearTabSession: (tabId: number) => Promise<void>
  sendToTab: (tabId: number, msg: ExtensionMessage) => Promise<unknown>
  now: () => number
}

export interface AutoApplyResult {
  /** What happened — useful for tests/telemetry. */
  outcome:
    | 'no-matching-site'
    | 'site-disabled'
    | 'no-default-profile'
    | 'session-blocks'
    | 'applied'
    | 'apply-failed'
}

/**
 * Auto-apply path — invoked from chrome.tabs.onUpdated when a tab finishes
 * starting to load. Returns the outcome so tests can pin its decision tree.
 */
export async function handleAutoApply(
  tabId: number,
  hostname: string,
  deps: AutoApplyDeps,
): Promise<AutoApplyResult> {
  const config = await deps.getConfig()
  const site = config.sites.find((s) => s.hostname === hostname)
  if (!site) return { outcome: 'no-matching-site' }
  if (!site.enabled) return { outcome: 'site-disabled' }
  if (!site.defaultProfileId) return { outcome: 'no-default-profile' }

  const sessionState = await deps.getTabSession(tabId)
  if (sessionState !== null) return { outcome: 'session-blocks' }

  // CRITICAL ORDERING: stamp the session BEFORE messaging the content script.
  // See module header — if Myntra triggers a navigation while the adapter is
  // mid-flight, the next onUpdated must see this stamp and skip.
  await deps.setTabSession(tabId, deps.now())
  try {
    await deps.sendToTab(tabId, {
      action: 'applyProfile',
      profileId: site.defaultProfileId,
    })
    return { outcome: 'applied' }
  } catch {
    // Content script not ready or got destroyed mid-flight. Clear the stamp
    // so the next page-load can retry. Without this, a transient failure
    // would lock the tab out of auto-apply for its lifetime.
    await deps.clearTabSession(tabId)
    return { outcome: 'apply-failed' }
  }
}

/**
 * Popup-triggered Apply path. Same ordering rule as handleAutoApply.
 */
export async function handleReapply(
  tabId: number,
  profileId: string,
  deps: Pick<AutoApplyDeps, 'sendToTab' | 'setTabSession' | 'clearTabSession' | 'now'>,
): Promise<{ ok: boolean }> {
  // CRITICAL ORDERING: stamp BEFORE sending. The popup just asked to apply,
  // so any onUpdated triggered by adapter-clicks must not re-fire applyProfile.
  await deps.setTabSession(tabId, deps.now())
  try {
    await deps.sendToTab(tabId, { action: 'applyProfile', profileId })
    return { ok: true }
  } catch {
    await deps.clearTabSession(tabId)
    return { ok: false }
  }
}

/**
 * Popup "Off" path. user-off sentinel persists across page reloads in the
 * tab so auto-apply stays disabled until the user explicitly re-enables.
 */
export async function handleTurnOff(
  tabId: number,
  deps: Pick<AutoApplyDeps, 'sendToTab' | 'setTabSession'>,
): Promise<{ ok: boolean }> {
  await deps.setTabSession(tabId, 'user-off')
  try {
    await deps.sendToTab(tabId, { action: 'clearFilters' })
    return { ok: true }
  } catch {
    // 'user-off' stays set — we don't want to re-enable auto-apply just
    // because the content script wasn't reachable to clear visible chips.
    return { ok: false }
  }
}
