# BrandFilter V0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Plasmo + React + TypeScript Chrome extension (MV3) that auto-applies saved brand filter preferences on Myntra and Ajio, with a popup for profile switching, an options page for full config management, and a teach mode for unsupported sites.

**Architecture:** Background service worker listens for tab navigation, detects supported sites, sends apply messages to injected content scripts. Content scripts use MutationObserver to wait for dynamic filter panels, then match brand checkboxes via a variant-based name matching algorithm. All config lives in `chrome.storage.sync` as a single JSON object. Loop prevention uses per-tab `chrome.storage.session` flags.

**Tech Stack:** Plasmo, React 18, TypeScript strict, Vitest + jsdom, ESLint, Prettier, Husky, lint-staged, pnpm

---

## File Map

```
chrome-extension/
├── popup.tsx                      # Popup entry
├── options.tsx                    # Options page entry
├── background.ts                  # Service worker — tab listeners, apply dispatch
├── contents/
│   ├── myntra.ts                  # Myntra content script + adapter logic
│   ├── ajio.ts                    # Ajio content script + adapter logic
│   └── teachable.ts               # Teach-mode overlay (matches <all_urls>)
├── lib/
│   ├── config.ts                  # All TS interfaces + DEFAULT_CONFIG
│   ├── storage.ts                 # chrome.storage.sync + session typed helpers
│   ├── matching.ts                # Brand name matching (string + regex variants)
│   └── adapters/
│       ├── base.ts                # SiteAdapter interface + ApplyResult type
│       ├── myntra.ts              # Myntra DOM selectors + adapter implementation
│       └── ajio.ts                # Ajio DOM selectors + adapter implementation
├── components/
│   ├── StatusBar.tsx
│   ├── ProfileDropdown.tsx
│   └── BrandMultiSelect.tsx
├── assets/
│   └── default-brands.json        # Seed: ~60 popular brands
└── tests/
    ├── setup.ts                   # Chrome API mocks for Vitest
    ├── matching.test.ts
    ├── storage.test.ts
    ├── myntra-adapter.test.ts
    └── ajio-adapter.test.ts
```

---

## Phase 1 — Foundation (Sequential)

Complete all Phase 1 tasks before starting Phase 2.

---

### Task 1: Scaffold Plasmo Project + Tooling

**Files:**

- Create: all Plasmo scaffold files
- Create: `vitest.config.ts`
- Create: `tests/setup.ts`
- Create: `.eslintrc.json`
- Create: `.prettierrc`
- Create: `.husky/pre-commit`

- [ ] **Step 1: Scaffold Plasmo in current directory**

```bash
cd /Users/gauravporwal/Sites/projects/rnd/chrome-extension
pnpm create plasmo@latest .
# When prompted: name = "BrandFilter", choose TypeScript
```

Expected: Plasmo scaffold created with `popup.tsx`, `background.ts`, `package.json`.

- [ ] **Step 2: Install dev dependencies**

```bash
pnpm add -D vitest @vitest/coverage-v8 jsdom @testing-library/react @testing-library/jest-dom eslint @typescript-eslint/eslint-plugin @typescript-eslint/parser prettier eslint-config-prettier husky lint-staged
```

- [ ] **Step 3: Enable TypeScript strict mode**

In `tsconfig.json`, ensure:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true
  }
}
```

- [ ] **Step 4: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    coverage: { provider: 'v8', reporter: ['text', 'html'] },
  },
})
```

- [ ] **Step 5: Create `tests/setup.ts`**

```typescript
import { vi } from 'vitest'

const mockStorage: Record<string, unknown> = {}
const mockSession: Record<string, unknown> = {}

global.chrome = {
  storage: {
    sync: {
      get: vi.fn(async (key: string) => ({ [key]: mockStorage[key] })),
      set: vi.fn(async (obj: Record<string, unknown>) => {
        Object.assign(mockStorage, obj)
      }),
    },
    session: {
      get: vi.fn(async (key: string) => ({ [key]: mockSession[key] })),
      set: vi.fn(async (obj: Record<string, unknown>) => {
        Object.assign(mockSession, obj)
      }),
      remove: vi.fn(async (key: string) => {
        delete mockSession[key]
      }),
    },
  },
  runtime: {
    onInstalled: { addListener: vi.fn() },
    onMessage: { addListener: vi.fn() },
    sendMessage: vi.fn(),
  },
  tabs: {
    onUpdated: { addListener: vi.fn() },
    sendMessage: vi.fn(),
  },
} as unknown as typeof chrome

// Reset mocks between tests
beforeEach(() => {
  Object.keys(mockStorage).forEach((k) => delete mockStorage[k])
  Object.keys(mockSession).forEach((k) => delete mockSession[k])
  vi.clearAllMocks()
})
```

- [ ] **Step 6: Create `.eslintrc.json`**

```json
{
  "root": true,
  "parser": "@typescript-eslint/parser",
  "plugins": ["@typescript-eslint"],
  "extends": ["eslint:recommended", "plugin:@typescript-eslint/recommended", "prettier"],
  "rules": {
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/explicit-function-return-type": "off"
  }
}
```

- [ ] **Step 7: Create `.prettierrc`**

```json
{
  "semi": false,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100
}
```

- [ ] **Step 8: Add scripts to `package.json`**

```json
{
  "scripts": {
    "dev": "plasmo dev",
    "build": "plasmo build",
    "package": "plasmo package",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "lint": "eslint . --ext .ts,.tsx && prettier --check ."
  }
}
```

- [ ] **Step 9: Set up Husky pre-commit hook**

```bash
pnpm exec husky init
```

Create `.husky/pre-commit`:

```bash
#!/bin/sh
pnpm typecheck && pnpm lint && pnpm test
```

- [ ] **Step 10: Add lint-staged config to `package.json`**

```json
{
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{json,md}": ["prettier --write"]
  }
}
```

- [ ] **Step 11: Init git and first commit**

```bash
git init
cat > .gitignore << 'EOF'
node_modules/
build/
.plasmo/
.superpowers/
coverage/
EOF
git add -A
git commit -m "chore: scaffold Plasmo project with tooling"
```

---

### Task 2: Core TypeScript Types

**Files:**

- Create: `lib/config.ts`

- [ ] **Step 1: Create `lib/config.ts`**

```typescript
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
  version: '1',
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

export type ExtensionMessage = ApplyMessage | ClearMessage | ReapplyMessage
```

- [ ] **Step 2: Verify types compile**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/config.ts
git commit -m "feat: add core TypeScript interfaces and DEFAULT_CONFIG"
```

---

### Task 3: Storage Helpers

**Files:**

- Create: `lib/storage.ts`
- Create: `tests/storage.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/storage.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import {
  getConfig,
  setConfig,
  ensureBrandInLibrary,
  getTabSessionState,
  setTabSessionState,
  clearTabSessionState,
} from '../lib/storage'
import { DEFAULT_CONFIG } from '../lib/config'

describe('getConfig', () => {
  it('returns DEFAULT_CONFIG when storage is empty', async () => {
    vi.mocked(chrome.storage.sync.get).mockResolvedValueOnce({})
    const config = await getConfig()
    expect(config.version).toBe('1')
    expect(config.masterBrands).toEqual([])
  })

  it('returns stored config when present', async () => {
    const stored = { ...DEFAULT_CONFIG, version: '2' }
    vi.mocked(chrome.storage.sync.get).mockResolvedValueOnce({
      brandfilter_config: stored,
    })
    const config = await getConfig()
    expect(config.version).toBe('2')
  })
})

describe('setConfig', () => {
  it('writes config under the correct key', async () => {
    const config = { ...DEFAULT_CONFIG }
    await setConfig(config)
    expect(chrome.storage.sync.set).toHaveBeenCalledWith({
      brandfilter_config: config,
    })
  })
})

describe('ensureBrandInLibrary', () => {
  it('adds brand when not present and returns true', async () => {
    vi.mocked(chrome.storage.sync.get).mockResolvedValueOnce({
      brandfilter_config: { ...DEFAULT_CONFIG },
    })
    const added = await ensureBrandInLibrary({ id: 'nike', name: 'Nike' })
    expect(added).toBe(true)
    expect(chrome.storage.sync.set).toHaveBeenCalled()
  })

  it('skips brand already in library and returns false', async () => {
    vi.mocked(chrome.storage.sync.get).mockResolvedValueOnce({
      brandfilter_config: {
        ...DEFAULT_CONFIG,
        masterBrands: [{ id: 'nike', name: 'Nike' }],
      },
    })
    const added = await ensureBrandInLibrary({ id: 'nike', name: 'Nike' })
    expect(added).toBe(false)
    expect(chrome.storage.sync.set).not.toHaveBeenCalled()
  })
})

