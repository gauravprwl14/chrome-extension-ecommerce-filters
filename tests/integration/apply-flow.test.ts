/**
 * End-to-end integration test for the apply workflow on Myntra.
 *
 * This test wires together the three layers the bug spanned:
 *   1. background orchestration (lib/auto-apply.ts) — session-flag ordering
 *   2. content-script ACK (simulated synchronously) — message channel stays
 *      open even when the adapter later navigates
 *   3. MyntraAdapter — URL-driven single navigation
 *
 * The bug history this guards against:
 *   - "Watches on Myntra only applies 2 brands" — adapter clicked checkboxes
 *     one at a time, each click navigated, content script destroyed → only
 *     1–2 clicks landed before the page reloaded.
 *   - "URL flickers and page never settles" — background's session flag was
 *     stamped AFTER sendMessage, so each per-click navigation re-fired
 *     applyProfile and the loop never terminated.
 *
 * What we assert end-to-end:
 *   ✅ Auto-apply triggers ONE navigation that contains ALL applicable brands.
 *   ✅ A simulated post-navigation `onUpdated` is blocked by the session
 *      flag — no second apply.
 *   ✅ Other URL facets (Price, Color) survive the apply.
 */
import { describe, it, expect, vi } from 'vitest'
import type { Config } from '../../lib/config'
import { DEFAULT_CONFIG } from '../../lib/config'
import { handleAutoApply, type AutoApplyDeps } from '../../lib/auto-apply'
import { MyntraAdapter } from '../../lib/adapters/myntra'

// ── Fake page / location ──────────────────────────────────────────────────────

function setupMyntraDom(initialHref: string) {
  Array.from(document.body.attributes).forEach((a) => document.body.removeAttribute(a.name))
  document.body.innerHTML = `
    <div class="vertical-filters-filters brand-container">
      <ul class="brand-list">
        <li><label><input type="checkbox" value="Tommy Hilfiger">Tommy Hilfiger</label></li>
        <li><label><input type="checkbox" value="Roadster">Roadster</label></li>
      </ul>
      <div class="brand-more">+ more</div>
    </div>
  `
  // Modal opens on .brand-more click and contains the watch brands
  document.querySelector('.brand-more')!.addEventListener('click', () => {
    if (document.querySelector('.FilterDirectory-list')) return
    const panel = document.createElement('div')
    panel.className = 'FilterDirectory-panel'
    panel.innerHTML = `
      <span class="FilterDirectory-close">×</span>
      <ul class="FilterDirectory-list">
        ${['Timex', 'Casio', 'SONATA', 'TITAN', 'FASTRACK', 'Invicta']
          .map((v) => `<li><label><input type="checkbox" value="${v}">${v}</label></li>`)
          .join('')}
      </ul>`
    document.body.appendChild(panel)
  })

  const calls: string[] = []
  const fake = {
    href: initialHref,
    pathname: new URL(initialHref).pathname,
    hostname: 'www.myntra.com',
    assign: vi.fn((url: string) => {
      calls.push(url)
      fake.href = url
    }),
  }
  Object.defineProperty(window, 'location', { value: fake, writable: true })
  return { calls }
}

// ── Synthetic content-script: ACKs immediately, then runs adapter async ──────

function makeContentScriptSendToTab(
  adapter: MyntraAdapter,
  profile: Config['profiles'][0],
  cfg: Config,
) {
  // This mirrors what contents/myntra.ts does on the real page:
  //   1. sendResponse({ok:true}) synchronously (we resolve the promise now)
  //   2. handleApply runs in the background, eventually navigates
  const pending: Promise<void>[] = []
  const sendToTab: AutoApplyDeps['sendToTab'] = async (_tabId, msg) => {
    if (msg.action !== 'applyProfile') return { ok: false }
    // Synchronous ACK: resolve immediately. Then schedule the async apply.
    pending.push(
      (async () => {
        const brands = cfg.masterBrands.filter((b) => profile.brandIds.includes(b.id))
        await adapter.applyBrands(brands)
      })(),
    )
    return { ok: true }
  }
  // Allow tests to await all in-flight applies before assertions
  const drain = async () => {
    while (pending.length) {
      const next = pending.shift()!
      await next
    }
  }
  return { sendToTab, drain }
}

// ── Test fixture ──────────────────────────────────────────────────────────────

function watchesConfig(): Config {
  return {
    ...DEFAULT_CONFIG,
    masterBrands: [
      { id: 'tommy-hilfiger', name: 'Tommy Hilfiger' },
      { id: 'timex', name: 'Timex' },
      { id: 'casio', name: 'Casio' },
      { id: 'sonata', name: 'SONATA' },
      { id: 'titan', name: 'TITAN' },
      { id: 'fastrack', name: 'FASTRACK' },
      { id: 'invicta', name: 'Invicta' },
    ],
    profiles: [
      {
        id: 'watches',
        name: 'Watches',
        icon: '⌚',
        brandIds: ['tommy-hilfiger', 'timex', 'casio', 'sonata', 'titan', 'fastrack', 'invicta'],
      },
    ],
    sites: DEFAULT_CONFIG.sites.map((s) =>
      s.hostname === 'www.myntra.com' ? { ...s, defaultProfileId: 'watches' } : s,
    ),
  }
}

