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

beforeEach(() => {
  Object.keys(mockStorage).forEach((k) => delete mockStorage[k])
  Object.keys(mockSession).forEach((k) => delete mockSession[k])
  vi.clearAllMocks()
})