describe('session state helpers', () => {
  it('sets and gets tab session state', async () => {
    vi.mocked(chrome.storage.session.get).mockResolvedValueOnce({
      applied_42: true,
    })
    const state = await getTabSessionState(42)
    expect(state).toBe(true)
  })

  it('returns null when no state set', async () => {
    vi.mocked(chrome.storage.session.get).mockResolvedValueOnce({})
    const state = await getTabSessionState(99)
    expect(state).toBeNull()
  })

  it('clears tab session state', async () => {
    await clearTabSessionState(42)
    expect(chrome.storage.session.remove).toHaveBeenCalledWith('applied_42')
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
pnpm test tests/storage.test.ts
```

Expected: fail with "Cannot find module '../lib/storage'".

- [ ] **Step 3: Create `lib/storage.ts`**

```typescript
import type { Config, Brand } from './config'
import { DEFAULT_CONFIG } from './config'

const STORAGE_KEY = 'brandfilter_config'

/** Read full config from chrome.storage.sync. Returns DEFAULT_CONFIG clone if not set. */
export async function getConfig(): Promise<Config> {
  const result = await chrome.storage.sync.get(STORAGE_KEY)
  return (result[STORAGE_KEY] as Config) ?? structuredClone(DEFAULT_CONFIG)
}

/** Write full config to chrome.storage.sync. */
export async function setConfig(config: Config): Promise<void> {
  await chrome.storage.sync.set({ [STORAGE_KEY]: config })
}

/** Update a single top-level field without overwriting others. */
export async function updateConfig<K extends keyof Config>(
  key: K,
  value: Config[K],
): Promise<void> {
  const config = await getConfig()
  config[key] = value
  await setConfig(config)
}

/**
 * Add brand to masterBrands if not already present.
 * Returns true if added, false if it already existed.
 */
export async function ensureBrandInLibrary(brand: Brand): Promise<boolean> {
  const config = await getConfig()
  if (config.masterBrands.some((b) => b.id === brand.id)) return false
  config.masterBrands.push(brand)
  await setConfig(config)
  return true
}

type SessionValue = true | 'user-off'

/** Get per-tab auto-apply session state. Returns null if not set (fresh page load). */
export async function getTabSessionState(tabId: number): Promise<SessionValue | null> {
  const key = `applied_${tabId}`
  const result = await chrome.storage.session.get(key)
  return (result[key] as SessionValue) ?? null
}

/** Set per-tab session state. true = applied, 'user-off' = user explicitly disabled. */
export async function setTabSessionState(tabId: number, value: SessionValue): Promise<void> {
  await chrome.storage.session.set({ [`applied_${tabId}`]: value })
}

/** Clear per-tab state so auto-apply can fire again on next navigation. */
export async function clearTabSessionState(tabId: number): Promise<void> {
  await chrome.storage.session.remove(`applied_${tabId}`)
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm test tests/storage.test.ts
```

Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/storage.ts tests/storage.test.ts
git commit -m "feat: add storage helpers with session state support"
```

---

### Task 4: Brand Matching Algorithm

**Files:**

- Create: `lib/matching.ts`
- Create: `tests/matching.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/matching.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { normalizeLabel, matchesBrand, findMatchIndex } from '../lib/matching'
import type { Brand } from '../lib/config'

describe('normalizeLabel', () => {
  it('lowercases and trims', () => {
    expect(normalizeLabel('  Tommy Hilfiger  ')).toBe('tommy hilfiger')
  })
  it('collapses multiple spaces', () => {
    expect(normalizeLabel('H &  M')).toBe('h & m')
  })
})

describe('matchesBrand — exact name', () => {
  const brand: Brand = { id: 'titan', name: 'Titan' }
  it('matches exact name case-insensitively', () => {
    expect(matchesBrand(brand, 'TITAN')).toBe(true)
    expect(matchesBrand(brand, 'titan')).toBe(true)
  })
  it('does not match unrelated label', () => {
    expect(matchesBrand(brand, 'Timex')).toBe(false)
  })
})

describe('matchesBrand — string variants', () => {
  const brand: Brand = {
    id: 'hm',
    name: 'H&M',
    variants: [
      { type: 'string', value: 'H & M' },
      { type: 'string', value: 'H and M' },
    ],
  }
  it('matches string variant via contains (case-insensitive)', () => {
    expect(matchesBrand(brand, 'H & M')).toBe(true)
    expect(matchesBrand(brand, 'h and m')).toBe(true)
  })
  it('does not match when neither name nor variant matches', () => {
    expect(matchesBrand(brand, 'Zara')).toBe(false)
  })
})

describe('matchesBrand — regex variants', () => {
  const brand: Brand = {
    id: 'hm',
    name: 'H&M',
    variants: [{ type: 'regex', value: 'H\\s*&\\s*M' }],
  }
  it('matches via regex', () => {
    expect(matchesBrand(brand, 'H&M')).toBe(true)
    expect(matchesBrand(brand, 'H & M')).toBe(true)
    expect(matchesBrand(brand, 'H  &  M')).toBe(true)
  })
  it('does not match non-matching label', () => {
    expect(matchesBrand(brand, 'HnM')).toBe(false)
  })
})

describe('matchesBrand — invalid regex', () => {
  const brand: Brand = {
    id: 'bad',
    name: 'Bad',
    variants: [{ type: 'regex', value: '[invalid' }],
  }
  it('skips invalid regex without throwing', () => {
    expect(() => matchesBrand(brand, 'Bad')).not.toThrow()
    expect(matchesBrand(brand, 'Bad')).toBe(true) // still matches by name
  })
})

describe('findMatchIndex', () => {
  const brand: Brand = { id: 'casio', name: 'Casio' }
  it('returns index of matching label', () => {
    expect(findMatchIndex(brand, ['Titan', 'Casio', 'Fossil'])).toBe(1)
  })
  it('returns -1 when no match', () => {
    expect(findMatchIndex(brand, ['Titan', 'Fossil'])).toBe(-1)
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
pnpm test tests/matching.test.ts
```

Expected: fail with "Cannot find module '../lib/matching'".

- [ ] **Step 3: Create `lib/matching.ts`**

```typescript
import type { Brand } from './config'

/** Normalize for comparison: lowercase, collapsed whitespace, trimmed. */
export function normalizeLabel(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * Returns true if labelText matches this brand via name → string variants → regex variants.
 * Match order ensures exact name takes priority over partial string/regex matches.
 */
export function matchesBrand(brand: Brand, labelText: string): boolean {
  const normalized = normalizeLabel(labelText)

  // 1. Exact name match (case-insensitive)
  if (normalized === normalizeLabel(brand.name)) return true

  if (!brand.variants?.length) return false

  for (const variant of brand.variants) {
    if (variant.type === 'string') {
      if (normalized.includes(normalizeLabel(variant.value))) return true
    } else if (variant.type === 'regex') {
      try {
        if (new RegExp(variant.value, 'i').test(labelText)) return true
      } catch {
        // Skip silently — invalid regex in user config should not crash
      }
    }
  }

  return false
}

/**
 * Find the index of the first label in the list that matches the brand.
 * Returns -1 if no match found.
 */
export function findMatchIndex(brand: Brand, labels: string[]): number {
  return labels.findIndex((label) => matchesBrand(brand, label))
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm test tests/matching.test.ts
```

Expected: all 10 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/matching.ts tests/matching.test.ts
git commit -m "feat: add brand matching algorithm with string and regex variant support"
```

---

### Task 5: Base Adapter Interface

**Files:**

- Create: `lib/adapters/base.ts`

- [ ] **Step 1: Create `lib/adapters/base.ts`**

```typescript
import type { Brand } from '../config'

/** Result returned by applyBrands(). */
export interface ApplyResult {
  /** Brand ids whose checkboxes were successfully checked. */
  applied: string[]
  /** Brand ids whose checkboxes were already checked — skipped to avoid toggling off. */
  skipped: string[]
  /** Brand ids with no matching checkbox found on this page. */
  notFound: string[]
}

/**
 * Interface all site adapters must implement.
 * Each adapter is responsible for one hostname.
 */
export interface SiteAdapter {
  readonly hostname: string

  /** Returns true only on category/listing pages where brand filters exist. */
  isFilterPage(): boolean

  /**
   * Expands any collapsed filter accordions that contain brand checkboxes.
   * No-op for adapters where brand filters are always visible (e.g. Myntra).
   */
  expandBrandFilter(): Promise<void>

  /**
   * Resolves when the brand filter container is present in the DOM.
   * Rejects with Error('timeout') after timeoutMs (default 8000ms).
   */
  waitForFilterContainer(timeoutMs?: number): Promise<void>

  /**
   * Applies the given brands by checking their filter checkboxes.
   * - Already-checked checkboxes are recorded in skipped (not toggled off).
   * - Checkboxes that were checked are marked with data-brandfilter="applied".
   * - Brands with no matching checkbox are recorded in notFound.
   */
  applyBrands(brands: Brand[]): Promise<ApplyResult>

  /**
   * Unchecks all checkboxes that have data-brandfilter="applied".
   * Called when user clicks "Off" in the popup.
   */
  clearAppliedBrands(): Promise<void>
}

/**
 * Waits for a DOM element matching selector to appear.
 * Returns the element, or rejects after timeoutMs.
 */
export function waitForElement(selector: string, timeoutMs = 8000): Promise<Element> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(selector)
    if (existing) {
      resolve(existing)
      return
    }

    const timer = setTimeout(() => {
      observer.disconnect()
      reject(new Error(`timeout waiting for "${selector}"`))
    }, timeoutMs)

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector)
      if (el) {
        clearTimeout(timer)
        observer.disconnect()
        resolve(el)
      }
    })

    observer.observe(document.body, { childList: true, subtree: true })
  })
}

