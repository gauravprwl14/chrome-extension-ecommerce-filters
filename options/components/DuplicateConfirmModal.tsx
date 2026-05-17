import React, { useRef } from 'react'
import { useOutsideClick } from '../../lib/use-outside-click'

interface Props {
  profileName: string
  onConfirm: () => void
  onCancel: () => void
}

export function DuplicateConfirmModal({ profileName, onConfirm, onCancel }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  useOutsideClick(ref, onCancel)

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
    >
      <div
        ref={ref}
        style={{
          background: '#1e293b',
          border: '1px solid #334155',
          borderRadius: 10,
          padding: 20,
          width: 320,
          color: '#e2e8f0',
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Duplicate profile?</div>
        <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.5, marginBottom: 16 }}>
          “{profileName}” is a default profile and can&rsquo;t be edited directly. Create a copy you
          can edit?
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              background: '#1e293b',
              border: '1px solid #334155',
              color: '#94a3b8',
              padding: '7px 14px',
              borderRadius: 6,
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
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
            Create copy
          </button>
        </div>
      </div>
    </div>
  )
}
