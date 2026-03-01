import { useEffect, useState } from 'react'
import { Sun, Moon, RefreshCw, Plus, LogIn, LogOut, Pencil, LayoutGrid, LayoutList, Minus } from 'lucide-react'
import { useStore } from '../store/useStore'
import { useDashboardStore } from '../store/useDashboardStore'
import { useWidgetStore } from '../store/useWidgetStore'
import { api } from '../api'
import type { ThemeAccent } from '../types'

interface Props {
  page: string
  onAddService: () => void
  onAddInstance: () => void
  onAddWidget: () => void
  onCheckAll: () => void
  checking: boolean
  onLogin: () => void
}

const ACCENTS: { value: ThemeAccent; label: string; color: string }[] = [
  { value: 'cyan', label: 'Cyan', color: '#22d3ee' },
  { value: 'orange', label: 'Orange', color: '#fb923c' },
  { value: 'magenta', label: 'Magenta', color: '#e879f9' },
]

export function Topbar({ page, onAddService, onAddInstance, onAddWidget, onCheckAll, checking, onLogin }: Props) {
  const { settings, setThemeMode, setThemeAccent, isAuthenticated, isAdmin, authUser, logout, loadAll } = useStore()
  const { loadDashboard, editMode, setEditMode, addPlaceholder } = useDashboardStore()
  const { widgets, stats, loadWidgets, loadStats } = useWidgetStore()
  const mode = settings?.theme_mode ?? 'dark'
  const accent = settings?.theme_accent ?? 'cyan'

  const topbarWidgets = widgets.filter(w => w.show_in_topbar)

  // Server clock: fetch server time once, compute offset, tick every second
  const [serverOffset, setServerOffset] = useState(0)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    api.serverTime().then(({ iso }) => {
      setServerOffset(new Date(iso).getTime() - Date.now())
    }).catch(() => {})
    const tick = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(tick)
  }, [])

  const serverNow = new Date(now.getTime() + serverOffset)

  // Load widgets on mount, then poll stats every 15s for topbar widgets
  useEffect(() => {
    loadWidgets().catch(() => {})
  }, [])

  useEffect(() => {
    if (topbarWidgets.length === 0) return
    topbarWidgets.forEach(w => loadStats(w.id).catch(() => {}))
    const interval = setInterval(() => {
      topbarWidgets.forEach(w => loadStats(w.id).catch(() => {}))
    }, 15_000)
    return () => clearInterval(interval)
  }, [topbarWidgets.map(w => w.id).join(',')])

  return (
    <header className="topbar">
      <div className="topbar-title">
        <span>{serverNow.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
        <span style={{ marginLeft: 10, fontVariantNumeric: 'tabular-nums' }}>
          {serverNow.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>
      </div>

      {/* Center zone — topbar widget stats */}
      <div className="topbar-center">
        {topbarWidgets.map(w => {
          const s = stats[w.id]
          if (!s) return null
          const ramUsedGb = (s.ram.used / 1024).toFixed(1)
          const ramTotalGb = (s.ram.total / 1024).toFixed(1)
          const diskParts = s.disks
            .filter(d => d.total > 0)
            .map(d => {
              const pct = Math.round((d.used / d.total) * 100)
              const freeGb = (d.free / 1024).toFixed(0)
              const totalGb = (d.total / 1024).toFixed(0)
              return `${d.name} ${pct}% · ${freeGb}/${totalGb} GB`
            })
          const parts = [
            s.cpu.load >= 0 ? `CPU ${s.cpu.load}%` : null,
            s.ram.total > 0 ? `RAM ${ramUsedGb}/${ramTotalGb} GB` : null,
            ...diskParts,
          ].filter(Boolean)
          return (
            <div
              key={w.id}
              style={{
                display: 'flex',
                gap: 12,
                alignItems: 'center',
                flexWrap: 'wrap',
                justifyContent: 'center',
                border: '1px solid var(--accent)',
                borderRadius: 'var(--radius-md)',
                padding: '3px 12px',
                boxShadow: '0 0 8px rgba(var(--accent-rgb), 0.15)',
              }}
            >
              {parts.map((p, i) => (
                <span key={i} style={{ whiteSpace: 'nowrap' }}>{p}</span>
              ))}
            </div>
          )
        })}
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

        {isAdmin && page === 'dashboard' && (
          <>
            {editMode && (
              <>
                <button className="btn btn-ghost" onClick={() => addPlaceholder('app')} style={{ gap: 6 }}>
                  <LayoutGrid size={15} />
                  App
                </button>
                <button className="btn btn-ghost" onClick={() => addPlaceholder('instance')} style={{ gap: 6 }}>
                  <LayoutList size={15} />
                  Instance
                </button>
                <button className="btn btn-ghost" onClick={() => addPlaceholder('row')} style={{ gap: 6 }}>
                  <Minus size={15} />
                  Row
                </button>
              </>
            )}
            <button
              className={editMode ? 'btn btn-primary' : 'btn btn-ghost'}
              onClick={() => setEditMode(!editMode)}
              style={{ gap: 6 }}
            >
              <Pencil size={15} />
              {editMode ? 'Done' : 'Edit Dashboard'}
            </button>
          </>
        )}
        {isAdmin && page === 'media' && (
          <button className="btn btn-primary" onClick={onAddInstance} style={{ gap: 6 }}>
            <Plus size={16} />
            Add Instance
          </button>
        )}
        {isAdmin && page === 'widgets' && (
          <button className="btn btn-primary" onClick={onAddWidget} style={{ gap: 6 }}>
            <Plus size={16} />
            Add Widget
          </button>
        )}
        {isAdmin && page === 'services' && (
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
              onClick={() => logout().then(() => Promise.all([loadAll(), loadDashboard()]))}
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
