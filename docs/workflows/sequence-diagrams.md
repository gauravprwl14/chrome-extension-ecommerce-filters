# BrandFilter — Sequence Diagrams

**Last updated:** 2026-05-17

All diagrams are Mermaid. They render natively on GitHub, VS Code, and
most Markdown viewers.

---

## 1. First-run install (fresh storage)

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant CWS as Chrome / Web Store
    participant SW as background.ts
    participant Boot as lib/seed.ts<br/>(bootstrapConfig)
    participant Store as chrome.storage.local

    U->>CWS: Install BrandFilter
    CWS->>SW: chrome.runtime.onInstalled<br/>(reason: 'install')
    SW->>Boot: bootstrapConfig(seedBrands, seedProfiles)
    Boot->>Store: get('brandfilter_config')
    Store-->>Boot: {} (empty)
    Note over Boot: isFreshInstall = true
    Boot->>Boot: masterBrands = 183 seeded<br/>profiles = [My Brands, Watches]<br/>sites.defaultProfileId = 'my-brands'
    Boot->>Store: set('brandfilter_config', config)
    Boot-->>SW: {wasFirstRun: true, changed: true}
    SW->>CWS: chrome.tabs.create({url: 'options.html'})
    CWS-->>U: Options page opens
```

---

## 2. SW wake on `chrome://extensions → Reload` (existing install)

The canonical bug this guards against: the user reloads the extension
during dev and ends up with `profiles: []`. Fixed by calling
`bootstrapConfig` at the top level of `background.ts`.

```mermaid
sequenceDiagram
    autonumber
    participant Dev as Developer
    participant Chrome as chrome://extensions
    participant SW as background.ts (NEW instance)
    participant Boot as lib/seed.ts
    participant Store as chrome.storage.local

    Dev->>Chrome: Click reload (↻)
    Chrome->>SW: Service worker restarts
    Note over SW: Module top-level code runs.<br/>NO onInstalled, NO onStartup fires.
    SW->>Boot: bootstrapConfig(...)
    Boot->>Store: get('brandfilter_config')
    Store-->>Boot: existing config with 183 brands
    Note over Boot: isFreshInstall = false
    Boot->>Boot: mergeSeedsIntoConfig:<br/>- strip DEPRECATED_BRAND_IDS<br/>- add any missing seed brands<br/>- push them to 'my-brands' profile<br/>- create missing curated profiles
    alt anything changed
        Boot->>Store: set('brandfilter_config', config)
    end
    Boot-->>SW: {wasFirstRun: false, changed?}
    Note over SW: No options page open — user is mid-flow
```

---

## 3. Auto-apply on Myntra navigation (the canonical flow)

```mermaid
sequenceDiagram
    autonumber
    participant T as Tab (Myntra page)
    participant SW as background.ts
    participant AA as handleAutoApply<br/>(lib/auto-apply.ts)
    participant CS as contents/myntra.ts
    participant MA as MyntraAdapter
    participant DOM as Myntra DOM
    participant Store as chrome.storage<br/>(local + session)

    Note over T: User navigates to /mens-watches
    T->>SW: chrome.tabs.onUpdated<br/>(status: 'loading', url)
    SW->>AA: handleAutoApply(tabId, 'www.myntra.com', deps)
    AA->>Store: getConfig()
    Store-->>AA: config
    AA->>AA: site = sites.find(hostname)<br/>site.enabled? site.defaultProfileId?
    AA->>Store: getTabSession(tabId)
    Store-->>AA: null (fresh)
    Note over AA: ⚠ RULE: stamp BEFORE sendMessage
    AA->>Store: setTabSession(tabId, Date.now())
    AA->>CS: chrome.tabs.sendMessage<br/>{action: 'applyProfile', profileId}
    CS->>SW: sendResponse({ok: true}) — SYNCHRONOUS
    Note over CS: ACK first. handleApply runs<br/>asynchronously and may navigate.
    CS->>MA: waitForFilterContainer() →<br/>expandBrandFilter() →<br/>applyBrands(brands)
    MA->>DOM: querySelectorAll('ul.brand-list input[type=checkbox]')
    DOM-->>MA: sidebar brand values
    alt some brands missing from sidebar
        MA->>DOM: click .brand-more (opens modal — no nav)
        DOM-->>MA: .FilterDirectory-list rendered
        MA->>DOM: querySelectorAll('.FilterDirectory-list input')
        DOM-->>MA: modal brand values
    end
    MA->>MA: parseBrandsFromUrl(currentHref)<br/>match profile brands to canonical names<br/>buildUrlWithBrands(href, all matched)
    MA->>T: window.location.assign(newUrl)
    Note over T,DOM: Page navigates. Content script destroyed.
    T->>SW: chrome.tabs.onUpdated<br/>(status: 'loading' AGAIN)
    SW->>AA: handleAutoApply(tabId, ...)
    AA->>Store: getTabSession(tabId)
    Store-->>AA: Date.now() (set above)
    AA-->>SW: outcome: 'session-blocks'
    Note over T: ✅ User lands on filtered page,<br/>NO flicker, NO loop
```

