import { vi } from 'vitest'

/**
 * Chrome storage limits — pinned from
 * https://developer.chrome.com/docs/extensions/reference/api/storage#properties
 * Mocking these as real numbers catches regressions like the
 * "Loading…" hang caused by exceeding the sync per-item quota.
 */
const SYNC_QUOTA_BYTES_PER_ITEM = 8192
const LOCAL_QUOTA_BYTES = 5 * 1024 * 1024

const mockSync: Record<string, unknown> = {}
const mockLocal: Record<string, unknown> = {}
const mockSession: Record<string, unknown> = {}

function byteLen(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length
}

function makeBackend(store: Record<string, unknown>, quota: { perItem?: number; total?: number }) {
  return {
    get: vi.fn(async (key: string) => ({ [key]: store[key] })),
    set: vi.fn(async (obj: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(obj)) {
        if (quota.perItem !== undefined && byteLen(v) > quota.perItem) {
          throw new Error(
            `QUOTA_BYTES_PER_ITEM quota exceeded — item "${k}" is ${byteLen(v)} bytes, limit ${quota.perItem}`,
          )
        }
      }
      if (quota.total !== undefined) {
        const projected = { ...store, ...obj }
        const total = Object.values(projected).reduce<number>((sum, v) => sum + byteLen(v), 0)
        if (total > quota.total) {
          throw new Error(`QUOTA_BYTES quota exceeded — total ${total}, limit ${quota.total}`)
        }
      }
      Object.assign(store, obj)
    }),
    remove: vi.fn(async (key: string) => {
      delete store[key]
    }),
  }
}

global.chrome = {
  storage: {
    sync: makeBackend(mockSync, { perItem: SYNC_QUOTA_BYTES_PER_ITEM }),
    local: makeBackend(mockLocal, { total: LOCAL_QUOTA_BYTES }),
    session: makeBackend(mockSession, {}),
  },
  runtime: {
    onInstalled: { addListener: vi.fn() },
    onStartup: { addListener: vi.fn() },
    onMessage: { addListener: vi.fn() },
    sendMessage: vi.fn(),
    getURL: vi.fn((path: string) => `chrome-extension://test/${path}`),
  },
  tabs: {
    onUpdated: { addListener: vi.fn() },
    sendMessage: vi.fn(),
    query: vi.fn(),
  },
} as unknown as typeof chrome

beforeEach(() => {
  for (const store of [mockSync, mockLocal, mockSession]) {
    Object.keys(store).forEach((k) => delete store[k])
  }
  vi.clearAllMocks()
})
