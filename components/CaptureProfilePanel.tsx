import React, { useMemo, useState } from 'react'
import type { Brand } from '../lib/config'
import { slugifyName } from '../lib/profile-utils'

/**
 * Review panel for "create profile from this page". Presentational: it receives
 * the already-reconciled selection (matched master brands + unknown captured
 * strings) and reports the user's choices back via onSave. All storage writes
 * and the buildCaptureProfile call live in the popup, keeping this component
 * pure and unit-testable (mirrors the codebase's thin-UI / pure-lib split).
 */
export interface CaptureProfilePanelProps {
  /** Captured brands already in the master library (included automatically). */
  matched: Brand[]
  /** Captured strings not in the library — opt-in per brand, OFF by default. */
  unknown: string[]
  /** Pre-filled, de-duplicated profile-name suggestion. */
  suggestedName: string
  /** Existing profile display names, for the uniqueness check. */
  takenProfileNames: ReadonlySet<string>
  onSave: (input: {
    name: string
    icon: string
    matchedIds: string[]
    promoteStrings: string[]
  }) => void
  onCancel: () => void
}

const ICONS = ['📁', '👕', '👟', '⌚', '👜', '🧥', '👒', '🎽', '🩱', '🕶', '💍']

export function CaptureProfilePanel({
  matched,
  unknown,
  suggestedName,
  takenProfileNames,
  onSave,
  onCancel,
}: CaptureProfilePanelProps) {
  const [name, setName] = useState(suggestedName)
  const [icon, setIcon] = useState(ICONS[0]!)
  const [promote, setPromote] = useState<ReadonlySet<string>>(new Set())

  const trimmedName = name.trim()
  const nameError = useMemo(() => {
    if (trimmedName.length === 0) return 'Name is required.'
    if (!slugifyName(trimmedName)) return 'Name must contain letters or numbers.'
    if (takenProfileNames.has(trimmedName)) return 'A profile with this name already exists.'
    return null
  }, [trimmedName, takenProfileNames])

  const promoteStrings = useMemo(() => unknown.filter((u) => promote.has(u)), [unknown, promote])
  const finalCount = matched.length + promoteStrings.length
  const canSubmit = !nameError && finalCount > 0

  const toggle = (value: string) =>
    setPromote((prev) => {
      const next = new Set(prev)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return next
    })

  const handleSave = () => {
    if (!canSubmit) return
    onSave({ name: trimmedName, icon, matchedIds: matched.map((b) => b.id), promoteStrings })
  }

  return (
    <div
      data-testid="capture-panel"
      style={{
        background: '#1e293b',
        border: '1px solid #6366f1',
        borderRadius: 10,
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ fontWeight: 600, fontSize: 12 }}>Create profile from this page</div>

      {/* Icon picker */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {ICONS.map((i) => (
          <button
            key={i}
            type="button"
            aria-label={`Icon ${i}`}
            onClick={() => setIcon(i)}
            style={{
              background: icon === i ? '#6366f1' : '#0f172a',
              border: 'none',
              borderRadius: 4,
              padding: 3,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            {i}
          </button>
        ))}
      </div>

      {/* Name */}
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-label="Profile name"
        placeholder="Profile name…"
        style={{
          width: '100%',
          background: '#0f172a',
          border: '1px solid #334155',
          borderRadius: 6,
          padding: '6px 10px',
          color: '#e2e8f0',
          fontSize: 12,
          boxSizing: 'border-box',
        }}
      />
      {nameError && trimmedName.length > 0 && (
        <div style={{ color: '#fca5a5', fontSize: 10 }}>{nameError}</div>
      )}

      {/* Matched brands */}
      {matched.length > 0 && (
        <div data-testid="capture-matched">
          <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4 }}>
            {matched.length} brand{matched.length === 1 ? '' : 's'} already in your library
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {matched.map((b) => (
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
        </div>
      )}

      {/* Unknown brands — opt-in */}
      {unknown.length > 0 && (
        <div data-testid="capture-unknown">
          <div style={{ fontSize: 10, color: '#fbbf24', marginBottom: 4 }}>
            {unknown.length} new brand{unknown.length === 1 ? '' : 's'} — tick to add to your
            library
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {unknown.map((value) => (
              <label
                key={value}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 11,
                  color: '#e2e8f0',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  aria-label={`Add ${value} to library`}
                  checked={promote.has(value)}
                  onChange={() => toggle(value)}
                />
                {value}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSubmit}
          style={{
            flex: 1,
            background: canSubmit ? '#6366f1' : '#334155',
            border: 'none',
            color: canSubmit ? 'white' : '#64748b',
            padding: 8,
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 600,
            cursor: canSubmit ? 'pointer' : 'not-allowed',
          }}
        >
          Save profile
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{
            background: '#1e293b',
            border: '1px solid #334155',
            color: '#94a3b8',
            padding: '8px 12px',
            borderRadius: 6,
            fontSize: 11,
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
