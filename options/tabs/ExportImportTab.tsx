import React, { useRef } from 'react'
import type { Config } from '../../lib/config'

interface Props {
  config: Config
  onImport: (config: Config) => void
  onReset: () => void
}

export function ExportImportTab({ config, onImport, onReset }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `brandfilter-config-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string) as Config
        if (!parsed.version || !Array.isArray(parsed.masterBrands)) {
          alert('Invalid config file — missing required fields.')
          return
        }
        onImport(parsed)
      } catch {
        alert('Failed to parse JSON file.')
      }
    }
    reader.readAsText(file)
  }

  return (
    <div>
      <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Export / Import</h2>
      <p style={{ fontSize: 11, color: '#64748b', marginBottom: 20 }}>
        Back up your brand library and profiles, or restore from a previous export.
      </p>

      {[
        {
          title: 'Export Config',
          desc: 'Download your full configuration as a JSON file. Includes master brands, profiles, and site settings.',
          action: (
            <button
              onClick={handleExport}
              style={{
                background: '#6366f1',
                border: 'none',
                color: 'white',
                padding: '8px 16px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              ⬆ Download JSON
            </button>
          ),
        },
        {
          title: 'Import Config',
          desc: 'Restore from a previously exported JSON file. This will overwrite your current configuration.',
          action: (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleImport}
                style={{ display: 'none' }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{
                  background: '#1e293b',
                  border: '1px solid #334155',
                  color: '#94a3b8',
                  padding: '8px 16px',
                  borderRadius: 6,
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                ⬇ Choose File
              </button>
            </>
          ),
        },
        {
          title: 'Reset to Defaults',
          desc: 'Clear all your profiles and sites. Master brands are re-seeded from the default library. This cannot be undone.',
          action: (
            <button
              onClick={() => {
                if (confirm('Reset all settings to defaults?')) onReset()
              }}
              style={{
                background: '#7f1d1d',
                border: '1px solid #dc2626',
                color: '#fca5a5',
                padding: '8px 16px',
                borderRadius: 6,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Reset to Defaults
            </button>
          ),
        },
      ].map(({ title, desc, action }) => (
        <div
          key={title}
          style={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: 10,
            padding: 16,
            marginBottom: 12,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 13 }}>{title}</div>
          <div style={{ fontSize: 11, color: '#64748b', marginBottom: 12 }}>{desc}</div>
          {action}
        </div>
      ))}
    </div>
  )
}
