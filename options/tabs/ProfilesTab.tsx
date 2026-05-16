import React, { useState } from 'react'
import type { Brand, Profile } from '../../lib/config'
import { BrandMultiSelect } from '../../components/BrandMultiSelect'

interface Props {
  profiles: Profile[]
  brands: Brand[]
  onAdd: (profile: Profile) => void
  onUpdate: (profile: Profile) => void
  onDelete: (profileId: string) => void
  onAddBrand: (name: string) => Brand
}

const ICONS = ['👕', '👟', '⌚', '👜', '🧥', '👒', '🎽', '🩱', '🕶', '💍']

export function ProfilesTab({ profiles, brands, onAdd, onUpdate, onDelete, onAddBrand }: Props) {
  const [editing, setEditing] = useState<Profile | null>(null)
  const [creating, setCreating] = useState(false)

  const startCreate = () => {
    setCreating(true)
    setEditing({ id: '', name: '', icon: ICONS[0]!, brandIds: [] })
  }

  const saveNew = () => {
    if (!editing?.name.trim()) return
    const id = editing.name
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/^-+|-+$/g, '')
    if (!id || profiles.some((p) => p.id === id)) return
    onAdd({ ...editing, id })
    setCreating(false)
    setEditing(null)
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <div>
          <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Profiles</h2>
          <p style={{ fontSize: 11, color: '#64748b' }}>
            Named subsets of your master brands. Assign one as default per site.
          </p>
        </div>
        <button
          onClick={startCreate}
          style={{
            background: '#6366f1',
            border: 'none',
            color: 'white',
            padding: '7px 14px',
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          + New Profile
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {profiles.map((profile) => (
          <div
            key={profile.id}
            style={{
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: 10,
              padding: 14,
            }}
          >
            {editing?.id === profile.id ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  {ICONS.map((icon) => (
                    <button
                      key={icon}
                      onClick={() => setEditing((e) => e && { ...e, icon })}
                      style={{
                        background: editing.icon === icon ? '#6366f1' : '#0f172a',
                        border: 'none',
                        borderRadius: 4,
                        padding: 4,
                        fontSize: 16,
                        cursor: 'pointer',
                      }}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
                <input
                  value={editing.name}
                  onChange={(e) => setEditing((ed) => ed && { ...ed, name: e.target.value })}
                  style={{
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: 6,
                    padding: '6px 10px',
                    color: '#e2e8f0',
                    fontSize: 12,
                  }}
                />
                <BrandMultiSelect
                  allBrands={brands}
                  selectedIds={editing.brandIds}
                  onChange={(brandIds) => setEditing((ed) => ed && { ...ed, brandIds })}
                  onAddBrand={(name) => {
                    const b = onAddBrand(name)
                    setEditing((ed) => ed && { ...ed, brandIds: [...ed.brandIds, b.id] })
                  }}
                />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => {
                      onUpdate(editing)
                      setEditing(null)
                    }}
                    style={{
                      flex: 1,
                      background: '#6366f1',
                      border: 'none',
                      color: 'white',
                      padding: 7,
                      borderRadius: 6,
                      fontSize: 11,
                      cursor: 'pointer',
                    }}
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditing(null)}
                    style={{
                      background: '#1e293b',
                      border: '1px solid #334155',
                      color: '#94a3b8',
                      padding: 7,
                      borderRadius: 6,
                      fontSize: 11,
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 20 }}>{profile.icon}</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{profile.name}</div>
                    <div style={{ fontSize: 10, color: '#64748b' }}>
                      {profile.brandIds.length} brands
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
                  {brands
                    .filter((b) => profile.brandIds.includes(b.id))
                    .map((b) => (
                      <span
                        key={b.id}
                        style={{
                          background: '#0f172a',
                          color: '#94a3b8',
                          padding: '3px 9px',
                          borderRadius: 10,
                          fontSize: 10,
                        }}
                      >
                        {b.name}
                      </span>
                    ))}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => setEditing(profile)}
                    style={{
                      flex: 1,
                      background: '#1e293b',
                      border: '1px solid #334155',
                      color: '#94a3b8',
                      padding: 7,
                      borderRadius: 6,
                      fontSize: 11,
                      cursor: 'pointer',
                    }}
                  >
                    ✏️ Edit
                  </button>
                  <button
                    onClick={() => onDelete(profile.id)}
                    style={{
                      background: '#1e293b',
                      border: '1px solid #334155',
                      color: '#94a3b8',
                      padding: 7,
                      borderRadius: 6,
                      fontSize: 11,
                      cursor: 'pointer',
                    }}
                  >
                    🗑
                  </button>
                </div>
              </>
            )}
          </div>
        ))}

        {creating && editing?.id === '' && (
          <div
            style={{
              background: '#1e293b',
              border: '1px solid #6366f1',
              borderRadius: 10,
              padding: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', gap: 6 }}>
              {ICONS.map((icon) => (
                <button
                  key={icon}
                  onClick={() => setEditing((e) => e && { ...e, icon })}
                  style={{
                    background: editing.icon === icon ? '#6366f1' : '#0f172a',
                    border: 'none',
                    borderRadius: 4,
                    padding: 4,
                    fontSize: 16,
                    cursor: 'pointer',
                  }}
                >
                  {icon}
                </button>
              ))}
            </div>
            <input
              value={editing.name}
              onChange={(e) => setEditing((ed) => ed && { ...ed, name: e.target.value })}
              placeholder="Profile name…"
              style={{
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: 6,
                padding: '6px 10px',
                color: '#e2e8f0',
                fontSize: 12,
              }}
            />
            <BrandMultiSelect
              allBrands={brands}
              selectedIds={editing.brandIds}
              onChange={(brandIds) => setEditing((ed) => ed && { ...ed, brandIds })}
              onAddBrand={(name) => {
                const b = onAddBrand(name)
                setEditing((ed) => ed && { ...ed, brandIds: [...ed.brandIds, b.id] })
              }}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={saveNew}
                style={{
                  flex: 1,
                  background: '#6366f1',
                  border: 'none',
                  color: 'white',
                  padding: 7,
                  borderRadius: 6,
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                Create
              </button>
              <button
                onClick={() => {
                  setCreating(false)
                  setEditing(null)
                }}
                style={{
                  background: '#1e293b',
                  border: '1px solid #334155',
                  color: '#94a3b8',
                  padding: 7,
                  borderRadius: 6,
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
