import React, { useRef, useState } from 'react'
import type { Profile } from '../lib/config'
import { useOutsideClick } from '../lib/use-outside-click'

interface Props {
  profiles: Profile[]
  selectedId: string
  onSelect: (profileId: string) => void
}

export function ProfileDropdown({ profiles, selectedId, onSelect }: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  useOutsideClick(rootRef, () => setOpen(false), open)
  const selected = profiles.find((p) => p.id === selectedId)

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
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
          {selected
            ? `${selected.isSystem ? '🔒 ' : ''}${selected.icon} ${selected.name}`
            : 'No profile selected'}
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
                {profile.isSystem && (
                  <span aria-label="Locked" style={{ marginRight: 4 }}>
                    🔒
                  </span>
                )}
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