/** Sleep for ms milliseconds. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/adapters/base.ts
git commit -m "feat: add SiteAdapter interface and DOM utility helpers"
```

---

### Task 6: Default Brands Seed

**Files:**

- Create: `assets/default-brands.json`

- [ ] **Step 1: Create `assets/default-brands.json`**

```json
[
  { "id": "tommy-hilfiger", "name": "Tommy Hilfiger" },
  { "id": "hm", "name": "H&M", "variants": [{ "type": "string", "value": "H & M" }] },
  { "id": "levis", "name": "Levi's", "variants": [{ "type": "string", "value": "Levis" }] },
  { "id": "zara", "name": "Zara" },
  { "id": "nike", "name": "Nike" },
  { "id": "adidas", "name": "Adidas" },
  { "id": "puma", "name": "Puma" },
  { "id": "reebok", "name": "Reebok" },
  {
    "id": "us-polo",
    "name": "U.S. Polo Assn.",
    "variants": [{ "type": "string", "value": "US Polo" }]
  },
  { "id": "arrow", "name": "Arrow" },
  { "id": "peter-england", "name": "Peter England" },
  { "id": "van-heusen", "name": "Van Heusen" },
  { "id": "allen-solly", "name": "Allen Solly" },
  { "id": "louis-philippe", "name": "Louis Philippe" },
  { "id": "wrangler", "name": "Wrangler" },
  { "id": "gap", "name": "GAP" },
  { "id": "mango", "name": "Mango" },
  { "id": "biba", "name": "Biba" },
  { "id": "w", "name": "W" },
  { "id": "aurelia", "name": "Aurelia" },
  { "id": "global-desi", "name": "Global Desi" },
  { "id": "only", "name": "ONLY" },
  { "id": "vero-moda", "name": "Vero Moda" },
  { "id": "forever-21", "name": "Forever 21" },
  {
    "id": "jack-jones",
    "name": "Jack & Jones",
    "variants": [{ "type": "string", "value": "Jack and Jones" }]
  },
  { "id": "selected-homme", "name": "Selected Homme" },
  { "id": "calvin-klein", "name": "Calvin Klein" },
  { "id": "armani-exchange", "name": "Armani Exchange" },
  { "id": "guess", "name": "Guess" },
  { "id": "casio", "name": "Casio" },
  { "id": "fossil", "name": "Fossil" },
  { "id": "titan", "name": "Titan" },
  { "id": "fastrack", "name": "Fastrack" },
  { "id": "timex", "name": "Timex" },
  { "id": "seiko", "name": "Seiko" },
  { "id": "citizen", "name": "Citizen" },
  { "id": "michael-kors", "name": "Michael Kors" },
  { "id": "daniel-wellington", "name": "Daniel Wellington" },
  { "id": "police", "name": "Police" },
  { "id": "tissot", "name": "Tissot" },
  { "id": "tag-heuer", "name": "TAG Heuer" },
  { "id": "sonata", "name": "Sonata" },
  { "id": "maxima", "name": "Maxima" },
  { "id": "aldo", "name": "Aldo" },
  { "id": "clarks", "name": "Clarks" },
  { "id": "woodland", "name": "Woodland" },
  { "id": "red-tape", "name": "Red Tape" },
  { "id": "bata", "name": "Bata" },
  { "id": "metro", "name": "Metro" },
  { "id": "liberty", "name": "Liberty" },
  { "id": "crocs", "name": "Crocs" },
  { "id": "skechers", "name": "Skechers" },
  { "id": "new-balance", "name": "New Balance" },
  { "id": "converse", "name": "Converse" },
  { "id": "vans", "name": "Vans" },
  { "id": "under-armour", "name": "Under Armour" },
  {
    "id": "hrx",
    "name": "HRX by Hrithik Roshan",
    "variants": [{ "type": "string", "value": "HRX" }]
  },
  { "id": "being-human", "name": "Being Human" },
  { "id": "highlander", "name": "Highlander" },
  { "id": "roadster", "name": "Roadster" }
]
```

- [ ] **Step 2: Commit**

```bash
git add assets/default-brands.json
git commit -m "feat: add default brand seed library with 60 popular Indian fashion/watch brands"
```

---

## Phase 2 — Parallel Workstreams

After Task 6 is committed on `main`, create four git worktrees:

```bash
git worktree add ../brandfilter-adapters -b feat/adapters
git worktree add ../brandfilter-background -b feat/background
git worktree add ../brandfilter-popup -b feat/popup
git worktree add ../brandfilter-options -b feat/options
git worktree add ../brandfilter-teach -b feat/teach
```

Each worktree agent works in its own directory. Merge back to `main` in order: adapters → background → popup → options → teach.

---

### Worktree A — Adapters (`../brandfilter-adapters`)

#### Task 7: Myntra Adapter

**Files:**

- Create: `lib/adapters/myntra.ts`
- Create: `tests/myntra-adapter.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/myntra-adapter.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { MyntraAdapter } from '../lib/adapters/myntra'

describe('MyntraAdapter.isFilterPage', () => {
  const adapter = new MyntraAdapter()

  it('returns true for category pages', () => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/mens-watches', hostname: 'www.myntra.com' },
      writable: true,
    })
    expect(adapter.isFilterPage()).toBe(true)
  })

  it('returns false for product pages containing /buy', () => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/some-brand/product-name/buy' },
      writable: true,
    })
    expect(adapter.isFilterPage()).toBe(false)
  })

  it('returns false for cart page', () => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/checkout/cart' },
      writable: true,
    })
    expect(adapter.isFilterPage()).toBe(false)
  })
})

describe('MyntraAdapter.applyBrands', () => {
  let adapter: MyntraAdapter

  beforeEach(() => {
    adapter = new MyntraAdapter()
    document.body.innerHTML = `
      <div class="${MyntraAdapter.FILTER_CONTAINER_SELECTOR.replace('.', '')}">
        <label data-testid="brand-filter">
          <input type="checkbox" /> <span>Titan</span>
        </label>
        <label data-testid="brand-filter">
          <input type="checkbox" checked /> <span>Casio</span>
        </label>
        <label data-testid="brand-filter">
          <input type="checkbox" /> <span>Fossil</span>
        </label>
      </div>
    `
  })

  it('checks unchecked matching brand', async () => {
    const result = await adapter.applyBrands([{ id: 'titan', name: 'Titan' }])
    expect(result.applied).toContain('titan')
    expect(result.skipped).toHaveLength(0)
    const checkbox = document.querySelector<HTMLInputElement>(`label:nth-child(1) input`)
    expect(checkbox?.checked).toBe(true)
  })

  it('skips already-checked brand', async () => {
    const result = await adapter.applyBrands([{ id: 'casio', name: 'Casio' }])
    expect(result.skipped).toContain('casio')
    expect(result.applied).toHaveLength(0)
  })

  it('records not-found brands', async () => {
    const result = await adapter.applyBrands([{ id: 'nike', name: 'Nike' }])
    expect(result.notFound).toContain('nike')
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
pnpm test tests/myntra-adapter.test.ts
```

Expected: fail with "Cannot find module '../lib/adapters/myntra'".

- [ ] **Step 3: Create `lib/adapters/myntra.ts`**

```typescript
import type { Brand } from '../config'
import type { SiteAdapter, ApplyResult } from './base'
import { waitForElement, sleep } from './base'
import { matchesBrand } from '../matching'

export class MyntraAdapter implements SiteAdapter {
  readonly hostname = 'www.myntra.com'

  /**
   * CSS selector for the brand filter container.
   * TODO: Confirm by inspecting DevTools on https://www.myntra.com/mens-watches
   * Look for the element wrapping all brand filter checkboxes/labels.
   */
  static readonly FILTER_CONTAINER_SELECTOR = '.filter-main-wrapper'

  /**
   * CSS selector for individual brand filter label elements inside the container.
   * TODO: Confirm via DevTools — each label should contain an <input type="checkbox">
   * and a text node with the brand name.
   */
  static readonly BRAND_LABEL_SELECTOR = '.filter-name'

  private readonly NON_LISTING_PREFIXES = [
    '/login',
    '/cart',
    '/checkout',
    '/wishlist',
    '/profile',
    '/gateway',
    '/my-account',
    '/offers',
  ]

  /** Listing pages: not a product page (/buy), not a known non-listing prefix. */
  isFilterPage(): boolean {
    const path = window.location.pathname
    if (path.includes('/buy')) return false
    if (this.NON_LISTING_PREFIXES.some((p) => path.startsWith(p))) return false
    return path.split('/').filter(Boolean).length >= 1
  }

  /** Myntra brand filters are always visible in the sidebar — no expansion needed. */
  async expandBrandFilter(): Promise<void> {
    // no-op
  }

  async waitForFilterContainer(timeoutMs = 8000): Promise<void> {
    await waitForElement(MyntraAdapter.FILTER_CONTAINER_SELECTOR, timeoutMs)
    // Extra debounce for lazy-rendered filter values
    await sleep(300)
  }

  async applyBrands(brands: Brand[]): Promise<ApplyResult> {
    const result: ApplyResult = { applied: [], skipped: [], notFound: [] }

    const container = document.querySelector(MyntraAdapter.FILTER_CONTAINER_SELECTOR)
    if (!container) {
      brands.forEach((b) => result.notFound.push(b.id))
      return result
    }

    const labels = Array.from(
      container.querySelectorAll<HTMLElement>(MyntraAdapter.BRAND_LABEL_SELECTOR),
    )
    const labelTexts = labels.map((el) => el.textContent?.trim() ?? '')

    for (const brand of brands) {
      const idx = labelTexts.findIndex((text) => matchesBrand(brand, text))
      if (idx === -1) {
        result.notFound.push(brand.id)
        continue
      }

      const label = labels[idx]
      const checkbox = label
        ?.closest('label')
        ?.querySelector<HTMLInputElement>('input[type="checkbox"]')

      if (!checkbox) {
        result.notFound.push(brand.id)
        continue
      }

      if (checkbox.checked) {
        result.skipped.push(brand.id)
        continue
      }

      checkbox.click()
      checkbox.setAttribute('data-brandfilter', 'applied')
      result.applied.push(brand.id)
    }

    return result
  }

  async clearAppliedBrands(): Promise<void> {
    const applied = document.querySelectorAll<HTMLInputElement>(`[data-brandfilter="applied"]`)
    applied.forEach((checkbox) => {
      if (checkbox.checked) checkbox.click()
      checkbox.removeAttribute('data-brandfilter')
    })
  }
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm test tests/myntra-adapter.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/adapters/myntra.ts tests/myntra-adapter.test.ts
git commit -m "feat: add Myntra site adapter with isFilterPage and applyBrands"
```

---

#### Task 8: Ajio Adapter

**Files:**

- Create: `lib/adapters/ajio.ts`
- Create: `tests/ajio-adapter.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/ajio-adapter.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AjioAdapter } from '../lib/adapters/ajio'

describe('AjioAdapter.isFilterPage', () => {
  const adapter = new AjioAdapter()

  it('returns true for /s/ paths', () => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/s/men-watches-3991-40341' },
      writable: true,
    })
    expect(adapter.isFilterPage()).toBe(true)
  })

  it('returns false for non /s/ paths', () => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/product/detail' },
      writable: true,
    })
    expect(adapter.isFilterPage()).toBe(false)
  })
})

describe('AjioAdapter.expandBrandFilter', () => {
  it('clicks the Brands accordion expand button if collapsed', async () => {
    document.body.innerHTML = `
      <div class="${AjioAdapter.FACET_CONTAINER_SELECTOR.replace('.', '')}">
        <div class="${AjioAdapter.BRAND_FACET_TITLE_SELECTOR.replace('.', '')}">
          Brands <button class="${AjioAdapter.EXPAND_BTN_SELECTOR.replace('.', '')}">+</button>
        </div>
        <div class="${AjioAdapter.BRAND_CHECKBOX_CONTAINER_SELECTOR.replace('.', '')}" style="display:none">
        </div>
      </div>
    `
    const adapter = new AjioAdapter()
    const btn = document.querySelector<HTMLElement>(AjioAdapter.EXPAND_BTN_SELECTOR)
    const clickSpy = vi.spyOn(btn!, 'click')
    await adapter.expandBrandFilter()
    expect(clickSpy).toHaveBeenCalled()
  })
})

