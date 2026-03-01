import { Sun, Moon, RefreshCw, Plus, LogIn, LogOut } from 'lucide-react'
import { useStore } from '../store/useStore'
import type { ThemeAccent } from '../types'

interface Props {
  page: string
  onAddService: () => void
  onAddInstance: () => void
  onCheckAll: () => void
  checking: boolean
  onLogin: () => void
}

const ACCENTS: { value: ThemeAccent; label: string; color: string }[] = [
  { value: 'cyan', label: 'Cyan', color: '#22d3ee' },
  { value: 'orange', label: 'Orange', color: '#fb923c' },
  { value: 'magenta', label: 'Magenta', color: '#e879f9' },
]

export function Topbar({ page, onAddService, onAddInstance, onCheckAll, checking, onLogin }: Props) {
  const { settings, setThemeMode, setThemeAccent, isAuthenticated, isAdmin, authUser, logout, loadAll } = useStore()
  const mode = settings?.theme_mode ?? 'dark'
  const accent = settings?.theme_accent ?? 'cyan'

  return (
    <header className="topbar">
      <div className="topbar-title">
        {new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}
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
          data-tooltip="Check all apps"
          onClick={onCheckAll}
          disabled={checking}
        >
          {checking
            ? <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
            : <RefreshCw size={16} />
          }
        </button>

        {isAdmin && page === 'media' && (
          <button className="btn btn-primary" onClick={onAddInstance} style={{ gap: 6 }}>
            <Plus size={16} />
            Add Instance
          </button>
        )}
        {isAdmin && (page === 'dashboard' || page === 'services') && (
          <button className="btn btn-primary" onClick={onAddService} style={{ gap: 6 }}>
            <Plus size={16} />
            Add App
          </button>
        )}

        {isAuthenticated ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>
              {authUser?.username}
            </span>
            <button
              className="btn btn-ghost btn-icon"
              data-tooltip="Logout"
              onClick={() => logout().then(() => loadAll())}
            >
              <LogOut size={16} />
            </button>
          </div>
        ) : (
          <button className="btn btn-ghost" onClick={onLogin} style={{ gap: 6 }}>
            <LogIn size={16} />
            Login
          </button>
        )}
      </div>
    </header>
  )
}
