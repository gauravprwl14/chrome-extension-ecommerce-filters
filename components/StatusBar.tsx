import React from 'react'

type Status = 'applied' | 'not-applied' | 'off' | 'unsupported'

interface Props {
  status: Status
  appliedAt?: number // timestamp ms
}

const STATUS_CONFIG: Record<Status, { dot: string; label: (appliedAt?: number) => string }> = {
  applied: {
    dot: '#4ade80',
    label: (at) => (at ? `Filters applied ${formatAgo(at)}` : 'Filters applied'),
  },
  'not-applied': { dot: '#f59e0b', label: () => 'Not applied yet' },
  off: { dot: '#6b7280', label: () => 'Filters off' },
  unsupported: { dot: '#6b7280', label: () => 'Site not configured' },
}

function formatAgo(ts: number): string {
  const diffMs = Date.now() - ts
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins === 1) return '1 min ago'
  return `${mins} mins ago`
}

export function StatusBar({ status, appliedAt }: Props) {
  const { dot, label } = STATUS_CONFIG[status]
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: '#0f172a',
        borderRadius: 6,
        padding: '7px 10px',
        fontSize: 11,
        color: '#94a3b8',
      }}
    >
      <div style={{ width: 7, height: 7, borderRadius: '50%', background: dot, flexShrink: 0 }} />
      <span>{label(appliedAt)}</span>
    </div>
  )
}