describe('AjioAdapter.applyBrands', () => {
  let adapter: AjioAdapter

  beforeEach(() => {
    adapter = new AjioAdapter()
    document.body.innerHTML = `
      <div class="${AjioAdapter.BRAND_CHECKBOX_CONTAINER_SELECTOR.replace('.', '')}">
        <label><input type="checkbox" /><span>Casio</span></label>
        <label><input type="checkbox" checked /><span>Fossil</span></label>
        <label><input type="checkbox" /><span>Titan</span></label>
      </div>
    `
  })

  it('checks unchecked brand', async () => {
    const result = await adapter.applyBrands([{ id: 'casio', name: 'Casio' }])
    expect(result.applied).toContain('casio')
  })

  it('skips already-checked brand', async () => {
    const result = await adapter.applyBrands([{ id: 'fossil', name: 'Fossil' }])
    expect(result.skipped).toContain('fossil')
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
pnpm test tests/ajio-adapter.test.ts
```

- [ ] **Step 3: Create `lib/adapters/ajio.ts`**

```typescript
import type { Brand } from '../config'
import type { SiteAdapter, ApplyResult } from './base'
import { waitForElement, sleep } from './base'
import { matchesBrand } from '../matching'

export class AjioAdapter implements SiteAdapter {
  readonly hostname = 'www.ajio.com'

  /**
   * TODO: Confirm all selectors via DevTools on https://www.ajio.com/s/watches-168315
   * Open DevTools → Elements → inspect the left "Refine By" panel.
   */
  static readonly FACET_CONTAINER_SELECTOR = '.plp-facets'
  static readonly BRAND_FACET_TITLE_SELECTOR = '.facet-title'
  static readonly EXPAND_BTN_SELECTOR = '.facet-expand-btn'
  static readonly BRAND_CHECKBOX_CONTAINER_SELECTOR = '.brand-facet-values'
  static readonly BRAND_LABEL_SELECTOR = '.facet-label'

  isFilterPage(): boolean {
    return window.location.pathname.startsWith('/s/')
  }

  /**
   * Ajio's "Brands" section is collapsed behind a "+" button.
   * Click the expand button and wait 300ms for checkboxes to render.
   */
  async expandBrandFilter(): Promise<void> {
    const expandBtn = document.querySelector<HTMLElement>(AjioAdapter.EXPAND_BTN_SELECTOR)
    if (expandBtn) {
      expandBtn.click()
      await sleep(300)
    }
  }

  async waitForFilterContainer(timeoutMs = 8000): Promise<void> {
    await waitForElement(AjioAdapter.FACET_CONTAINER_SELECTOR, timeoutMs)
    await sleep(300)
  }

  async applyBrands(brands: Brand[]): Promise<ApplyResult> {
    const result: ApplyResult = { applied: [], skipped: [], notFound: [] }

    const container = document.querySelector(AjioAdapter.BRAND_CHECKBOX_CONTAINER_SELECTOR)
    if (!container) {
      brands.forEach((b) => result.notFound.push(b.id))
      return result
    }

    const labels = Array.from(
      container.querySelectorAll<HTMLElement>(AjioAdapter.BRAND_LABEL_SELECTOR),
    )
    const labelTexts = labels.map((el) => el.textContent?.trim() ?? '')

    for (const brand of brands) {
      const idx = labelTexts.findIndex((text) => matchesBrand(brand, text))
      if (idx === -1) {
        result.notFound.push(brand.id)
        continue
      }

      const label = labels[idx]
      const checkbox = label
        ?.closest('label')
        ?.querySelector<HTMLInputElement>('input[type="checkbox"]')
      if (!checkbox) {
        result.notFound.push(brand.id)
        continue
      }
      if (checkbox.checked) {
        result.skipped.push(brand.id)
        continue
      }

      checkbox.click()
      checkbox.setAttribute('data-brandfilter', 'applied')
      result.applied.push(brand.id)
    }

    return result
  }

  async clearAppliedBrands(): Promise<void> {
    document.querySelectorAll<HTMLInputElement>('[data-brandfilter="applied"]').forEach((cb) => {
      if (cb.checked) cb.click()
      cb.removeAttribute('data-brandfilter')
    })
  }
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm test tests/ajio-adapter.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/adapters/ajio.ts tests/ajio-adapter.test.ts
git commit -m "feat: add Ajio site adapter with accordion expansion and applyBrands"
```

---

#### Task 9: Myntra Content Script

**Files:**

- Create: `contents/myntra.ts`

- [ ] **Step 1: Create `contents/myntra.ts`**

```typescript
import type { PlasmoCSConfig } from 'plasmo'
import type { ExtensionMessage, ApplyMessage, ClearMessage } from '../lib/config'
import { getConfig } from '../lib/storage'
import { MyntraAdapter } from '../lib/adapters/myntra'

export const config: PlasmoCSConfig = {
  matches: ['https://www.myntra.com/*'],
  run_at: 'document_idle',
}

const adapter = new MyntraAdapter()

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.action === 'applyProfile') {
    handleApply(message).then(sendResponse)
    return true // keep channel open for async response
  }
  if (message.action === 'clearFilters') {
    adapter.clearAppliedBrands().then(() => sendResponse({ ok: true }))
    return true
  }
})

async function handleApply(message: ApplyMessage): Promise<{ ok: boolean }> {
  if (!adapter.isFilterPage()) return { ok: false }

  try {
    await adapter.waitForFilterContainer()
    await adapter.expandBrandFilter()

    const config = await getConfig()
    const profile = config.profiles.find((p) => p.id === message.profileId)
    if (!profile) return { ok: false }

    const brands = config.masterBrands.filter((b) => profile.brandIds.includes(b.id))
    await adapter.applyBrands(brands)
    return { ok: true }
  } catch {
    // timeout or DOM error — fail silently
    return { ok: false }
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
git add contents/myntra.ts
git commit -m "feat: add Myntra content script with apply and clear message handlers"
```

---

#### Task 10: Ajio Content Script

**Files:**

- Create: `contents/ajio.ts`

- [ ] **Step 1: Create `contents/ajio.ts`**

```typescript
import type { PlasmoCSConfig } from 'plasmo'
import type { ExtensionMessage, ApplyMessage } from '../lib/config'
import { getConfig } from '../lib/storage'
import { AjioAdapter } from '../lib/adapters/ajio'

export const config: PlasmoCSConfig = {
  matches: ['https://www.ajio.com/*'],
  run_at: 'document_idle',
}

const adapter = new AjioAdapter()

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.action === 'applyProfile') {
    handleApply(message).then(sendResponse)
    return true
  }
  if (message.action === 'clearFilters') {
    adapter.clearAppliedBrands().then(() => sendResponse({ ok: true }))
    return true
  }
})

async function handleApply(message: ApplyMessage): Promise<{ ok: boolean }> {
  if (!adapter.isFilterPage()) return { ok: false }

  try {
    await adapter.waitForFilterContainer()
    await adapter.expandBrandFilter() // expands Brands accordion + waits 300ms
    const cfg = await getConfig()
    const profile = cfg.profiles.find((p) => p.id === message.profileId)
    if (!profile) return { ok: false }

    const brands = cfg.masterBrands.filter((b) => profile.brandIds.includes(b.id))
    await adapter.applyBrands(brands)
    return { ok: true }
  } catch {
    return { ok: false }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add contents/ajio.ts
git commit -m "feat: add Ajio content script with accordion expansion and apply handler"
```

---

### Worktree B — Background (`../brandfilter-background`)

#### Task 11: Background Service Worker

**Files:**

- Create: `background.ts`

- [ ] **Step 1: Create `background.ts`**

```typescript
import type { ExtensionMessage } from './lib/config'
import {
  getConfig,
  setConfig,
  getTabSessionState,
  setTabSessionState,
  clearTabSessionState,
} from './lib/storage'
import defaultBrands from './assets/default-brands.json'
import type { Brand } from './lib/config'

// ── First-run onboarding ─────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason !== 'install') return

  const config = await getConfig()
  // Seed master brands from bundled default-brands.json (one-time only)
  if (config.masterBrands.length === 0) {
    config.masterBrands = defaultBrands as Brand[]
    await setConfig(config)
  }

  // Open options page so user can create their first profile
  chrome.tabs.create({ url: chrome.runtime.getURL('options.html') })
})

// ── Auto-apply on tab navigation ─────────────────────────────────────────────

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Only fire once per page load, when the page starts loading
  if (changeInfo.status !== 'loading') return
  if (!tab.url) return

  let hostname: string
  try {
    hostname = new URL(tab.url).hostname
  } catch {
    return
  }

  const config = await getConfig()
  const site = config.sites.find((s) => s.hostname === hostname)
  if (!site || !site.enabled || !site.defaultProfileId) return

  // Check session flag — stop if already applied or user turned off
  const sessionState = await getTabSessionState(tabId)
  if (sessionState !== null) return

  try {
    await chrome.tabs.sendMessage(tabId, {
      action: 'applyProfile',
      profileId: site.defaultProfileId,
    } satisfies ExtensionMessage)

    await setTabSessionState(tabId, true)
  } catch {
    // Content script not ready yet (e.g. extension just installed) — ignore
  }
})

// ── Popup-triggered reapply ───────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.action === 'reapply') {
    handleReapply(message.tabId, message.profileId).then(sendResponse)
    return true
  }
})

async function handleReapply(tabId: number, profileId: string): Promise<{ ok: boolean }> {
  // Clear session flag so content script can run again
  await clearTabSessionState(tabId)

  try {
    await chrome.tabs.sendMessage(tabId, {
      action: 'applyProfile',
      profileId,
    } satisfies ExtensionMessage)
    await setTabSessionState(tabId, true)
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

// ── Popup "Off" handler ───────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (message: { action: 'turnOff'; tabId: number }, _sender, sendResponse) => {
    if (message.action !== 'turnOff') return
    handleTurnOff(message.tabId).then(sendResponse)
    return true
  },
)

async function handleTurnOff(tabId: number): Promise<{ ok: boolean }> {
  await setTabSessionState(tabId, 'user-off')
  try {
    await chrome.tabs.sendMessage(tabId, { action: 'clearFilters' } satisfies ExtensionMessage)
    return { ok: true }
  } catch {
    return { ok: false }
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
git add background.ts
git commit -m "feat: add background service worker with auto-apply, reapply, and off handlers"
```

---

### Worktree C — Popup (`../brandfilter-popup`)

#### Task 12: StatusBar Component

**Files:**

- Create: `components/StatusBar.tsx`

- [ ] **Step 1: Create `components/StatusBar.tsx`**

```tsx
import React from 'react'

type Status = 'applied' | 'not-applied' | 'off' | 'unsupported'

interface Props {
  status: Status
  appliedAt?: number // timestamp ms
}

const STATUS_CONFIG: Record<Status, { dot: string; label: (appliedAt?: number) => string }> = {
  applied: {
    dot: '#4ade80',
    label: (at) => (at ? `Filters applied ${formatAgo(at)}` : 'Filters applied'),
  },
  'not-applied': { dot: '#f59e0b', label: () => 'Not applied yet' },
  off: { dot: '#6b7280', label: () => 'Filters off' },
  unsupported: { dot: '#6b7280', label: () => 'Site not configured' },
}

function formatAgo(ts: number): string {
  const diffMs = Date.now() - ts
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins === 1) return '1 min ago'
  return `${mins} mins ago`
}

export function StatusBar({ status, appliedAt }: Props) {
  const { dot, label } = STATUS_CONFIG[status]
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: '#0f172a',
        borderRadius: 6,
        padding: '7px 10px',
        fontSize: 11,
        color: '#94a3b8',
      }}
    >
      <div style={{ width: 7, height: 7, borderRadius: '50%', background: dot, flexShrink: 0 }} />
      <span>{label(appliedAt)}</span>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/StatusBar.tsx
git commit -m "feat: add StatusBar component"
```

---

#### Task 13: ProfileDropdown Component

**Files:**

- Create: `components/ProfileDropdown.tsx`

- [ ] **Step 1: Create `components/ProfileDropdown.tsx`**

```tsx
import React, { useState } from 'react'
import type { Profile } from '../lib/config'

interface Props {
  profiles: Profile[]
  selectedId: string
  onSelect: (profileId: string) => void
}