---

## 4. Manual Re-apply from popup

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant P as popup.tsx
    participant SW as background.ts
    participant AA as handleReapply<br/>(lib/auto-apply.ts)
    participant CS as contents/myntra.ts
    participant MA as MyntraAdapter
    participant Store as chrome.storage

    U->>P: Click ▶ Apply
    P->>SW: chrome.runtime.sendMessage<br/>{action: 'reapply', tabId, profileId}
    SW->>AA: handleReapply(tabId, profileId, deps)
    Note over AA: ⚠ Same rule as auto-apply
    AA->>Store: setTabSession(tabId, Date.now())
    AA->>CS: sendToTab({applyProfile, profileId})
    CS->>SW: sendResponse({ok: true}) — sync
    CS->>MA: handleApply (async)
    MA->>MA: scan + build URL + navigate
    AA-->>SW: {ok: true}
    SW-->>P: {ok: true}
    P->>P: setStatus('applied')<br/>setAppliedAt(Date.now())
```

If `sendToTab` rejects (e.g. content script crashed), the catch path
calls `clearTabSession` so the user can retry. The user-off sentinel
is honoured separately by `handleTurnOff` and NEVER auto-cleared.

---

## 5. Auto-apply on Ajio (modal-batched)

```mermaid
sequenceDiagram
    autonumber
    participant T as Tab (Ajio page)
    participant CS as contents/ajio.ts
    participant AA as AjioAdapter
    participant DOM as Ajio DOM

    Note over T: User navigates to /s/clothing-...<br/>(background already stamped session, sent message)
    CS->>AA: waitForFilterContainer() → expandBrandFilter()
    AA->>DOM: find brands header by aria-label="brands"
    AA->>DOM: aria-expanded? if false, click toggle
    AA->>DOM: wait for .facet-body to render
    CS->>AA: applyBrands(brands)
    AA->>DOM: findBrandsFacetHost() — scoped to BRANDS .cat-facets
    AA->>DOM: click .facet-more (scoped, opens .more-popup-container)
    DOM-->>AA: modal rendered
    AA->>AA: sanity check: modal contains input[name="brand"]?
    Note over AA: if NO → wrong facet's modal opened (Category etc.)<br/>dismiss + fall back to inline
    loop for each brand in profile
        AA->>DOM: find input[name="brand"][value matches brand]
        AA->>DOM: click input (no nav — modal batches selection)
        AA->>DOM: verify input.checked
    end
    AA->>DOM: click .rilrtl-button--apply
    Note over T,DOM: ONE navigation commits all selections.<br/>Content script destroyed.<br/>Session flag (set by handleAutoApply) blocks re-entry.
```

---

## 6. User clicks ✕ Off

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant P as popup.tsx
    participant SW as background.ts
    participant Off as handleTurnOff<br/>(lib/auto-apply.ts)
    participant CS as Content script
    participant A as Adapter
    participant Store as chrome.storage

    U->>P: Click ✕ Off
    P->>SW: chrome.runtime.sendMessage<br/>{action: 'turnOff', tabId}
    SW->>Off: handleTurnOff(tabId, deps)
    Note over Off: ⚠ user-off persists even on send failure
    Off->>Store: setTabSession(tabId, 'user-off')
    Off->>CS: sendToTab({action: 'clearFilters'})
    CS->>SW: sendResponse({ok: true}) — sync
    CS->>A: clearAppliedBrands()
    alt MyntraAdapter
        A->>A: buildUrlWithBrands(href, []) — strip Brand facet
        A->>CS: window.location.assign(newUrl)
    else AjioAdapter
        A->>A: untick tracked brands inline, or<br/>open modal + untick + Apply
    end
    Off-->>SW: {ok: true}
    SW-->>P: {ok: true}
    P->>P: setStatus('off')
```

Subsequent navigations on this tab see `session === 'user-off'` →
`handleAutoApply` returns `outcome: 'session-blocks'` → auto-apply
never re-fires until the tab/browser closes.

