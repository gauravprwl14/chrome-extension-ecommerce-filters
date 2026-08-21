import React, { useMemo, useState } from 'react'
import type { Brand } from '../lib/config'
import { slugifyName } from '../lib/profile-utils'

/**
 * What the panel emits on submit. Either a brand-new profile, or an update to
 * an existing user profile (replace = exact selection, merge = union).
 */
export type CaptureSubmit =
  | { target: 'new'; name: string; icon: string; matchedIds: string[]; promoteStrings: string[] }
  | {
      target: 'update'
      profileId: string
      mode: 'replace' | 'merge'
      matchedIds: string[]
      promoteStrings: string[]
    }

/**
 * Review panel for "create profile from this page". Presentational: it receives
 * the already-reconciled selection (matched master brands + unknown captured
 * strings) and reports the user's choices via onSubmit. New brands are INCLUDED
 * BY DEFAULT (opt-out) and highlighted — including one promotes it to the master
 * library, which is why a future capture shows it as matched (un-highlighted).
 */
export interface CaptureProfilePanelProps {
  /** Captured brands already in the master library (always included). */
  matched: Brand[]
  /** Captured strings not in the library — included by default, untick to drop. */
  unknown: string[]
  /** Pre-filled, de-duplicated profile-name suggestion (new-profile mode). */
  suggestedName: string
  /** Existing profile display names, for the new-profile uniqueness check. */
  takenProfileNames: ReadonlySet<string>
  /** User (isSystem:false) profiles that can be updated. Empty hides update mode. */
  userProfiles: { id: string; name: string; icon: string }[]
  /**
   * When set to a valid user-profile id, pre-targets that profile in update mode.
   * Falls back to new-profile mode if the id isn't in userProfiles.
   */
  defaultUpdateProfileId?: string
  /**
   * When set, locks the panel to one mode and hides the toggle.
   * 'new' = create only; 'update' = update only (Replace/Merge).
   * When absent the panel shows the radio toggle so the user can switch.
   */
  lockedMode?: 'new' | 'update'
  onSubmit: (payload: CaptureSubmit) => void
  onCancel: () => void
}

const ICONS = ['📁', '👕', '👟', '⌚', '👜', '🧥', '👒', '🎽', '🩱', '🕶', '💍']

export function CaptureProfilePanel({
  matched,
  unknown,
  suggestedName,
  takenProfileNames,
  userProfiles,
  defaultUpdateProfileId,
  lockedMode,
  onSubmit,
  onCancel,
}: CaptureProfilePanelProps) {
  const canUpdateExisting = userProfiles.length > 0
  const resolvedDefaultId =
    defaultUpdateProfileId && userProfiles.some((p) => p.id === defaultUpdateProfileId)
      ? defaultUpdateProfileId
      : null

  // Internal toggle state — only used when lockedMode is absent.
  const [target, setTarget] = useState<'new' | 'update'>(resolvedDefaultId ? 'update' : 'new')
  const [updateId, setUpdateId] = useState(resolvedDefaultId ?? userProfiles[0]?.id ?? '')
  const [name, setName] = useState(suggestedName)
  const [icon, setIcon] = useState(ICONS[0]!)
  // New brands default ON — track the ones the user has UN-ticked (excluded).
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set())

  // When lockedMode is provided it takes precedence over internal state.
  const effectiveTarget = lockedMode ?? target

  const matchedIds = useMemo(() => matched.map((b) => b.id), [matched])
  const promoteStrings = useMemo(() => unknown.filter((u) => !excluded.has(u)), [unknown, excluded])
  const hasBrands = matched.length + promoteStrings.length > 0

  const trimmedName = name.trim()
  const nameError = useMemo(() => {
    if (trimmedName.length === 0) return 'Name is required.'
    if (!slugifyName(trimmedName)) return 'Name must contain letters or numbers.'
    if (takenProfileNames.has(trimmedName)) return 'A profile with this name already exists.'
    return null
  }, [trimmedName, takenProfileNames])

  const canSaveNew = !nameError && hasBrands
  const canUpdate = !!updateId && hasBrands

  const toggle = (value: string) =>
    setExcluded((prev) => {
      const next = new Set(prev)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return next
    })

  const submitNew = () => {
    if (canSaveNew) onSubmit({ target: 'new', name: trimmedName, icon, matchedIds, promoteStrings })
  }
  const submitUpdate = (mode: 'replace' | 'merge') => {
    if (canUpdate)
      onSubmit({ target: 'update', profileId: updateId, mode, matchedIds, promoteStrings })
  }

  const radio = (value: 'new' | 'update', label: string) => (
    <label
      style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, cursor: 'pointer' }}
    >
      <input
        type="radio"
        name="capture-target"
        aria-label={label}
        checked={target === value}
        onChange={() => setTarget(value)}
      />
      {label}
    </label>
  )

  // For the update header: show which profile we're targeting.
  const updateProfile = userProfiles.find((p) => p.id === updateId)

  const header =
    lockedMode === 'update'
      ? `Update ${updateProfile?.icon ?? ''} ${updateProfile?.name ?? 'profile'}`.trim()
      : 'Create profile from this page'

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
      <div style={{ fontWeight: 600, fontSize: 12 }}>{header}</div>

      {/* Toggle — only shown when not locked and user has editable profiles */}
      {!lockedMode && canUpdateExisting && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {radio('new', 'Create new profile')}
          {radio('update', 'Update existing profile')}
          {target === 'update' && (
            <select
              aria-label="Profile to update"
              value={updateId}
              onChange={(e) => setUpdateId(e.target.value)}
              style={{
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: 6,
                padding: '5px 8px',
                color: '#e2e8f0',
                fontSize: 11,
              }}
            >
              {userProfiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.icon} {p.name}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* New-profile name + icon */}
      {effectiveTarget === 'new' && (
        <>
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
        </>
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

      {/* Unknown brands — included by default, untick to drop */}
      {unknown.length > 0 && (
        <div data-testid="capture-unknown">
          <div style={{ fontSize: 10, color: '#fbbf24', marginBottom: 4 }}>
            {unknown.length} new brand{unknown.length === 1 ? '' : 's'} — included &amp; added to
            your library (untick to skip)
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
                  checked={!excluded.has(value)}
                  onChange={() => toggle(value)}
                />
                {value}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      {effectiveTarget === 'new' ? (
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            onClick={submitNew}
            disabled={!canSaveNew}
            style={primaryBtn(canSaveNew)}
          >
            Save profile
          </button>
          <button type="button" onClick={onCancel} style={ghostBtn}>
            Cancel
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            onClick={() => submitUpdate('replace')}
            disabled={!canUpdate}
            style={primaryBtn(canUpdate)}
          >
            Replace
          </button>
          <button
            type="button"
            onClick={() => submitUpdate('merge')}
            disabled={!canUpdate}
            style={{ ...ghostBtn, opacity: canUpdate ? 1 : 0.5 }}
          >
            Merge
          </button>
          <button type="button" onClick={onCancel} style={ghostBtn}>
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}

function primaryBtn(enabled: boolean): React.CSSProperties {
  return {
    flex: 1,
    background: enabled ? '#6366f1' : '#334155',
    border: 'none',
    color: enabled ? 'white' : '#64748b',
    padding: 8,
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 600,
    cursor: enabled ? 'pointer' : 'not-allowed',
  }
}

const ghostBtn: React.CSSProperties = {
  background: '#1e293b',
  border: '1px solid #334155',
  color: '#94a3b8',
  padding: '8px 12px',
  borderRadius: 6,
  fontSize: 11,
  cursor: 'pointer',
}
