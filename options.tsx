import React, { useEffect, useState, useCallback } from 'react'
import type { Config, Brand, Profile } from './lib/config'
import { DEFAULT_CONFIG } from './lib/config'
import { getConfig, setConfig } from './lib/storage'
import {
  bootstrapConfig,
  WATCHES_PROFILE,
  PREMIUM_PROFILE,
  MEDIOCRE_PROFILE,
  BUDGET_PROFILE,
} from './lib/seed'
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
    const profiles = config.profiles.filter((p) => p.id !== profileId)
    // If any site pointed at the deleted profile, fall back to the first
    // remaining system profile (or '' if none survive).
    const fallback = profiles.find((p) => p.isSystem === true)?.id ?? ''
    const sites = config.sites.map((s) =>
      s.defaultProfileId === profileId ? { ...s, defaultProfileId: fallback } : s,
    )
    save({ ...config, profiles, sites })
  }

  const handleAddBrandFromProfile = (name: string): Brand => {
    const id = name
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/^-+|-+$/g, '')
    const brand: Brand = { id: id || 'unknown', name }
    if (!config.masterBrands.some((b) => b.id === brand.id)) {
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

  const handleImport = async (imported: Config) => {
    // Persist the imported shape first, then let bootstrap classify
    // (v1 → v2 migration + isSystem tagging) before any UI consumes it.
    await setConfig(imported)
    await bootstrapConfig(
      defaultBrands as Brand[],
      [WATCHES_PROFILE, PREMIUM_PROFILE, MEDIOCRE_PROFILE, BUDGET_PROFILE],
      getConfig,
      setConfig,
    )
    const migrated = await getConfig()
    setConfigState(migrated)
  }

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
