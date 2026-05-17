# BrandFilter

> Auto-apply your favourite brand filters on Indian e-commerce sites.
> Zero clicks, every time you land on a listing page.

A Chrome (Manifest V3) extension that watches for Myntra and Ajio
listing-page navigations and applies a profile of preferred brand
filters automatically. Built with Plasmo, React 18, TypeScript strict.
No backend, no telemetry, no account — all data lives in
`chrome.storage.local` on your machine.

```
┌────────────────────────────────────────────────────────────────┐
│  myntra.com/mens-tshirts                              ☆  ⋮     │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ✔ Tommy Hilfiger   ✔ Calvin Klein   ✔ Levi's   ✔ H&M    ...   │
│                                                                │
│  ← these were auto-applied the moment you opened the tab       │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## Status

|                          |                                                            |
| ------------------------ | ---------------------------------------------------------- |
| **Version**              | V0 (R&D)                                                   |
| **Built-in adapters**    | Myntra · Ajio                                              |
| **Teach-mode allowlist** | TataCliq · Flipkart · Amazon.in · Nykaa Fashion · Snapdeal |
| **Browser**              | Chrome 114+ (MV3)                                          |
| **Tests**                | 169 / 169 passing (~5 s suite)                             |
| **Bundle size**          | <500 KB zipped                                             |

---

## Quick start (for users)

1. Clone the repo and run `pnpm install` then `pnpm build`.
2. In Chrome, open `chrome://extensions`, enable **Developer mode**
   (top right), click **Load unpacked**, select
   `build/chrome-mv3-prod/`.
3. The options page opens automatically with 183 brands pre-seeded
   into a "My Brands" profile and a curated "Watches" profile.
4. Pin the BrandFilter icon, visit `myntra.com/mens-tshirts` or
   `ajio.com/s/clothing-...`, watch your brands apply in one
   navigation.
5. Open the popup at any time to switch profile, tweak brands, click
   **▶ Apply** to push the current profile to the page, or **✕ Off**
   to disable for the rest of the tab's session.

(A Chrome Web Store release is not currently planned for V0.)

---

## Quick start (for developers)

```bash
pnpm install            # install deps (pnpm only — not npm/yarn)
pnpm dev                # Plasmo hot-reload dev build
                        # then in Chrome: load build/chrome-mv3-dev/
pnpm build              # production build → build/chrome-mv3-prod/
pnpm package            # zip → build/chrome-mv3-prod.zip

pnpm test               # vitest run (one-shot)
pnpm test:watch         # vitest watch mode (for TDD)
pnpm typecheck          # tsc --noEmit (strict)
pnpm lint               # eslint + prettier --check
```

**Before every commit, run the trio:**

```bash
pnpm test && pnpm typecheck && pnpm lint
```

---

## Documentation map

The docs are layered from short → long. Start at the top and go
deeper as needed.

| Doc                                                                        | When to read                                                                                                     |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| [README.md](README.md)                                                     | You are here. The 60-second overview.                                                                            |
| [CLAUDE.md](CLAUDE.md)                                                     | Before editing any code. The 10 numbered rules you must never break, each linked to its regression test.         |
| [docs/KT.md](docs/KT.md)                                                   | Joining the project. ~600-line knowledge-transfer doc covering everything from the repo tour to bug archaeology. |
| [docs/PRD.md](docs/PRD.md)                                                 | Product framing: what the extension is supposed to do, acceptance criteria, success metrics.                     |
| [docs/BRD.md](docs/BRD.md)                                                 | Business framing: requirements, constraints, risks, decommissioning plan.                                        |
| [docs/workflows/architecture.md](docs/workflows/architecture.md)           | Component diagram, data-flow diagrams, adapter pattern, file dependency graph.                                   |
| [docs/workflows/sequence-diagrams.md](docs/workflows/sequence-diagrams.md) | 10 mermaid sequence diagrams — one per user-facing flow.                                                         |

---

## How it works in 30 seconds

```
User navigates to myntra.com/mens-watches
            │
            ▼
chrome.tabs.onUpdated  →  background.ts  →  handleAutoApply()
            │
            ▼
session flag stamped BEFORE sendMessage (rule #3 — prevents apply-loop)
            │
            ▼
sendMessage(applyProfile)  →  content script ACKs synchronously
            │
            ▼
MyntraAdapter:  scan sidebar + modal → build target URL → ONE navigation
            │
            ▼
?f=Brand:Tommy Hilfiger,Calvin Klein,Levi's,H%26M::Price:500-1000
            │
            ▼
✅ Page lands with every applicable brand filtered. No flicker, no loop.
```

