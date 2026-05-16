import { describe, it, expect } from 'vitest'
import {
  getConfig,
  setConfig,
  ensureBrandInLibrary,
  getTabSessionState,
  clearTabSessionState,
} from '../lib/storage'
import { DEFAULT_CONFIG } from '../lib/config'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getStorage = chrome.storage.sync.get as any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getSession = chrome.storage.session.get as any

describe('getConfig', () => {
  it('returns DEFAULT_CONFIG when storage is empty', async () => {
    getStorage.mockResolvedValueOnce({})
    const config = await getConfig()
    expect(config.version).toBe('1')
    expect(config.masterBrands).toEqual([])
  })

  it('returns stored config when present', async () => {
    const stored = { ...DEFAULT_CONFIG, version: '2' }
    getStorage.mockResolvedValueOnce({
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
    getStorage.mockResolvedValueOnce({
      brandfilter_config: { ...DEFAULT_CONFIG },
    })
    const added = await ensureBrandInLibrary({ id: 'nike', name: 'Nike' })
    expect(added).toBe(true)
    expect(chrome.storage.sync.set).toHaveBeenCalled()
  })

  it('skips brand already in library and returns false', async () => {
    getStorage.mockResolvedValueOnce({
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
    getSession.mockResolvedValueOnce({
      applied_42: true,
    })
    const state = await getTabSessionState(42)
    expect(state).toBe(true)
  })

  it('returns null when no state set', async () => {
    getSession.mockResolvedValueOnce({})
    const state = await getTabSessionState(99)
    expect(state).toBeNull()
  })

  it('clears tab session state', async () => {
    await clearTabSessionState(42)
    expect(chrome.storage.session.remove).toHaveBeenCalledWith('applied_42')
  })
})
