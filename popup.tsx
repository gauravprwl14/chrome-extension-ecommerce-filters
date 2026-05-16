import React, { useEffect, useState, useCallback } from 'react'
import type { Config, Site } from './lib/config'
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
      const sessionVal = sessionResult[`applied_${tab.id}`] as unknown
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