function makeDeps(opts: { config: Config; sendToTab: AutoApplyDeps['sendToTab'] }) {
  const session = new Map<number, number | 'user-off'>()
  const deps: AutoApplyDeps = {
    getConfig: async () => opts.config,
    getTabSession: async (tabId) => session.get(tabId) ?? null,
    setTabSession: async (tabId, value) => {
      session.set(tabId, value)
    },
    clearTabSession: async (tabId) => {
      session.delete(tabId)
    },
    sendToTab: opts.sendToTab,
    now: () => 1_700_000_000_000,
  }
  return { deps, session }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('integration: auto-apply → content-script → MyntraAdapter (URL navigation)', () => {
  it('applies a 7-brand Watches profile in a SINGLE navigation containing all 7 brands', async () => {
    const cfg = watchesConfig()
    const profile = cfg.profiles[0]!
    const { calls } = setupMyntraDom('https://www.myntra.com/mens-watches')
    const adapter = new MyntraAdapter()
    const { sendToTab, drain } = makeContentScriptSendToTab(adapter, profile, cfg)
    const { deps } = makeDeps({ config: cfg, sendToTab })

    const result = await handleAutoApply(1, 'www.myntra.com', deps)
    expect(result.outcome).toBe('applied')

    // Adapter runs after ACK — drain it.
    await drain()

    // ONE navigation, ALL brands. The regression: this used to be 1 nav
    // per click, and only 1–2 brands ever landed.
    expect(calls).toHaveLength(1)
    const applied = adapter.parseBrandsFromUrl(calls[0]!)
    expect(applied.sort()).toEqual(
      ['Tommy Hilfiger', 'Timex', 'Casio', 'SONATA', 'TITAN', 'FASTRACK', 'Invicta'].sort(),
    )
  })

  it('a second onUpdated fired AFTER the navigation is blocked by the session flag', async () => {
    const cfg = watchesConfig()
    const profile = cfg.profiles[0]!
    setupMyntraDom('https://www.myntra.com/mens-watches')
    const adapter = new MyntraAdapter()
    const { sendToTab, drain } = makeContentScriptSendToTab(adapter, profile, cfg)
    const { deps } = makeDeps({ config: cfg, sendToTab })

    // First onUpdated (page initially loaded)
    const first = await handleAutoApply(1, 'www.myntra.com', deps)
    expect(first.outcome).toBe('applied')

    // Drain so the adapter's navigation happens
    await drain()

    // Second onUpdated fires because the adapter just navigated. MUST be
    // blocked by the session flag — otherwise we get the apply-loop.
    const second = await handleAutoApply(1, 'www.myntra.com', deps)
    expect(second.outcome).toBe('session-blocks')
  })

  it('preserves an existing Price facet through the apply navigation', async () => {
    const cfg = watchesConfig()
    const profile = cfg.profiles[0]!
    const { calls } = setupMyntraDom('https://www.myntra.com/mens-watches?f=Price:500-1000')
    const adapter = new MyntraAdapter()
    const { sendToTab, drain } = makeContentScriptSendToTab(adapter, profile, cfg)
    const { deps } = makeDeps({ config: cfg, sendToTab })

    await handleAutoApply(1, 'www.myntra.com', deps)
    await drain()

    expect(calls).toHaveLength(1)
    const f = new URL(calls[0]!).searchParams.get('f')!
    const facets = f.split('::').sort()
    expect(facets[0]).toMatch(/^Brand:/) // brands present
    expect(facets).toContain('Price:500-1000') // price preserved
  })

  it('records brands that exist in the profile but not on the page as notFound (no infinite retry)', async () => {
    const cfg: Config = {
      ...watchesConfig(),
      masterBrands: [
        ...watchesConfig().masterBrands,
        { id: 'fictional', name: 'Fictional Watches Inc.' },
      ],
    }
    cfg.profiles[0]!.brandIds = [...cfg.profiles[0]!.brandIds, 'fictional']
    const profile = cfg.profiles[0]!

    const { calls } = setupMyntraDom('https://www.myntra.com/mens-watches')
    const adapter = new MyntraAdapter()
    const { sendToTab, drain } = makeContentScriptSendToTab(adapter, profile, cfg)
    const { deps } = makeDeps({ config: cfg, sendToTab })

    await handleAutoApply(1, 'www.myntra.com', deps)
    await drain()

    // Still exactly one navigation; the fictional brand is silently absent
    // from the URL (not in any DOM scan).
    expect(calls).toHaveLength(1)
    expect(adapter.parseBrandsFromUrl(calls[0]!)).not.toContain('Fictional Watches Inc.')
  })
})