Two adapter strategies, picked per site:

- **Myntra → URL-driven.** Brand clicks on Myntra trigger real top-level
  navigations, so per-click application only ever lands 1–2 brands
  before the content script dies. The adapter scans canonical brand
  names, builds a target URL with the `Brand:` facet (preserving Price,
  Color, Sort, etc.), and performs ONE `window.location.assign()`.
- **Ajio → modal-batched.** Ajio's modal Apply button commits every
  ticked checkbox in a single navigation. Adapter scopes every DOM
  query to the brands `.cat-facets` host (identified by
  `aria-label="brands"`) so multi-facet pages don't accidentally open
  the Category modal.

---

## Common user workflows

Each of these has a sequence diagram in
[docs/workflows/sequence-diagrams.md](docs/workflows/sequence-diagrams.md)
and a full walkthrough in [docs/KT.md § 7](docs/KT.md#7-user-workflows-how-to-do-common-things-in-the-ui).

- **Add a brand:** Open popup → search → click "+ Add". Brand is
  slugged, added to master library, and ticked in current profile.
- **Create a profile:** Options → Profiles → New profile. Name, icon
  (emoji), pick brands, optionally set as default for a site.
- **Edit a profile:** Open popup, pick profile in dropdown, tick/untick
  brands in the multi-select. Auto-saves.
- **Retire a seeded brand (developer-facing):** Add its id to
  `DEPRECATED_BRAND_IDS` in `lib/seed.ts`. Next service-worker wake
  strips it from every install's master list and every profile.
- **Teach a new site:** Visit an allowlisted host (TataCliq, Flipkart,
  Amazon.in, Nykaa Fashion, Snapdeal) → popup → "Teach this site" →
  click a brand checkbox on the page. The extension infers a CSS
  selector and saves it.

---

## Project layout

```
chrome-extension/
├── assets/default-brands.json   ← 183 seed brands
├── background.ts                ← MV3 service worker (thin shell)
├── popup.tsx                    ← React popup (280×var, dark theme)
├── options.tsx                  ← Options page (4 tabs)
├── contents/                    ← Plasmo content scripts (Myntra, Ajio, teach)
├── components/                  ← React components used by popup + options
├── lib/                         ← All pure / testable logic
│   ├── config.ts                ← types
│   ├── storage.ts               ← chrome.storage.local + sync→local migration
│   ├── seed.ts                  ← bootstrapConfig + WATCHES_PROFILE + deprecation
│   ├── auto-apply.ts            ← orchestration (session-flag-before-send rule)
│   ├── popup-init.ts            ← popup mount-time logic
│   ├── matching.ts              ← brand name matching
│   └── adapters/                ← SiteAdapter + Myntra + Ajio
├── tests/                       ← Vitest suite (169 tests in 12 files)
├── docs/                        ← KT, PRD, BRD, workflows
└── CLAUDE.md                    ← The 10 rules
```

---

## Tech stack

- [Plasmo](https://docs.plasmo.com/) v0.90.5 (build & manifest)
- React 18 + TypeScript 5 (strict, `noUncheckedIndexedAccess`)
- Chrome MV3 (`storage`, `tabs` permissions; narrow `host_permissions`)
- Vitest 4 + jsdom + @testing-library/react
- ESLint v10 (flat config) + Prettier
- pnpm

---

## Contributing

1. Read [CLAUDE.md](CLAUDE.md) — the 10 rules — before opening a PR.
   Each rule is backed by a regression test that will fail loudly if
   you break it.
2. Run `pnpm test && pnpm typecheck && pnpm lint` before every commit.
3. Commits follow [Conventional Commits](https://www.conventionalcommits.org/)
   prefixes (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, `test:`).
   Look at `git log --oneline` for the established style.
4. New site adapters: see
   [docs/KT.md § 10](docs/KT.md#10-adding-support-for-a-new-e-commerce-site)
   for the full checklist.

---

## License

Personal project; not currently licensed for redistribution.
