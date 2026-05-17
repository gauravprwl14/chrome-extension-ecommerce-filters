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
const getLocal = chrome.storage.local.get as any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getSync = chrome.storage.sync.get as any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getSession = chrome.storage.session.get as any

describe('getConfig', () => {
  it('returns DEFAULT_CONFIG when local AND sync are empty', async () => {
    getLocal.mockResolvedValueOnce({})
    getSync.mockResolvedValueOnce({})
    const config = await getConfig()
    expect(config.version).toBe('2')
    expect(config.masterBrands).toEqual([])
  })

  it('returns stored config from local when present', async () => {
    const stored = { ...DEFAULT_CONFIG, version: '2' }
    getLocal.mockResolvedValueOnce({ brandfilter_config: stored })
    const config = await getConfig()
    expect(config.version).toBe('2')
  })

  it('migrates from chrome.storage.sync → local on first read', async () => {
    const legacy = { ...DEFAULT_CONFIG, version: 'legacy-sync' }
    getLocal.mockResolvedValueOnce({})
    getSync.mockResolvedValueOnce({ brandfilter_config: legacy })

    const config = await getConfig()
    expect(config.version).toBe('legacy-sync')
    // Should have copied into local
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ brandfilter_config: legacy })
  })
})

describe('setConfig', () => {
  it('writes config to LOCAL (not sync) under the correct key', async () => {
    const config = { ...DEFAULT_CONFIG }
    await setConfig(config)
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ brandfilter_config: config })
    expect(chrome.storage.sync.set).not.toHaveBeenCalled()
  })
})

describe('ensureBrandInLibrary', () => {
  it('adds brand when not present and returns true', async () => {
    getLocal.mockResolvedValueOnce({ brandfilter_config: { ...DEFAULT_CONFIG } })
    const added = await ensureBrandInLibrary({ id: 'nike', name: 'Nike' })
    expect(added).toBe(true)
    expect(chrome.storage.local.set).toHaveBeenCalled()
  })

  it('skips brand already in library and returns false', async () => {
    getLocal.mockResolvedValueOnce({
      brandfilter_config: {
        ...DEFAULT_CONFIG,
        masterBrands: [{ id: 'nike', name: 'Nike' }],
      },
    })
    const added = await ensureBrandInLibrary({ id: 'nike', name: 'Nike' })
    expect(added).toBe(false)
    expect(chrome.storage.local.set).not.toHaveBeenCalled()
  })
})

describe('session state helpers', () => {
  it('sets and gets tab session state', async () => {
    getSession.mockResolvedValueOnce({ applied_42: 1747400000000 })
    const state = await getTabSessionState(42)
    expect(state).toBe(1747400000000)
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
