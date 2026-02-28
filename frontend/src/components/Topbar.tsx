import { Sun, Moon, RefreshCw, Plus } from 'lucide-react'
import { useStore } from '../store/useStore'
import type { ThemeAccent } from '../types'

interface Props {
  onAddService: () => void
  onCheckAll: () => void
  checking: boolean
}

const ACCENTS: { value: ThemeAccent; label: string; color: string }[] = [
  { value: 'cyan', label: 'Cyan', color: '#22d3ee' },
  { value: 'orange', label: 'Orange', color: '#fb923c' },
  { value: 'magenta', label: 'Magenta', color: '#e879f9' },
]

export function Topbar({ onAddService, onCheckAll, checking }: Props) {
  const { services, settings, setThemeMode, setThemeAccent } = useStore()
  const mode = settings?.theme_mode ?? 'dark'
  const accent = settings?.theme_accent ?? 'cyan'

  const onlineCount = services.filter(s => s.last_status === 'online').length
  const offlineCount = services.filter(s => s.last_status === 'offline').length

  return (
    <header className="topbar">
      <div className="topbar-title">
        <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
          {new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}
        </span>
        {services.length > 0 && (
          <div style={{ display: 'flex', gap: 12, marginTop: 1 }}>
            <span style={{ fontSize: 12, color: 'var(--status-online)', fontFamily: 'var(--font-mono)' }}>
              ● {onlineCount}
            </span>
            <span style={{ fontSize: 12, color: 'var(--status-offline)', fontFamily: 'var(--font-mono)' }}>
              ● {offlineCount}
            </span>
          </div>
        )}
      </div>

      <div className="topbar-actions">
        {/* Accent picker */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginRight: 4 }}>
          {ACCENTS.map(a => (
            <button
              key={a.value}
              data-tooltip={a.label}
              onClick={() => setThemeAccent(a.value)}
              style={{
                width: 16, height: 16,
                borderRadius: '50%',
                background: a.color,
                border: accent === a.value ? `2px solid white` : '2px solid transparent',
                cursor: 'pointer',
                outline: accent === a.value ? `2px solid ${a.color}` : 'none',
                outlineOffset: 1,
                transition: 'all 150ms ease',
                boxShadow: accent === a.value ? `0 0 8px ${a.color}` : 'none',
              }}
            />
          ))}
        </div>

        <button
          className="btn btn-ghost btn-icon"
          data-tooltip={mode === 'dark' ? 'Light mode' : 'Dark mode'}
          onClick={() => setThemeMode(mode === 'dark' ? 'light' : 'dark')}
        >
          {mode === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        <button
          className="btn btn-ghost btn-icon"
          data-tooltip="Check all services"
          onClick={onCheckAll}
          disabled={checking}
        >
          {checking
            ? <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
            : <RefreshCw size={16} />
          }
        </button>

        <button className="btn btn-primary" onClick={onAddService} style={{ gap: 6 }}>
          <Plus size={16} />
          Add Service
        </button>
      </div>
    </header>
  )
}
