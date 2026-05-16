import React, { useState, useMemo } from 'react'
import type { Brand } from '../lib/config'

interface Props {
  allBrands: Brand[]
  selectedIds: string[]
  onChange: (selectedIds: string[]) => void
  onAddBrand: (name: string) => void
}

export function BrandMultiSelect({ allBrands, selectedIds, onChange, onAddBrand }: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return allBrands
    return allBrands.filter((b) => b.name.toLowerCase().includes(q))
  }, [allBrands, search])

  const selectedCount = selectedIds.length
  const preview = allBrands
    .filter((b) => selectedIds.includes(b.id))
    .slice(0, 2)
    .map((b) => b.name)
    .join(', ')
  const previewLabel =
    selectedCount > 2 ? `${preview} +${selectedCount - 2}` : preview || 'None selected'

  const toggle = (id: string) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter((i) => i !== id) : [...selectedIds, id])
  }

  const showAddOption =
    search.trim() && !allBrands.some((b) => b.name.toLowerCase() === search.toLowerCase().trim())

  return (
    <div style={{ position: 'relative' }}>
      <div
        style={{
          fontSize: 9,
          color: '#64748b',
          textTransform: 'uppercase',
          letterSpacing: '0.6px',
          marginBottom: 5,
        }}
      >
        Brands{' '}
        {selectedCount > 0 && (
          <span style={{ color: '#6366f1', fontWeight: 600 }}>{selectedCount} selected</span>
        )}
      </div>

      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%',
          background: '#1e293b',
          border: `1px solid ${open ? '#6366f1' : '#334155'}`,
          borderRadius: open ? '8px 8px 0 0' : 8,
          padding: '9px 12px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          color: '#94a3b8',
          fontSize: 11,
        }}
      >
        <span>{previewLabel}</span>
        <span style={{ color: '#64748b', fontSize: 10 }}>{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div
          style={{
            border: '1px solid #6366f1',
            borderTop: 'none',
            borderRadius: '0 0 8px 8px',
            background: '#1e293b',
            overflow: 'hidden',
          }}
        >
          {/* Search */}
          <div style={{ padding: 8, borderBottom: '1px solid #334155' }}>
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search brands…"
              style={{
                width: '100%',
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: 6,
                padding: '5px 10px',
                color: '#e2e8f0',
                fontSize: 11,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Brand list */}
          <div style={{ maxHeight: 150, overflowY: 'auto' }}>
            {filtered.map((brand) => {
              const checked = selectedIds.includes(brand.id)
              return (
                <button
                  key={brand.id}
                  onClick={() => toggle(brand.id)}
                  style={{
                    width: '100%',
                    padding: '7px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    background: checked ? '#1c2a3a' : 'transparent',
                    border: 'none',
                    borderTop: '1px solid #334155',
                    cursor: 'pointer',
                    color: '#e2e8f0',
                    fontSize: 11,
                    textAlign: 'left',
                  }}
                >
                  <div
                    style={{
                      width: 13,
                      height: 13,
                      borderRadius: 3,
                      flexShrink: 0,
                      background: checked ? '#6366f1' : 'transparent',
                      border: checked ? 'none' : '1px solid #475569',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {checked && (
                      <span style={{ color: 'white', fontSize: 9, fontWeight: 700 }}>✓</span>
                    )}
                  </div>
                  {brand.name}
                </button>
              )
            })}

            {showAddOption && (
              <button
                onClick={() => {
                  onAddBrand(search.trim())
                  setSearch('')
                }}
                style={{
                  width: '100%',
                  padding: '7px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: 'transparent',
                  border: 'none',
                  borderTop: '1px solid #334155',
                  cursor: 'pointer',
                  color: '#6366f1',
                  fontSize: 11,
                }}
              >
                + Add "{search.trim()}" to library
              </button>
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: '6px 12px',
              borderTop: '1px solid #334155',
              display: 'flex',
              gap: 12,
            }}
          >
            <button
              onClick={() => onChange(allBrands.map((b) => b.id))}
              style={{
                background: 'none',
                border: 'none',
                color: '#6366f1',
                cursor: 'pointer',
                fontSize: 10,
                padding: 0,
              }}
            >
              Select all
            </button>
            <button
              onClick={() => onChange([])}
              style={{
                background: 'none',
                border: 'none',
                color: '#64748b',
                cursor: 'pointer',
                fontSize: 10,
                padding: 0,
              }}
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
