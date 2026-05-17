import React, { useMemo, useRef, useState } from 'react'
import type { Brand } from '../../lib/config'
import { searchBrands } from '../../lib/brand-search'
import { useOutsideClick } from '../../lib/use-outside-click'
import { slugifyName } from '../../lib/profile-utils'

interface Props {
  allBrands: Brand[]
  selectedIds: string[]
  onChange: (selectedIds: string[]) => void
  /** Promote a typed name to masterBrands. Returns the created Brand. */
  onAddBrand: (name: string) => Brand
}

export function BrandPicker({ allBrands, selectedIds, onChange, onAddBrand }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  useOutsideClick(rootRef, () => setOpen(false), open)

  const filtered = useMemo(() => searchBrands(allBrands, query), [allBrands, query])
  const trimmed = query.trim()
  const exactMatch = useMemo(
    () => allBrands.some((b) => b.name.toLowerCase() === trimmed.toLowerCase()),
    [allBrands, trimmed],
  )
  const slug = slugifyName(trimmed)
  const showAdd = trimmed.length > 0 && !exactMatch && slug.length > 0

  const toggle = (id: string) =>
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id])

  const handleAdd = () => {
    if (!showAdd) return
    const created = onAddBrand(trimmed)
    if (created && !selectedIds.includes(created.id)) onChange([...selectedIds, created.id])
    setQuery('')
  }

  const selectedCount = selectedIds.length
  const preview = allBrands
    .filter((b) => selectedIds.includes(b.id))
    .slice(0, 2)
    .map((b) => b.name)
    .join(', ')
  const previewLabel =
    selectedCount > 2 ? `${preview} +${selectedCount - 2}` : preview || 'None selected'

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          width: '100%',
          background: '#1e293b',
          border: `1px solid ${open ? '#6366f1' : '#334155'}`,
          borderRadius: open ? '8px 8px 0 0' : 8,
          padding: '8px 12px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          color: '#94a3b8',
          fontSize: 11,
        }}
      >
        <span>
          {selectedCount > 0 && (
            <span style={{ color: '#6366f1', fontWeight: 600, marginRight: 6 }}>
              {selectedCount}
            </span>
          )}
          {previewLabel}
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
            zIndex: 20,
            border: '1px solid #6366f1',
            borderTop: 'none',
            borderRadius: '0 0 8px 8px',
            background: '#1e293b',
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: 8, borderBottom: '1px solid #334155' }}>
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (filtered.length > 0) {
                    toggle(filtered[0]!.id)
                  } else if (showAdd) {
                    handleAdd()
                  }
                }
              }}
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
          <div style={{ maxHeight: 200, overflowY: 'auto' }}>
            {filtered.map((brand) => {
              const checked = selectedIds.includes(brand.id)
              return (
                <button
                  key={brand.id}
                  type="button"
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
                  <span
                    style={{
                      width: 13,
                      height: 13,
                      borderRadius: 3,
                      flexShrink: 0,
                      background: checked ? '#6366f1' : 'transparent',
                      border: checked ? 'none' : '1px solid #475569',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {checked && (
                      <span style={{ color: 'white', fontSize: 9, fontWeight: 700 }}>✓</span>
                    )}
                  </span>
                  {brand.name}
                </button>
              )
            })}

            {showAdd && (
              <button
                type="button"
                onClick={handleAdd}
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
                  textAlign: 'left',
                }}
              >
                + Add &ldquo;{trimmed}&rdquo; to master brands
              </button>
            )}

            {!showAdd && filtered.length === 0 && (
              <div style={{ padding: '10px 12px', color: '#64748b', fontSize: 11 }}>
                No matches.
              </div>
            )}
          </div>
          <div
            style={{
              padding: '6px 12px',
              borderTop: '1px solid #334155',
              display: 'flex',
              gap: 12,
            }}
          >
            <button
              type="button"
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
              type="button"
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
