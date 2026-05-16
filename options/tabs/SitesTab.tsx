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
        {sites.map((site) => (
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
        ))}

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
