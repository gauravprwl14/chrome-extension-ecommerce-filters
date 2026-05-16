import React, { useState } from 'react'
import type { Brand, Profile } from '../../lib/config'

interface Props {
  brands: Brand[]
  profiles: Profile[]
  onAdd: (brand: Brand) => void
  onDelete: (brandId: string) => void
}

export function MasterBrandsTab({ brands, profiles, onAdd, onDelete }: Props) {
  const [search, setSearch] = useState('')
  const [newName, setNewName] = useState('')

  const profilesForBrand = (brandId: string) => profiles.filter((p) => p.brandIds.includes(brandId))

  const filtered = brands.filter((b) => b.name.toLowerCase().includes(search.toLowerCase()))

  const handleAdd = () => {
    const name = newName.trim()
    if (!name) return
    const id = name
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/^-+|-+$/g, '')
    if (!id || brands.some((b) => b.id === id)) return
    onAdd({ id, name })
    setNewName('')
  }

  return (
    <div>
      <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Master Brand Library</h2>
      <p style={{ fontSize: 11, color: '#64748b', marginBottom: 16 }}>
        All brands available across profiles. Adding a brand to any profile auto-adds it here.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search brands…"
          style={{
            flex: 1,
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: 6,
            padding: '7px 10px',
            color: '#e2e8f0',
            fontSize: 11,
          }}
        />
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New brand name…"
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          style={{
            flex: 1,
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: 6,
            padding: '7px 10px',
            color: '#e2e8f0',
            fontSize: 11,
          }}
        />
        <button
          onClick={handleAdd}
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
          + Add
        </button>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {['Brand Name', 'Used in Profiles', ''].map((h) => (
              <th
                key={h}
                style={{
                  textAlign: 'left',
                  fontSize: 9,
                  color: '#475569',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  padding: '0 10px 8px',
                  borderBottom: '1px solid #1e293b',
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtered.map((brand) => {
            const usedIn = profilesForBrand(brand.id)
            return (
              <tr key={brand.id} style={{ borderBottom: '1px solid #0f172a' }}>
                <td style={{ padding: '9px 10px', fontWeight: 500, fontSize: 12 }}>{brand.name}</td>
                <td style={{ padding: '9px 10px' }}>
                  {usedIn.length > 0 ? (
                    usedIn.map((p) => (
                      <span
                        key={p.id}
                        style={{
                          display: 'inline-block',
                          background: 'rgba(99,102,241,0.15)',
                          color: '#a5b4fc',
                          padding: '2px 8px',
                          borderRadius: 10,
                          fontSize: 10,
                          marginRight: 4,
                        }}
                      >
                        {p.icon} {p.name}
                      </span>
                    ))
                  ) : (
                    <span style={{ color: '#475569', fontStyle: 'italic', fontSize: 11 }}>
                      Not in any profile
                    </span>
                  )}
                </td>
                <td style={{ padding: '9px 10px', textAlign: 'right' }}>
                  <button
                    onClick={() => onDelete(brand.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#475569',
                      cursor: 'pointer',
                      fontSize: 13,
                    }}
                  >
                    🗑
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div style={{ marginTop: 10, fontSize: 10, color: '#475569' }}>
        {brands.length} brands · {brands.filter((b) => profilesForBrand(b.id).length === 0).length}{' '}
        not assigned
      </div>
    </div>
  )
}
