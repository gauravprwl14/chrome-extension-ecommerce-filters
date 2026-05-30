import React, { useMemo, useState } from 'react'
import type { Brand, Profile } from '../../lib/config'
import { BrandPicker } from '../components/BrandPicker'
import { DuplicateConfirmModal } from '../components/DuplicateConfirmModal'
import { generateCloneName, generateUniqueProfileId, slugifyName } from '../../lib/profile-utils'

interface Props {
  profiles: Profile[]
  brands: Brand[]
  onAdd: (profile: Profile) => void
  onUpdate: (profile: Profile) => void
  onDelete: (profileId: string) => void
  onAddBrand: (name: string) => Brand
}

const ICONS = ['📁', '👕', '👟', '⌚', '👜', '🧥', '👒', '🎽', '🩱', '🕶', '💍']

export function ProfilesTab({ profiles, brands, onAdd, onUpdate, onDelete, onAddBrand }: Props) {
  const [creating, setCreating] = useState(false)
  const [duplicating, setDuplicating] = useState<Profile | null>(null)

  const taken = useMemo(
    () => ({
      ids: new Set(profiles.map((p) => p.id)),
      names: new Set(profiles.map((p) => p.name)),
    }),
    [profiles],
  )

  // System profiles first, then user profiles, each in insertion order.
  const sortedProfiles = useMemo(() => {
    const system = profiles.filter((p) => p.isSystem === true)
    const user = profiles.filter((p) => p.isSystem !== true)
    return [...system, ...user]
  }, [profiles])

  const handleDuplicate = (profile: Profile) => {
    const name = generateCloneName(profile.name, taken.names)
    const id = generateUniqueProfileId(name, taken.ids)
    if (!id) return
    onAdd({
      id,
      name,
      icon: profile.icon,
      brandIds: [...profile.brandIds],
      isSystem: false,
    })
    setDuplicating(null)
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
            Named subsets of your master brands. Default (🔒 locked) profiles ship with the
            extension — duplicate them to make your own.
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
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
          + New profile
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {sortedProfiles.map((profile) =>
          profile.isSystem === true ? (
            <SystemProfileCard
              key={profile.id}
              profile={profile}
              brands={brands}
              onDuplicate={() => setDuplicating(profile)}
            />
          ) : (
            <UserProfileCard
              key={profile.id}
              profile={profile}
              brands={brands}
              onUpdate={onUpdate}
              onDelete={() => onDelete(profile.id)}
              onAddBrand={onAddBrand}
            />
          ),
        )}

        {creating && (
          <CreateProfileForm
            brands={brands}
            takenIds={taken.ids}
            takenNames={taken.names}
            onCancel={() => setCreating(false)}
            onCreate={(p) => {
              onAdd(p)
              setCreating(false)
            }}
            onAddBrand={onAddBrand}
          />
        )}
      </div>

      {duplicating && (
        <DuplicateConfirmModal
          profileName={duplicating.name}
          onConfirm={() => handleDuplicate(duplicating)}
          onCancel={() => setDuplicating(null)}
        />
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Cards
// ────────────────────────────────────────────────────────────────────────────

interface SystemCardProps {
  profile: Profile
  brands: Brand[]
  onDuplicate: () => void
}

function SystemProfileCard({ profile, brands, onDuplicate }: SystemCardProps) {
  const visible = brands.filter((b) => profile.brandIds.includes(b.id))
  return (
    <div
      data-testid={`profile-card-${profile.id}`}
      style={{
        background: '#161e2e',
        border: '1px solid #334155',
        borderRadius: 10,
        padding: 14,
        position: 'relative',
      }}
    >
      <div
        title="Default profile — duplicate to edit"
        style={{ position: 'absolute', top: 10, right: 12, fontSize: 13 }}
        aria-label="Locked"
      >
        🔒
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 20 }}>{profile.icon}</span>
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{profile.name}</div>
          <div style={{ fontSize: 10, color: '#64748b' }}>
            {profile.brandIds.length} brands · Immutable — duplicate to edit
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
        {visible.slice(0, 12).map((b) => (
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
        {visible.length > 12 && (
          <span style={{ color: '#64748b', fontSize: 10, alignSelf: 'center' }}>
            +{visible.length - 12} more
          </span>
        )}
      </div>
      <button
        onClick={onDuplicate}
        style={{
          width: '100%',
          background: '#1e293b',
          border: '1px solid #334155',
          color: '#a5b4fc',
          padding: 7,
          borderRadius: 6,
          fontSize: 11,
          cursor: 'pointer',
        }}
      >
        📋 Duplicate
      </button>
    </div>
  )
}

interface UserCardProps {
  profile: Profile
  brands: Brand[]
  onUpdate: (profile: Profile) => void
  onDelete: () => void
  onAddBrand: (name: string) => Brand
}

function UserProfileCard({ profile, brands, onUpdate, onDelete, onAddBrand }: UserCardProps) {
  return (
    <div
      data-testid={`profile-card-${profile.id}`}
      style={{
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: 10,
        padding: 14,
      }}
    >
      {/* Header row: current icon+name + delete button */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 18 }}>{profile.icon}</span>
          <span style={{ fontWeight: 600, fontSize: 13 }}>{profile.name}</span>
        </div>
        <button
          onClick={() => {
            if (window.confirm(`Delete profile "${profile.name}"?`)) onDelete()
          }}
          aria-label="Delete profile"
          title="Delete profile"
          style={{
            background: 'transparent',
            border: '1px solid #ef4444',
            color: '#ef4444',
            padding: '3px 8px',
            borderRadius: 5,
            fontSize: 11,
            cursor: 'pointer',
          }}
        >
          🗑 Delete
        </button>
      </div>

      {/* Icon picker */}
      <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4 }}>Icon</div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
        {ICONS.map((icon) => (
          <button
            key={icon}
            onClick={() => onUpdate({ ...profile, icon })}
            style={{
              background: profile.icon === icon ? '#6366f1' : '#0f172a',
              border: 'none',
              borderRadius: 4,
              padding: 4,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            {icon}
          </button>
        ))}
      </div>

      {/* Name input */}
      <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4 }}>Name</div>
      <input
        value={profile.name}
        onChange={(e) => onUpdate({ ...profile, name: e.target.value })}
        aria-label="Profile name"
        style={{
          width: '100%',
          background: '#0f172a',
          border: '1px solid #6366f1',
          borderRadius: 6,
          padding: '6px 10px',
          color: '#e2e8f0',
          fontSize: 12,
          marginBottom: 8,
          boxSizing: 'border-box',
        }}
      />

      {/* Brand picker */}
      <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4 }}>Brands</div>
      <BrandPicker
        allBrands={brands}
        selectedIds={profile.brandIds}
        onChange={(brandIds) => onUpdate({ ...profile, brandIds })}
        onAddBrand={onAddBrand}
      />
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Create form
// ────────────────────────────────────────────────────────────────────────────

interface CreateFormProps {
  brands: Brand[]
  takenIds: Set<string>
  takenNames: Set<string>
  onCancel: () => void
  onCreate: (profile: Profile) => void
  onAddBrand: (name: string) => Brand
}

function CreateProfileForm({
  brands,
  takenIds,
  takenNames,
  onCancel,
  onCreate,
  onAddBrand,
}: CreateFormProps) {
  const [name, setName] = useState('')
  const [icon, setIcon] = useState(ICONS[0]!)
  const [brandIds, setBrandIds] = useState<string[]>([])

  const trimmedName = name.trim()
  const slug = slugifyName(trimmedName)
  const nameError =
    trimmedName.length === 0
      ? 'Name is required.'
      : !slug
        ? 'Name must contain letters or numbers.'
        : takenNames.has(trimmedName)
          ? 'A profile with this name already exists.'
          : null
  const brandsError = brandIds.length === 0 ? 'Select at least one brand.' : null
  const canSubmit = !nameError && !brandsError

  const handleSubmit = () => {
    if (!canSubmit) return
    const id = generateUniqueProfileId(trimmedName, takenIds)
    if (!id) return
    onCreate({ id, name: trimmedName, icon, brandIds, isSystem: false })
  }

  return (
    <div
      data-testid="create-profile-form"
      style={{
        background: '#1e293b',
        border: '1px solid #6366f1',
        borderRadius: 10,
        padding: 14,
      }}
    >
      <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 8 }}>New profile</div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
        {ICONS.map((i) => (
          <button
            key={i}
            type="button"
            onClick={() => setIcon(i)}
            style={{
              background: icon === i ? '#6366f1' : '#0f172a',
              border: 'none',
              borderRadius: 4,
              padding: 4,
              fontSize: 14,
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
        placeholder="Profile name…"
        aria-label="Profile name"
        style={{
          width: '100%',
          background: '#0f172a',
          border: '1px solid #334155',
          borderRadius: 6,
          padding: '6px 10px',
          color: '#e2e8f0',
          fontSize: 12,
          marginBottom: 6,
          boxSizing: 'border-box',
        }}
      />
      {nameError && trimmedName.length > 0 && (
        <div style={{ color: '#fca5a5', fontSize: 10, marginBottom: 6 }}>{nameError}</div>
      )}
      <div style={{ marginBottom: 8 }}>
        <BrandPicker
          allBrands={brands}
          selectedIds={brandIds}
          onChange={setBrandIds}
          onAddBrand={onAddBrand}
        />
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          style={{
            flex: 1,
            background: canSubmit ? '#6366f1' : '#334155',
            border: 'none',
            color: canSubmit ? 'white' : '#64748b',
            padding: 7,
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 600,
            cursor: canSubmit ? 'pointer' : 'not-allowed',
          }}
        >
          Create
        </button>
        <button
          type="button"
          onClick={onCancel}
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
  )
}