export function ProfileDropdown({ profiles, selectedId, onSelect }: Props) {
  const [open, setOpen] = useState(false)
  const selected = profiles.find((p) => p.id === selectedId)

  return (
    <div style={{ position: 'relative' }}>
      <div
        style={{
          fontSize: 9,
          color: '#64748b',
          textTransform: 'uppercase',
          letterSpacing: '0.6px',
          marginBottom: 5,
        }}
      >
        Profile
      </div>

      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%',
          background: '#1e293b',
          border: `1px solid ${open ? '#6366f1' : '#334155'}`,
          borderRadius: 8,
          padding: '9px 12px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          color: '#e2e8f0',
          fontSize: 12,
        }}
      >
        <span style={{ fontWeight: 500 }}>
          {selected ? `${selected.icon} ${selected.name}` : 'No profile selected'}
        </span>
        <span style={{ color: '#64748b', fontSize: 10 }}>{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 10,
            background: '#1e293b',
            border: '1px solid #334155',
            borderTop: 'none',
            borderRadius: '0 0 8px 8px',
            overflow: 'hidden',
          }}
        >
          {profiles.map((profile) => (
            <button
              key={profile.id}
              onClick={() => {
                onSelect(profile.id)
                setOpen(false)
              }}
              style={{
                width: '100%',
                padding: '8px 12px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: profile.id === selectedId ? '#312e81' : 'transparent',
                border: 'none',
                borderTop: '1px solid #334155',
                cursor: 'pointer',
                color: profile.id === selectedId ? '#a5b4fc' : '#94a3b8',
                fontSize: 11,
              }}
            >
              <span>
                {profile.icon} {profile.name}
              </span>
              {profile.id === selectedId && <span style={{ fontSize: 9 }}>active</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/ProfileDropdown.tsx
git commit -m "feat: add ProfileDropdown component"
```

---

#### Task 14: BrandMultiSelect Component

**Files:**

- Create: `components/BrandMultiSelect.tsx`

- [ ] **Step 1: Create `components/BrandMultiSelect.tsx`**

```tsx
import React, { useState, useMemo } from 'react'
import type { Brand } from '../lib/config'

interface Props {
  allBrands: Brand[]
  selectedIds: string[]
  onChange: (selectedIds: string[]) => void
  onAddBrand: (name: string) => void
}

export function BrandMultiSelect({ allBrands, selectedIds, onChange, onAddBrand }: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return allBrands
    return allBrands.filter((b) => b.name.toLowerCase().includes(q))
  }, [allBrands, search])

  const selectedCount = selectedIds.length
  const preview = allBrands
    .filter((b) => selectedIds.includes(b.id))
    .slice(0, 2)
    .map((b) => b.name)
    .join(', ')
  const previewLabel =
    selectedCount > 2 ? `${preview} +${selectedCount - 2}` : preview || 'None selected'

  const toggle = (id: string) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter((i) => i !== id) : [...selectedIds, id])
  }

  const showAddOption =
    search.trim() && !allBrands.some((b) => b.name.toLowerCase() === search.toLowerCase().trim())

  return (
    <div style={{ position: 'relative' }}>
      <div
        style={{
          fontSize: 9,
          color: '#64748b',
          textTransform: 'uppercase',
          letterSpacing: '0.6px',
          marginBottom: 5,
        }}
      >
        Brands{' '}
        {selectedCount > 0 && (
          <span style={{ color: '#6366f1', fontWeight: 600 }}>{selectedCount} selected</span>
        )}
      </div>

      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%',
          background: '#1e293b',
          border: `1px solid ${open ? '#6366f1' : '#334155'}`,
          borderRadius: open ? '8px 8px 0 0' : 8,
          padding: '9px 12px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          color: '#94a3b8',
          fontSize: 11,
        }}
      >
        <span>{previewLabel}</span>
        <span style={{ color: '#64748b', fontSize: 10 }}>{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div
          style={{
            border: '1px solid #6366f1',
            borderTop: 'none',
            borderRadius: '0 0 8px 8px',
            background: '#1e293b',
            overflow: 'hidden',
          }}
        >
          {/* Search */}
          <div style={{ padding: 8, borderBottom: '1px solid #334155' }}>
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search brands…"
              style={{
                width: '100%',
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: 6,
                padding: '5px 10px',
                color: '#e2e8f0',
                fontSize: 11,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Brand list */}
          <div style={{ maxHeight: 150, overflowY: 'auto' }}>
            {filtered.map((brand) => {
              const checked = selectedIds.includes(brand.id)
              return (
                <button
                  key={brand.id}
                  onClick={() => toggle(brand.id)}
                  style={{
                    width: '100%',
                    padding: '7px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    background: checked ? '#1c2a3a' : 'transparent',
                    border: 'none',
                    borderTop: '1px solid #334155',
                    cursor: 'pointer',
                    color: '#e2e8f0',
                    fontSize: 11,
                    textAlign: 'left',
                  }}
                >
                  <div
                    style={{
                      width: 13,
                      height: 13,
                      borderRadius: 3,
                      flexShrink: 0,
                      background: checked ? '#6366f1' : 'transparent',
                      border: checked ? 'none' : '1px solid #475569',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {checked && (
                      <span style={{ color: 'white', fontSize: 9, fontWeight: 700 }}>✓</span>
                    )}
                  </div>
                  {brand.name}
                </button>
              )
            })}

            {showAddOption && (
              <button
                onClick={() => {
                  onAddBrand(search.trim())
                  setSearch('')
                }}
                style={{
                  width: '100%',
                  padding: '7px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: 'transparent',
                  border: 'none',
                  borderTop: '1px solid #334155',
                  cursor: 'pointer',
                  color: '#6366f1',
                  fontSize: 11,
                }}
              >
                + Add "{search.trim()}" to library
              </button>
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: '6px 12px',
              borderTop: '1px solid #334155',
              display: 'flex',
              gap: 12,
            }}
          >
            <button
              onClick={() => onChange(allBrands.map((b) => b.id))}
              style={{
                background: 'none',
                border: 'none',
                color: '#6366f1',
                cursor: 'pointer',
                fontSize: 10,
                padding: 0,
              }}
            >
              Select all
            </button>
            <button
              onClick={() => onChange([])}
              style={{
                background: 'none',
                border: 'none',
                color: '#64748b',
                cursor: 'pointer',
                fontSize: 10,
                padding: 0,
              }}
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/BrandMultiSelect.tsx
git commit -m "feat: add BrandMultiSelect component with search and add-to-library"
```

---

#### Task 15: Popup Entry

**Files:**

- Modify: `popup.tsx`

- [ ] **Step 1: Replace `popup.tsx`**

```tsx
import React, { useEffect, useState, useCallback } from 'react'
import type { Config, Profile, Site } from './lib/config'
import { getConfig, setConfig, ensureBrandInLibrary } from './lib/storage'
import { ProfileDropdown } from './components/ProfileDropdown'
import { BrandMultiSelect } from './components/BrandMultiSelect'
import { StatusBar } from './components/StatusBar'

type PopupStatus = 'applied' | 'not-applied' | 'off' | 'unsupported'

export default function Popup() {
  const [config, setConfigState] = useState<Config | null>(null)
  const [currentSite, setCurrentSite] = useState<Site | null>(null)
  const [selectedProfileId, setSelectedProfileId] = useState('')
  const [status, setStatus] = useState<PopupStatus>('not-applied')
  const [appliedAt, setAppliedAt] = useState<number>()
  const [tabId, setTabId] = useState<number>()

  useEffect(() => {
    ;(async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id || !tab.url) return
      setTabId(tab.id)

      const cfg = await getConfig()
      setConfigState(cfg)

      const hostname = new URL(tab.url).hostname
      const site = cfg.sites.find((s) => s.hostname === hostname) ?? null
      setCurrentSite(site)

      if (!site) {
        setStatus('unsupported')
        return
      }
      setSelectedProfileId(site.defaultProfileId)

      const sessionResult = await chrome.storage.session.get(`applied_${tab.id}`)
      const sessionVal = sessionResult[`applied_${tab.id}`]
      if (sessionVal === 'user-off') setStatus('off')
      else if (sessionVal === true) {
        setStatus('applied')
        setAppliedAt(Date.now())
      } else setStatus('not-applied')
    })()
  }, [])

  const selectedProfile = config?.profiles.find((p) => p.id === selectedProfileId)
  const profileBrandIds = selectedProfile?.brandIds ?? []

  const handleApply = useCallback(async () => {
    if (!tabId || !selectedProfileId) return
    await chrome.runtime.sendMessage({ action: 'reapply', tabId, profileId: selectedProfileId })
    setStatus('applied')
    setAppliedAt(Date.now())
  }, [tabId, selectedProfileId])

  const handleOff = useCallback(async () => {
    if (!tabId) return
    await chrome.runtime.sendMessage({ action: 'turnOff', tabId })
    setStatus('off')
  }, [tabId])

  const handleBrandsChange = useCallback(
    async (brandIds: string[]) => {
      if (!config || !selectedProfileId) return
      const updated = {
        ...config,
        profiles: config.profiles.map((p) => (p.id === selectedProfileId ? { ...p, brandIds } : p)),
      }
      setConfigState(updated)
      await setConfig(updated)
    },
    [config, selectedProfileId],
  )

  const handleAddBrand = useCallback(
    async (name: string) => {
      if (!config || !selectedProfileId) return
      const id = name
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
      const brand = { id, name }
      await ensureBrandInLibrary(brand)
      const updated = {
        ...config,
        masterBrands: config.masterBrands.some((b) => b.id === id)
          ? config.masterBrands
          : [...config.masterBrands, brand],
        profiles: config.profiles.map((p) =>
          p.id === selectedProfileId ? { ...p, brandIds: [...p.brandIds, id] } : p,
        ),
      }
      setConfigState(updated)
      await setConfig(updated)
    },
    [config, selectedProfileId],
  )

  if (!config) return <div style={{ padding: 16, color: '#94a3b8', fontSize: 12 }}>Loading…</div>

  return (
    <div
      style={{
        width: 280,
        background: '#0f172a',
        color: '#e2e8f0',
        fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
        padding: 0,
      }}
    >
      {/* Header */}
      <div
        style={{
          background: '#1e293b',
          padding: '12px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #334155',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 28,
              height: 28,
              background: '#6366f1',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 14,
            }}
          >
            🛍
          </div>
          <span style={{ fontWeight: 700, fontSize: 13 }}>BrandFilter</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: currentSite ? '#4ade80' : '#6b7280',
            }}
          />
          <span style={{ fontSize: 10, color: currentSite ? '#4ade80' : '#6b7280' }}>
            {currentSite?.id ?? 'Unsupported'}
          </span>
        </div>
      </div>

      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {status === 'unsupported' ? (
          <>
            <p style={{ fontSize: 11, color: '#64748b', margin: 0 }}>
              This site isn't configured yet.
            </p>
            <button
              onClick={() => chrome.runtime.openOptionsPage()}
              style={{
                width: '100%',
                background: '#1e293b',
                border: '1px solid #334155',
                color: '#a5b4fc',
                padding: 8,
                borderRadius: 8,
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              Teach this site →
            </button>
          </>
        ) : (
          <>
            <ProfileDropdown
              profiles={config.profiles}
              selectedId={selectedProfileId}
              onSelect={setSelectedProfileId}
            />
            <BrandMultiSelect
              allBrands={config.masterBrands}
              selectedIds={profileBrandIds}
              onChange={handleBrandsChange}
              onAddBrand={handleAddBrand}
            />
            <StatusBar status={status} appliedAt={appliedAt} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handleApply}
                style={{
                  flex: 1,
                  background: '#6366f1',
                  border: 'none',
                  color: 'white',
                  padding: 9,
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                ▶ {status === 'applied' ? 'Re-apply' : 'Apply'}
              </button>
              <button
                onClick={handleOff}
                style={{
                  background: '#1e293b',
                  border: '1px solid #334155',
                  color: '#94a3b8',
                  padding: '9px 12px',
                  borderRadius: 8,
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                ✕ Off
              </button>
            </div>
          </>
        )}
        <div style={{ textAlign: 'center' }}>
          <button
            onClick={() => chrome.runtime.openOptionsPage()}
            style={{
              background: 'none',
              border: 'none',
              color: '#475569',
              fontSize: 10,
              cursor: 'pointer',
            }}
          >
            ⚙ Settings
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
git add popup.tsx components/
git commit -m "feat: complete popup UI with profile switching, brand multi-select, and apply/off actions"
```

---

### Worktree D — Options Page (`../brandfilter-options`)

#### Task 16: Options Page — Master Brands Tab

**Files:**

- Create: `options/tabs/MasterBrandsTab.tsx`

- [ ] **Step 1: Create `options/tabs/MasterBrandsTab.tsx`**

```tsx
import React, { useState } from 'react'
import type { Brand, Profile } from '../../lib/config'

interface Props {
  brands: Brand[]
  profiles: Profile[]
  onAdd: (brand: Brand) => void
  onDelete: (brandId: string) => void
}

export function MasterBrandsTab({ brands, profiles, onAdd, onDelete }: Props) {
  const [search, setSearch] = useState('')
  const [newName, setNewName] = useState('')

  const profilesForBrand = (brandId: string) => profiles.filter((p) => p.brandIds.includes(brandId))

  const filtered = brands.filter((b) => b.name.toLowerCase().includes(search.toLowerCase()))

  const handleAdd = () => {
    const name = newName.trim()
    if (!name) return
    const id = name
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
    if (brands.some((b) => b.id === id)) return
    onAdd({ id, name })
    setNewName('')
  }

  return (
    <div>
      <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Master Brand Library</h2>
      <p style={{ fontSize: 11, color: '#64748b', marginBottom: 16 }}>
        All brands available across profiles. Adding a brand to any profile auto-adds it here.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search brands…"
          style={{
            flex: 1,
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: 6,
            padding: '7px 10px',
            color: '#e2e8f0',
            fontSize: 11,
          }}
        />
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New brand name…"
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          style={{
            flex: 1,
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: 6,
            padding: '7px 10px',
            color: '#e2e8f0',
            fontSize: 11,
          }}
        />
        <button
          onClick={handleAdd}
          style={{
            background: '#6366f1',
            border: 'none',
            color: 'white',
            padding: '7px 14px',
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          + Add
        </button>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {['Brand Name', 'Used in Profiles', ''].map((h) => (
              <th
                key={h}
                style={{
                  textAlign: 'left',
                  fontSize: 9,
                  color: '#475569',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  padding: '0 10px 8px',
                  borderBottom: '1px solid #1e293b',
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtered.map((brand) => {
            const usedIn = profilesForBrand(brand.id)
            return (
              <tr key={brand.id} style={{ borderBottom: '1px solid #0f172a' }}>
                <td style={{ padding: '9px 10px', fontWeight: 500, fontSize: 12 }}>{brand.name}</td>
                <td style={{ padding: '9px 10px' }}>
                  {usedIn.length > 0 ? (
                    usedIn.map((p) => (
                      <span
                        key={p.id}
                        style={{
                          display: 'inline-block',
                          background: 'rgba(99,102,241,0.15)',
                          color: '#a5b4fc',
                          padding: '2px 8px',
                          borderRadius: 10,
                          fontSize: 10,
                          marginRight: 4,
                        }}
                      >
                        {p.icon} {p.name}
                      </span>
                    ))
                  ) : (
                    <span style={{ color: '#475569', fontStyle: 'italic', fontSize: 11 }}>
                      Not in any profile
                    </span>
                  )}
                </td>
                <td style={{ padding: '9px 10px', textAlign: 'right' }}>
                  <button
                    onClick={() => onDelete(brand.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#475569',
                      cursor: 'pointer',
                      fontSize: 13,
                    }}
                  >
                    🗑
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div style={{ marginTop: 10, fontSize: 10, color: '#475569' }}>
        {brands.length} brands · {brands.filter((b) => profilesForBrand(b.id).length === 0).length}{' '}
        not assigned
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add options/tabs/MasterBrandsTab.tsx
git commit -m "feat: add MasterBrandsTab with search, add, delete, and profile usage display"
```

---

#### Task 17: Options Page — Profiles Tab

**Files:**

- Create: `options/tabs/ProfilesTab.tsx`

- [ ] **Step 1: Create `options/tabs/ProfilesTab.tsx`**

```tsx
import React, { useState } from 'react'
import type { Brand, Profile } from '../../lib/config'
import { BrandMultiSelect } from '../../components/BrandMultiSelect'

interface Props {
  profiles: Profile[]
  brands: Brand[]
  onAdd: (profile: Profile) => void
  onUpdate: (profile: Profile) => void
  onDelete: (profileId: string) => void
  onAddBrand: (name: string) => Brand
}

const ICONS = ['👕', '👟', '⌚', '👜', '🧥', '👒', '🎽', '🩱', '🕶', '💍']

export function ProfilesTab({ profiles, brands, onAdd, onUpdate, onDelete, onAddBrand }: Props) {
  const [editing, setEditing] = useState<Profile | null>(null)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newIcon, setNewIcon] = useState(ICONS[0]!)

  const startCreate = () => {
    setCreating(true)
    setEditing({ id: '', name: '', icon: ICONS[0]!, brandIds: [] })
  }

  const saveNew = () => {
    if (!editing?.name.trim()) return
    const id = editing.name
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
    onAdd({ ...editing, id })
    setCreating(false)
    setEditing(null)
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <div>
          <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Profiles</h2>
          <p style={{ fontSize: 11, color: '#64748b' }}>
            Named subsets of your master brands. Assign one as default per site.
          </p>
        </div>
        <button
          onClick={startCreate}
          style={{
            background: '#6366f1',
            border: 'none',
            color: 'white',
            padding: '7px 14px',
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          + New Profile
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {profiles.map((profile) => (
          <div
            key={profile.id}
            style={{
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: 10,
              padding: 14,
            }}
          >
            {editing?.id === profile.id ? (
              // Inline edit mode
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  {ICONS.map((icon) => (
                    <button
                      key={icon}
                      onClick={() => setEditing((e) => e && { ...e, icon })}
                      style={{
                        background: editing.icon === icon ? '#6366f1' : '#0f172a',
                        border: 'none',
                        borderRadius: 4,
                        padding: 4,
                        fontSize: 16,
                        cursor: 'pointer',
                      }}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
                <input
                  value={editing.name}
                  onChange={(e) => setEditing((ed) => ed && { ...ed, name: e.target.value })}
                  style={{
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: 6,
                    padding: '6px 10px',
                    color: '#e2e8f0',
                    fontSize: 12,
                  }}
                />
                <BrandMultiSelect
                  allBrands={brands}
                  selectedIds={editing.brandIds}
                  onChange={(brandIds) => setEditing((ed) => ed && { ...ed, brandIds })}
                  onAddBrand={(name) => {
                    const b = onAddBrand(name)
                    setEditing((ed) => ed && { ...ed, brandIds: [...ed.brandIds, b.id] })
                  }}
                />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => {
                      onUpdate(editing)
                      setEditing(null)
                    }}
                    style={{
                      flex: 1,
                      background: '#6366f1',
                      border: 'none',
                      color: 'white',
                      padding: 7,
                      borderRadius: 6,
                      fontSize: 11,
                      cursor: 'pointer',
                    }}
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditing(null)}
                    style={{
                      background: '#1e293b',
                      border: '1px solid #334155',
                      color: '#94a3b8',
                      padding: 7,
                      borderRadius: 6,
                      fontSize: 11,
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              // View mode
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 20 }}>{profile.icon}</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{profile.name}</div>
                    <div style={{ fontSize: 10, color: '#64748b' }}>
                      {profile.brandIds.length} brands
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
                  {brands
                    .filter((b) => profile.brandIds.includes(b.id))
                    .map((b) => (
                      <span
                        key={b.id}
                        style={{
                          background: '#0f172a',
                          color: '#94a3b8',
                          padding: '3px 9px',
                          borderRadius: 10,
                          fontSize: 10,
                        }}
                      >
                        {b.name}
                      </span>
                    ))}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => setEditing(profile)}
                    style={{
                      flex: 1,
                      background: '#1e293b',
                      border: '1px solid #334155',
                      color: '#94a3b8',
                      padding: 7,
                      borderRadius: 6,
                      fontSize: 11,
                      cursor: 'pointer',
                    }}
                  >
                    ✏️ Edit
                  </button>
                  <button
                    onClick={() => onDelete(profile.id)}
                    style={{
                      background: '#1e293b',
                      border: '1px solid #334155',
                      color: '#94a3b8',
                      padding: 7,
                      borderRadius: 6,
                      fontSize: 11,
                      cursor: 'pointer',
                    }}
                  >
                    🗑
                  </button>
                </div>
              </>
            )}
          </div>
        ))}

        {/* New profile form */}
        {creating && editing?.id === '' && (
          <div
            style={{
              background: '#1e293b',
              border: '1px solid #6366f1',
              borderRadius: 10,
              padding: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', gap: 6 }}>
              {ICONS.map((icon) => (
                <button
                  key={icon}
                  onClick={() => setEditing((e) => e && { ...e, icon })}
                  style={{
                    background: editing.icon === icon ? '#6366f1' : '#0f172a',
                    border: 'none',
                    borderRadius: 4,
                    padding: 4,
                    fontSize: 16,
                    cursor: 'pointer',
                  }}
                >
                  {icon}
                </button>
              ))}
            </div>
            <input
              value={editing.name}
              onChange={(e) => setEditing((ed) => ed && { ...ed, name: e.target.value })}
              placeholder="Profile name…"
              style={{
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: 6,
                padding: '6px 10px',
                color: '#e2e8f0',
                fontSize: 12,
              }}
            />
            <BrandMultiSelect
              allBrands={brands}
              selectedIds={editing.brandIds}
              onChange={(brandIds) => setEditing((ed) => ed && { ...ed, brandIds })}
              onAddBrand={(name) => {
                const b = onAddBrand(name)
                setEditing((ed) => ed && { ...ed, brandIds: [...ed.brandIds, b.id] })
              }}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={saveNew}
                style={{
                  flex: 1,
                  background: '#6366f1',
                  border: 'none',
                  color: 'white',
                  padding: 7,
                  borderRadius: 6,
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                Create
              </button>
              <button
                onClick={() => setCreating(false)}
                style={{
                  background: '#1e293b',
                  border: '1px solid #334155',
                  color: '#94a3b8',
                  padding: 7,
                  borderRadius: 6,
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add options/tabs/ProfilesTab.tsx
git commit -m "feat: add ProfilesTab with inline create/edit and brand assignment"
```

---

#### Task 18: Options Page — Sites Tab

**Files:**

- Create: `options/tabs/SitesTab.tsx`

- [ ] **Step 1: Create `options/tabs/SitesTab.tsx`**

```tsx
import React from 'react'
import type { Site, Profile } from '../../lib/config'

interface Props {
  sites: Site[]
  profiles: Profile[]
  onToggle: (siteId: string, enabled: boolean) => void
  onSetDefault: (siteId: string, profileId: string) => void
}

export function SitesTab({ sites, profiles, onToggle, onSetDefault }: Props) {
  return (
    <div>
      <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Sites</h2>
      <p style={{ fontSize: 11, color: '#64748b', marginBottom: 16 }}>
        Configure which profile auto-applies on each site. Toggle to enable/disable.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sites.map((site) => {
          const defaultProfile = profiles.find((p) => p.id === site.defaultProfileId)
          return (
            <div
              key={site.id}
              style={{
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: 8,
                padding: '12px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  background: '#334155',
                  borderRadius: 6,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 14,
                  flexShrink: 0,
                }}
              >
                🌐
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13, textTransform: 'capitalize' }}>
                  {site.id}
                </div>
                <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
                  {site.hostname} · {site.customSelector ? 'Taught adapter' : 'Built-in adapter'}
                </div>
              </div>
              <select
                value={site.defaultProfileId}
                onChange={(e) => onSetDefault(site.id, e.target.value)}
                style={{
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: 6,
                  padding: '4px 8px',
                  color: '#94a3b8',
                  fontSize: 11,
                }}
              >
                <option value="">No default</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.icon} {p.name}
                  </option>
                ))}
              </select>
              {/* Toggle */}
              <button
                onClick={() => onToggle(site.id, !site.enabled)}
                style={{
                  width: 32,
                  height: 18,
                  borderRadius: 9,
                  border: 'none',
                  cursor: 'pointer',
                  background: site.enabled ? '#4ade80' : '#334155',
                  position: 'relative',
                  padding: 0,
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: 12,
                    height: 12,
                    background: 'white',
                    borderRadius: '50%',
                    position: 'absolute',
                    top: 3,
                    transition: 'left 0.15s',
                    left: site.enabled ? 17 : 3,
                  }}
                />
              </button>
            </div>
          )
        })}

        <button
          onClick={() => chrome.runtime.openOptionsPage()}
          style={{
            background: 'transparent',
            border: '1px dashed #334155',
            borderRadius: 8,
            padding: '12px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            color: '#475569',
            fontSize: 11,
            cursor: 'pointer',
          }}
        >
          <span style={{ fontSize: 14 }}>＋</span> Teach a new site
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add options/tabs/SitesTab.tsx
git commit -m "feat: add SitesTab with enable toggle and default profile selector"
```

---

#### Task 19: Options Page — Export/Import Tab

**Files:**

- Create: `options/tabs/ExportImportTab.tsx`

- [ ] **Step 1: Create `options/tabs/ExportImportTab.tsx`**

```tsx
import React, { useRef } from 'react'
import type { Config } from '../../lib/config'

interface Props {
  config: Config
  onImport: (config: Config) => void
  onReset: () => void
}

export function ExportImportTab({ config, onImport, onReset }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `brandfilter-config-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string) as Config
        if (!parsed.version || !Array.isArray(parsed.masterBrands)) {
          alert('Invalid config file — missing required fields.')
          return
        }
        onImport(parsed)
      } catch {
        alert('Failed to parse JSON file.')
      }
    }
    reader.readAsText(file)
  }

  return (
    <div>
      <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Export / Import</h2>
      <p style={{ fontSize: 11, color: '#64748b', marginBottom: 20 }}>
        Back up your brand library and profiles, or restore from a previous export.
      </p>

      {[
        {
          title: 'Export Config',
          desc: 'Download your full configuration as a JSON file. Includes master brands, profiles, and site settings.',
          action: (
            <button
              onClick={handleExport}
              style={{
                background: '#6366f1',
                border: 'none',
                color: 'white',
                padding: '8px 16px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              ⬆ Download JSON
            </button>
          ),
        },
        {
          title: 'Import Config',
          desc: 'Restore from a previously exported JSON file. This will overwrite your current configuration.',
          action: (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleImport}
                style={{ display: 'none' }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{
                  background: '#1e293b',
                  border: '1px solid #334155',
                  color: '#94a3b8',
                  padding: '8px 16px',
                  borderRadius: 6,
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                ⬇ Choose File
              </button>
            </>
          ),
        },
        {
          title: 'Reset to Defaults',
          desc: 'Clear all your profiles and sites. Master brands are re-seeded from the default library. This cannot be undone.',
          action: (
            <button
              onClick={() => {
                if (confirm('Reset all settings to defaults?')) onReset()
              }}
              style={{
                background: '#7f1d1d',
                border: '1px solid #dc2626',
                color: '#fca5a5',
                padding: '8px 16px',
                borderRadius: 6,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Reset to Defaults
            </button>
          ),
        },
      ].map(({ title, desc, action }) => (
        <div
          key={title}
          style={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: 10,
            padding: 16,
            marginBottom: 12,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 13 }}>{title}</div>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 12 }}>{desc}</div>
          {action}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add options/tabs/ExportImportTab.tsx
git commit -m "feat: add ExportImportTab with JSON export, file import, and reset"
```

---

#### Task 20: Options Page Entry

**Files:**

- Modify: `options.tsx`

- [ ] **Step 1: Replace `options.tsx`**

```tsx
import React, { useEffect, useState, useCallback } from 'react'
import type { Config, Brand, Profile, Site } from './lib/config'
import { DEFAULT_CONFIG } from './lib/config'
import { getConfig, setConfig } from './lib/storage'
import { MasterBrandsTab } from './options/tabs/MasterBrandsTab'
import { ProfilesTab } from './options/tabs/ProfilesTab'
import { SitesTab } from './options/tabs/SitesTab'
import { ExportImportTab } from './options/tabs/ExportImportTab'
import defaultBrands from './assets/default-brands.json'

type Tab = 'brands' | 'profiles' | 'sites' | 'export'

const TAB_LABELS: { id: Tab; icon: string; label: string }[] = [
  { id: 'brands', icon: '📚', label: 'Master Brands' },
  { id: 'profiles', icon: '🗂', label: 'Profiles' },
  { id: 'sites', icon: '🌐', label: 'Sites' },
  { id: 'export', icon: '📦', label: 'Export / Import' },
]

export default function Options() {
  const [config, setConfigState] = useState<Config | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('brands')
  const [firstRun, setFirstRun] = useState(false)

  useEffect(() => {
    getConfig().then((cfg) => {
      setConfigState(cfg)
      if (cfg.profiles.length === 0) setFirstRun(true)
    })
  }, [])

  const save = useCallback(async (updated: Config) => {
    setConfigState(updated)
    await setConfig(updated)
  }, [])

  if (!config) return <div style={{ padding: 24, color: '#94a3b8' }}>Loading…</div>

  const handleAddBrand = (brand: Brand) => {
    if (config.masterBrands.some((b) => b.id === brand.id)) return
    save({ ...config, masterBrands: [...config.masterBrands, brand] })
  }

  const handleDeleteBrand = (brandId: string) => {
    save({
      ...config,
      masterBrands: config.masterBrands.filter((b) => b.id !== brandId),
      profiles: config.profiles.map((p) => ({
        ...p,
        brandIds: p.brandIds.filter((id) => id !== brandId),
      })),
    })
  }

  const handleAddProfile = (profile: Profile) => {
    save({ ...config, profiles: [...config.profiles, profile] })
  }

  const handleUpdateProfile = (profile: Profile) => {
    save({ ...config, profiles: config.profiles.map((p) => (p.id === profile.id ? profile : p)) })
  }

  const handleDeleteProfile = (profileId: string) => {
    save({ ...config, profiles: config.profiles.filter((p) => p.id !== profileId) })
  }

  const handleAddBrandFromProfile = (name: string): Brand => {
    const id = name
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
    const brand: Brand = { id, name }
    if (!config.masterBrands.some((b) => b.id === id)) {
      save({ ...config, masterBrands: [...config.masterBrands, brand] })
    }
    return brand
  }

  const handleToggleSite = (siteId: string, enabled: boolean) => {
    save({ ...config, sites: config.sites.map((s) => (s.id === siteId ? { ...s, enabled } : s)) })
  }

  const handleSetDefaultProfile = (siteId: string, profileId: string) => {
    save({
      ...config,
      sites: config.sites.map((s) => (s.id === siteId ? { ...s, defaultProfileId: profileId } : s)),
    })
  }

  const handleImport = (imported: Config) => save(imported)

  const handleReset = () => {
    const reset: Config = { ...DEFAULT_CONFIG, masterBrands: defaultBrands as Brand[] }
    save(reset)
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0a0f1a',
        color: '#e2e8f0',
        fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
      }}
    >
      {/* Header */}
      <div
        style={{
          background: '#1e293b',
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #334155',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              background: '#6366f1',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16,
            }}
          >
            🛍
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>BrandFilter — Settings</div>
            <div style={{ fontSize: 10, color: '#64748b' }}>
              Manage your brand library, profiles, and sites
            </div>
          </div>
        </div>
      </div>

      {/* First-run banner */}
      {firstRun && (
        <div
          style={{
            background: 'rgba(99,102,241,0.15)',
            borderBottom: '1px solid #6366f1',
            padding: '10px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ fontSize: 12, color: '#a5b4fc' }}>
            Your brand library is ready. Create a profile to get started →
          </span>
          <button
            onClick={() => {
              setFirstRun(false)
              setActiveTab('profiles')
            }}
            style={{
              background: '#6366f1',
              border: 'none',
              color: 'white',
              padding: '5px 12px',
              borderRadius: 6,
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            Create Profile
          </button>
        </div>
      )}

      <div style={{ display: 'flex', minHeight: 'calc(100vh - 65px)' }}>
        {/* Sidebar nav */}
        <div
          style={{
            width: 180,
            background: '#0f172a',
            borderRight: '1px solid #1e293b',
            padding: '12px 0',
            flexShrink: 0,
          }}
        >
          {TAB_LABELS.map(({ id, icon, label }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              style={{
                width: '100%',
                padding: '9px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: activeTab === id ? 'rgba(99,102,241,0.1)' : 'transparent',
                border: 'none',
                borderLeft: `2px solid ${activeTab === id ? '#6366f1' : 'transparent'}`,
                cursor: 'pointer',
                color: activeTab === id ? '#a5b4fc' : '#64748b',
                fontSize: 12,
              }}
            >
              {icon} {label}
            </button>
          ))}
        </div>

        {/* Main content */}
        <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
          {activeTab === 'brands' && (
            <MasterBrandsTab
              brands={config.masterBrands}
              profiles={config.profiles}
              onAdd={handleAddBrand}
              onDelete={handleDeleteBrand}
            />
          )}
          {activeTab === 'profiles' && (
            <ProfilesTab
              profiles={config.profiles}
              brands={config.masterBrands}
              onAdd={handleAddProfile}
              onUpdate={handleUpdateProfile}
              onDelete={handleDeleteProfile}
              onAddBrand={handleAddBrandFromProfile}
            />
          )}
          {activeTab === 'sites' && (
            <SitesTab
              sites={config.sites}
              profiles={config.profiles}
              onToggle={handleToggleSite}
              onSetDefault={handleSetDefaultProfile}
            />
          )}
          {activeTab === 'export' && (
            <ExportImportTab config={config} onImport={handleImport} onReset={handleReset} />
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
git add options.tsx options/tabs/
git commit -m "feat: complete options page with all four tabs and first-run banner"
```

---

### Worktree E — Teach Mode (`../brandfilter-teach`)

#### Task 21: Teach Mode Content Script

**Files:**

- Create: `contents/teachable.ts`

- [ ] **Step 1: Create `contents/teachable.ts`**

```typescript
import type { PlasmoCSConfig } from 'plasmo'
import { getConfig, setConfig } from '../lib/storage'
import type { Site } from '../lib/config'

export const config: PlasmoCSConfig = {
  matches: ['<all_urls>'],
  run_at: 'document_idle',
  // Inactive by default — only activates on 'startTeach' message
}

let teachModeActive = false

chrome.runtime.onMessage.addListener(
  (message: { action: string; defaultProfileId?: string }, _sender, sendResponse) => {
    if (message.action === 'startTeach') {
      startTeachMode(message.defaultProfileId ?? '')
      sendResponse({ ok: true })
    }
  },
)

function startTeachMode(defaultProfileId: string) {
  if (teachModeActive) return
  teachModeActive = true

  // Visual overlay: blue border + cursor crosshair
  document.body.style.cursor = 'crosshair'
  const overlay = document.createElement('div')
  overlay.id = 'brandfilter-teach-overlay'
  overlay.style.cssText = `
    position: fixed; inset: 0; pointer-events: none; z-index: 999999;
    box-shadow: inset 0 0 0 3px #6366f1;
  `
  document.body.appendChild(overlay)

  // Instruction tooltip
  const tooltip = document.createElement('div')
  tooltip.id = 'brandfilter-teach-tooltip'
  tooltip.style.cssText = `
    position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
    background: #1e293b; color: #e2e8f0; padding: 10px 16px; border-radius: 8px;
    font-size: 13px; font-family: -apple-system, sans-serif; z-index: 1000000;
    border: 1px solid #6366f1; box-shadow: 0 4px 20px rgba(0,0,0,0.4);
  `
  tooltip.textContent = '🎯 Click on any brand name in the filter panel'
  document.body.appendChild(tooltip)

  document.addEventListener('click', onElementClick, { capture: true, once: false })

  function onElementClick(e: MouseEvent) {
    e.preventDefault()
    e.stopPropagation()

    const target = e.target as Element
    const selector = inferSelector(target)

    showConfirmToast(selector, defaultProfileId, () => {
      document.removeEventListener('click', onElementClick, { capture: true })
      exitTeachMode()
    })
  }
}

function inferSelector(el: Element): string {
  // Walk up to find a container that holds multiple similar elements (filter list)
  let current: Element | null = el
  for (let i = 0; i < 5; i++) {
    if (!current) break
    const parent = current.parentElement
    if (!parent) break
    const siblings = parent.querySelectorAll(current.tagName.toLowerCase())
    if (siblings.length >= 3) {
      // Found a repeating pattern — use the input selector within this container
      const containerPath = getSimplePath(parent)
      return `${containerPath} input[type="checkbox"]`
    }
    current = parent
  }
  return el.tagName.toLowerCase()
}

function getSimplePath(el: Element): string {
  if (el.id) return `#${el.id}`
  if (el.className) {
    const firstClass = el.className.toString().trim().split(/\s+/)[0]
    if (firstClass) return `.${firstClass}`
  }
  return el.tagName.toLowerCase()
}

function showConfirmToast(selector: string, defaultProfileId: string, onDone: () => void) {
  const existing = document.getElementById('brandfilter-confirm-toast')
  existing?.remove()

  const toast = document.createElement('div')
  toast.id = 'brandfilter-confirm-toast'
  toast.style.cssText = `
    position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
    background: #1e293b; color: #e2e8f0; padding: 14px 18px; border-radius: 10px;
    font-family: -apple-system, sans-serif; z-index: 1000001;
    border: 1px solid #6366f1; box-shadow: 0 8px 32px rgba(0,0,0,0.5); min-width: 320px;
  `
  toast.innerHTML = `
    <div style="font-size:12px;margin-bottom:8px;">Found selector:</div>
    <code style="font-size:11px;color:#a5b4fc;background:#0f172a;padding:4px 8px;border-radius:4px;">${selector}</code>
    <div style="display:flex;gap:8px;margin-top:12px;">
      <button id="bf-confirm" style="flex:1;background:#6366f1;border:none;color:white;padding:8px;border-radius:6px;font-size:12px;cursor:pointer;font-weight:600;">✓ Confirm</button>
      <button id="bf-retry" style="background:#1e293b;border:1px solid #334155;color:#94a3b8;padding:8px 12px;border-radius:6px;font-size:12px;cursor:pointer;">Try again</button>
    </div>
  `
  document.body.appendChild(toast)

  document.getElementById('bf-confirm')?.addEventListener('click', async () => {
    await saveCustomSite(selector, defaultProfileId)
    toast.remove()
    onDone()
  })

  document.getElementById('bf-retry')?.addEventListener('click', () => {
    toast.remove()
  })
}

async function saveCustomSite(selector: string, defaultProfileId: string) {
  const hostname = window.location.hostname
  const cfg = await getConfig()
  const existingSite = cfg.sites.find((s) => s.hostname === hostname)

  const newSite: Site = existingSite
    ? { ...existingSite, customSelector: selector, defaultProfileId }
    : {
        id: hostname.replace(/\./g, '-'),
        hostname,
        defaultProfileId,
        enabled: true,
        customSelector: selector,
      }

  const sites = existingSite
    ? cfg.sites.map((s) => (s.hostname === hostname ? newSite : s))
    : [...cfg.sites, newSite]

  await setConfig({ ...cfg, sites })
}

function exitTeachMode() {
  teachModeActive = false
  document.body.style.cursor = ''
  document.getElementById('brandfilter-teach-overlay')?.remove()
  document.getElementById('brandfilter-teach-tooltip')?.remove()
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
git add contents/teachable.ts
git commit -m "feat: add teach-mode content script with crosshair overlay, selector inference, and confirm toast"
```

---

## Phase 3 — Integration

After all worktree branches are committed, merge them into `main`:

```bash
# From main worktree
git merge feat/adapters --no-ff -m "merge: adapters (Myntra + Ajio)"
git merge feat/background --no-ff -m "merge: background service worker"
git merge feat/popup --no-ff -m "merge: popup UI"
git merge feat/options --no-ff -m "merge: options page"
git merge feat/teach --no-ff -m "merge: teach mode content script"
```

---

#### Task 22: Confirm Adapter Selectors Against Live DOM

These selectors were set as best-guess placeholders and must be confirmed before the extension works reliably.

- [ ] **Step 1: Confirm Myntra selectors**

Open `https://www.myntra.com/mens-watches` in Chrome DevTools.

1. In Elements tab, find the brand filter section (left sidebar, "BRAND" heading)
2. Right-click a brand name element → "Copy → Copy selector"
3. Update these constants in `lib/adapters/myntra.ts`:
   - `FILTER_CONTAINER_SELECTOR` — the wrapper div around all brand checkboxes
   - `BRAND_LABEL_SELECTOR` — each individual brand label/name element

- [ ] **Step 2: Confirm Ajio selectors**

Open `https://www.ajio.com/s/watches-168315` in Chrome DevTools.

1. Find the "Refine By" sidebar → "Brands" section
2. Click `+` to expand it and inspect the checkbox elements
3. Update these constants in `lib/adapters/ajio.ts`:
   - `FACET_CONTAINER_SELECTOR` — the full "Refine By" panel
   - `BRAND_FACET_TITLE_SELECTOR` — the "Brands" section title
   - `EXPAND_BTN_SELECTOR` — the `+` expand button
   - `BRAND_CHECKBOX_CONTAINER_SELECTOR` — the div that holds brand checkboxes after expansion
   - `BRAND_LABEL_SELECTOR` — each brand label

- [ ] **Step 3: Run all tests after selector confirmation**

```bash
pnpm test
```

Expected: all tests pass (adapter tests use DOM mocks, not live selectors — selectors are confirmed manually).

- [ ] **Step 4: Commit selector updates**

```bash
git add lib/adapters/myntra.ts lib/adapters/ajio.ts
git commit -m "fix: confirm Myntra and Ajio filter selectors via live DOM inspection"
```

---

#### Task 23: Full Run Verification + Build

- [ ] **Step 1: Run all tests**

```bash
pnpm test
```

Expected: all test files pass with no failures.

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Load extension locally in Chrome**

```bash
pnpm dev
```

1. Open `chrome://extensions`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked" → select `.plasmo/chrome-mv3-dev/`
4. Open `https://www.myntra.com/mens-watches`
5. Verify: extension icon shows green dot for Myntra
6. Click icon → popup shows profile dropdown and brand list
7. Click "Apply" → brand filter checkboxes are checked on the page

- [ ] **Step 4: Test teach mode**

1. Open an unsupported site (e.g. `https://www.tatacliq.com`)
2. Click extension icon → "Teach this site" button appears
3. Click it → crosshair cursor + blue border overlay appears
4. Click on a brand name in the filter panel → confirm toast appears with inferred selector
5. Confirm → selector saved, extension applies brands immediately

- [ ] **Step 5: Production build**

```bash
pnpm build
```

Expected: `build/chrome-mv3-prod/` directory created with no build errors.

- [ ] **Step 6: Package for Chrome Web Store**

```bash
pnpm package
```

Expected: `build/chrome-mv3-prod.zip` created.

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "chore: verified build, all tests passing, extension functional end-to-end"
```

---

## Chrome Web Store Upload Checklist

After `pnpm package` succeeds:

- [ ] Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
- [ ] Create new item → upload `build/chrome-mv3-prod.zip`
- [ ] Fill in: name "BrandFilter", short description, detailed description
- [ ] Upload 128x128 PNG icon (`assets/icon.png`)
- [ ] Upload at least 1 screenshot (1280x800 or 640x400)
- [ ] Set category: "Productivity"
- [ ] Submit for review (first review: 1-3 business days)