---

## 7. Popup self-heal bootstrap (race-window guard)

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant P as popup.tsx
    participant Init as initPopupState<br/>(lib/popup-init.ts)
    participant Boot as bootstrapConfig
    participant Store as chrome.storage

    U->>P: Open popup (just-installed or just-reloaded)
    P->>Init: initPopupState(deps)
    Init->>Init: queryActiveTab()
    Init->>Boot: bootstrapConfig (best-effort)
    Boot->>Store: get / set as needed
    alt bootstrap throws (e.g. quota)
        Boot-->>Init: throws
        Init->>Init: console.warn, continue
    end
    Init->>Store: getConfig()
    Store-->>Init: config
    Init->>Init: build PopupInitOk { tabId, config, currentSite, session }
    Init-->>P: { ok: true, ... }
    P->>P: setConfigState, setCurrentSite, setStatus
    Note over P: If ANYTHING above threw,<br/>Init returns {ok: false, error}.<br/>Popup shows visible error state,<br/>NEVER hangs on "Loading…".
```

---

## 8. Adding a brand via the popup search

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant P as popup.tsx
    participant BMS as BrandMultiSelect<br/>(components/)
    participant S as lib/storage.ts<br/>(ensureBrandInLibrary)
    participant Store as chrome.storage.local

    U->>P: Open popup, type "Snitch" in brand search
    BMS->>BMS: filter masterBrands by query<br/>(no match → show "+ Add Snitch")
    U->>BMS: Click "+ Add Snitch"
    BMS->>P: handleAddBrand("Snitch")
    P->>P: slugify("Snitch") → "snitch"<br/>(reject empty / dup id)
    P->>S: ensureBrandInLibrary({id:'snitch', name:'Snitch'})
    S->>Store: getConfig()
    Store-->>S: config
    S->>Store: setConfig(config with brand added)
    S-->>P: true (added)
    P->>P: tick "snitch" in current profile<br/>setConfigState(updated)
    P->>Store: setConfig(updated config)
```

---

## 9. Teach mode: teaching a new site

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant P as popup.tsx
    participant SW as background.ts
    participant CS as contents/teachable.ts
    participant DOM as Page DOM
    participant Store as chrome.storage.local

    Note over U: User on tatacliq.com (allowlisted, not yet taught)
    U->>P: Open popup → "Teach this site"
    P->>SW: sendMessage({action: 'startTeach', tabId})
    SW->>CS: chrome.tabs.sendMessage({action: 'startTeach'})
    CS->>DOM: inject crosshair overlay
    U->>DOM: Click a brand checkbox
    DOM->>CS: click event captured
    CS->>CS: walk up 5 ancestors, infer CSS selector
    CS->>DOM: render toast with selector (textContent, NEVER innerHTML)
    U->>CS: Confirm
    CS->>SW: sendMessage({action: 'saveCustomSite', hostname, customSelector, defaultProfileId})
    SW->>Store: setConfig with new Site entry
    Store-->>SW: persisted
    SW-->>CS: ok
    CS->>DOM: dismiss overlay
```

---

## 10. Deprecated brand removal (on next SW wake)

```mermaid
sequenceDiagram
    autonumber
    participant SW as background.ts (wake)
    participant Boot as bootstrapConfig
    participant Merge as mergeSeedsIntoConfig
    participant Store as chrome.storage.local

    SW->>Boot: bootstrapConfig(seedBrands, seedProfiles, ...)
    Boot->>Store: getConfig()
    Store-->>Boot: config with 'highlander' still present
    Boot->>Merge: mergeSeedsIntoConfig(config, seedBrands, seedProfiles,<br/>{deprecatedBrandIds: ['highlander','red-tape'], defaultProfileId: 'my-brands'})
    Merge->>Merge: strip 'highlander' from masterBrands
    Merge->>Merge: strip 'highlander' from every profile.brandIds
    Merge->>Merge: skip adding 'highlander' even if seedBrands still lists it
    Merge-->>Boot: changed: true
    Boot->>Store: setConfig(cleaned config)
    Note over Store: User reloads popup → 'HIGHLANDER' gone everywhere
```

Idempotency: a second pass with no new deprecations would return
`changed: false` and write nothing.

---

## Reading guide

Each diagram is meant to be sufficient on its own — read top-to-bottom,
follow the autonumbers, treat side comments (the `Note over X` blocks)
as the architectural rules being enforced.

If you find a divergence between any diagram and the actual code, the
**code is canonical** — open an issue and update this doc. Don't change
code to match an outdated diagram.
