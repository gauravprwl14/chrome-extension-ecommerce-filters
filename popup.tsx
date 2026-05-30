import React, { useEffect, useState, useCallback, useMemo } from 'react'
import type { Brand, Config, Site } from './lib/config'
import { getConfig, setConfig, ensureBrandInLibrary, getTabSessionState } from './lib/storage'
import { ProfileDropdown } from './components/ProfileDropdown'
import { BrandMultiSelect } from './components/BrandMultiSelect'
import { StatusBar } from './components/StatusBar'
import { CaptureProfilePanel } from './components/CaptureProfilePanel'
import defaultBrands from './assets/default-brands.json'
import { WATCHES_PROFILE, PREMIUM_PROFILE, MEDIOCRE_PROFILE, BUDGET_PROFILE } from './lib/seed'
import { initPopupState } from './lib/popup-init'
import { siteSupportsCapture, buildCaptureProfile } from './lib/capture'
import { captureForPopup, type CaptureForPopupResult } from './lib/popup-capture'

/** User-facing copy for the non-review capture outcomes. */
function captureMessage(result: CaptureForPopupResult): string {
  switch (result.kind) {
    case 'empty':
      return 'No brands selected on this page yet — pick some on the page first.'
    case 'not-filter-page':
      return 'Open a category/listing page, select some brands, then try again.'
    case 'error':
      return "Couldn't read this page. Reload it and try again."
    default:
      return ''
  }
}

type PopupStatus = 'applied' | 'not-applied' | 'off' | 'unsupported'

export default function Popup() {
  const [config, setConfigState] = useState<Config | null>(null)
  const [currentSite, setCurrentSite] = useState<Site | null>(null)
  const [selectedProfileId, setSelectedProfileId] = useState('')
  const [status, setStatus] = useState<PopupStatus>('not-applied')
  const [appliedAt, setAppliedAt] = useState<number>()
  const [tabId, setTabId] = useState<number>()
  const [initError, setInitError] = useState<string | null>(null)
  const [capturing, setCapturing] = useState(false)
  const [captureResult, setCaptureResult] = useState<CaptureForPopupResult | null>(null)

  useEffect(() => {
    ;(async () => {
      const result = await initPopupState({
        queryActiveTab: async () => {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
          return tab
        },
        getConfig,
        setConfig,
        getTabSession: getTabSessionState,
        seedBrands: defaultBrands as Brand[],
        seedProfiles: [WATCHES_PROFILE, PREMIUM_PROFILE, MEDIOCRE_PROFILE, BUDGET_PROFILE],
      })

      if (!result.ok) {
        console.error('[BrandFilter] popup init failed:', result.error)
        setInitError(result.error)
        return
      }

      setTabId(result.tabId)
      setConfigState(result.config)
      setCurrentSite(result.currentSite)

      if (!result.currentSite) {
        setStatus('unsupported')
        return
      }
      setSelectedProfileId(result.currentSite.defaultProfileId)
      if (result.session.kind === 'off') setStatus('off')
      else if (result.session.kind === 'applied') {
        setStatus('applied')
        setAppliedAt(result.session.appliedAt)
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
        .replace(/^-+|-+$/g, '') // strip leading/trailing hyphens
      if (!id) return // bail if name produces empty slug
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

  const supportsCapture = !!currentSite && siteSupportsCapture(currentSite.id)

  // A pre-filled, de-duplicated name suggestion, e.g. "Myntra picks".
  const suggestedCaptureName = useMemo(() => {
    if (!currentSite) return 'My picks'
    const base = `${currentSite.id.charAt(0).toUpperCase()}${currentSite.id.slice(1)} picks`
    const names = new Set(config?.profiles.map((p) => p.name) ?? [])
    if (!names.has(base)) return base
    let n = 2
    while (names.has(`${base} ${n}`)) n++
    return `${base} ${n}`
  }, [currentSite, config])

  const handleStartCapture = useCallback(async () => {
    if (!tabId || !config) return
    setCapturing(true)
    const result = await captureForPopup({
      tabId,
      masterBrands: config.masterBrands,
      sendCaptureMessage: (id) => chrome.tabs.sendMessage(id, { action: 'captureSelection' }),
    })
    setCapturing(false)
    setCaptureResult(result)
  }, [tabId, config])

  const handleCaptureSave = useCallback(
    async (input: {
      name: string
      icon: string
      matchedIds: string[]
      promoteStrings: string[]
    }) => {
      if (!config) return
      const updated = buildCaptureProfile(config, input)
      setConfigState(updated)
      await setConfig(updated)
      // Select the freshly-created profile (appended last by buildCaptureProfile).
      const created = updated.profiles[updated.profiles.length - 1]
      if (created) setSelectedProfileId(created.id)
      setCaptureResult(null)
    },
    [config],
  )

  if (initError)
    return (
      <div style={{ padding: 16, color: '#fca5a5', fontSize: 12, width: 280 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>BrandFilter failed to load</div>
        <div style={{ color: '#94a3b8', fontSize: 11 }}>{initError}</div>
      </div>
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
        ) : config.profiles.length === 0 ? (
          <>
            <p style={{ fontSize: 11, color: '#64748b', margin: 0, lineHeight: 1.6 }}>
              No profiles yet. Open Settings to create your first profile and assign brands.
            </p>
            <button
              onClick={() => chrome.runtime.openOptionsPage()}
              style={{
                width: '100%',
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
              ⚙ Open Settings →
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

            {supportsCapture && (
              <div style={{ borderTop: '1px solid #334155', paddingTop: 10, marginTop: 2 }}>
                {captureResult?.kind === 'review' ? (
                  <CaptureProfilePanel
                    matched={captureResult.matched}
                    unknown={captureResult.unknown}
                    suggestedName={suggestedCaptureName}
                    takenProfileNames={new Set(config.profiles.map((p) => p.name))}
                    onSave={handleCaptureSave}
                    onCancel={() => setCaptureResult(null)}
                  />
                ) : (
                  <>
                    <button
                      onClick={handleStartCapture}
                      disabled={capturing}
                      style={{
                        width: '100%',
                        background: '#1e293b',
                        border: '1px solid #334155',
                        color: '#a5b4fc',
                        padding: 8,
                        borderRadius: 8,
                        fontSize: 11,
                        cursor: capturing ? 'default' : 'pointer',
                      }}
                    >
                      {capturing ? 'Reading page…' : '＋ Create profile from this page'}
                    </button>
                    {captureResult && (
                      <div
                        style={{ fontSize: 10, color: '#94a3b8', marginTop: 6, lineHeight: 1.5 }}
                      >
                        {captureMessage(captureResult)}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
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
