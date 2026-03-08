import React, { useEffect } from 'react'
import { LayoutDashboard, Settings, AppWindow, Info, Tv2, BarChart2, Container, Home } from 'lucide-react'
import { useStore } from '../store/useStore'
import { useArrStore } from '../store/useArrStore'
import { useWidgetStore } from '../store/useWidgetStore'
import { useDockerStore } from '../store/useDockerStore'
import type { Widget, ServerStats, AdGuardStats, HaEntityState, NpmStats } from '../types'
import { containerCounts } from '../utils'

interface Props {
  page: string
  onNavigate: (page: string) => void
}

export function Sidebar({ page, onNavigate }: Props) {
  const { settings, services, isAdmin, isAuthenticated, authUser, userGroups } = useStore()
  const { instances } = useArrStore()
  const { widgets, loadStats } = useWidgetStore()

  const userGroupData = userGroups.find(g => g.id === authUser?.groupId)
  const canSeeDocker = isAdmin || (userGroupData?.docker_access ?? false)
  const title = settings?.dashboard_title ?? 'HELDASH'

  const onlineCount = services.filter(s => s.last_status === 'online').length
  const offlineCount = services.filter(s => s.last_status === 'offline').length

  const { loadContainers } = useDockerStore()

  const sidebarWidgets = widgets.filter(w => w.display_location === 'sidebar')
  const hasSidebarDocker = sidebarWidgets.some(w => w.type === 'docker_overview')
  const sidebarStatsKey = sidebarWidgets
    .filter(w => w.type !== 'docker_overview' && w.type !== 'custom_button')
    .map(w => w.id)
    .join(',')

  useEffect(() => {
    if (!sidebarStatsKey) return
    const ids = sidebarStatsKey.split(',')
    ids.forEach(id => loadStats(id).catch(() => {}))
    const interval = setInterval(() => ids.forEach(id => loadStats(id).catch(() => {})), 10_000)
    return () => clearInterval(interval)
  }, [sidebarStatsKey])

  useEffect(() => {
    if (!hasSidebarDocker) return
    loadContainers().catch(() => {})
    const interval = setInterval(() => loadContainers().catch(() => {}), 30_000)
    return () => clearInterval(interval)
  }, [hasSidebarDocker])

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <img src="/favicon.png" alt="" className="sidebar-logo-icon" style={{ width: 22, height: 22, objectFit: 'contain' }} />
        <span className="sidebar-logo-text">{title}</span>
      </div>

      {/* Online / Offline counter */}
      {services.length > 0 && (
        <div className="sidebar-status">
          <div className="sidebar-status-pill online">
            <span className="sidebar-status-dot" />
            <span>{onlineCount} Online</span>
          </div>
          <div className="sidebar-status-pill offline">
            <span className="sidebar-status-dot" />
            <span>{offlineCount} Offline</span>
          </div>
        </div>
      )}

      <span className="nav-section-label">Navigation</span>

      <NavItem icon={<LayoutDashboard size={16} />} label="Dashboard" active={page === 'dashboard'} onClick={() => onNavigate('dashboard')} />

      {isAuthenticated && (
        <>
          <NavItem icon={<AppWindow size={16} />} label="Apps" active={page === 'services'} onClick={() => onNavigate('services')} />
          {(isAdmin || instances.length > 0) && (
            <NavItem icon={<Tv2 size={16} />} label="Media" active={page === 'media'} onClick={() => onNavigate('media')} />
          )}
          {(isAdmin || widgets.length > 0) && (
            <NavItem icon={<BarChart2 size={16} />} label="Widgets" active={page === 'widgets'} onClick={() => onNavigate('widgets')} />
          )}
          {canSeeDocker && (
            <NavItem icon={<Container size={16} />} label="Docker" active={page === 'docker'} onClick={() => onNavigate('docker')} />
          )}
          <NavItem icon={<Home size={16} />} label="Home Assistant" active={page === 'home_assistant'} onClick={() => onNavigate('home_assistant')} />
        </>
      )}

      <span className="nav-section-label" style={{ marginTop: 8 }}>System</span>
      {isAdmin && (
        <NavItem icon={<Settings size={16} />} label="Settings" active={page === 'settings'} onClick={() => onNavigate('settings')} />
      )}
      <NavItem icon={<Info size={16} />} label="About" active={page === 'about'} onClick={() => onNavigate('about')} />

      {/* Sidebar widgets */}
      {sidebarWidgets.length > 0 && (
        <>
          <span className="nav-section-label" style={{ marginTop: 16 }}>Widgets</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 4px' }}>
            {sidebarWidgets.map(widget => (
              <SidebarWidget key={widget.id} widget={widget} />
            ))}
          </div>
        </>
      )}
    </aside>
  )
}

function NavItem({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button className={`nav-item ${active ? 'active' : ''}`} onClick={onClick} style={{ width: '100%', textAlign: 'left', background: 'none', fontFamily: 'var(--font-sans)' }}>
      {icon}
      <span>{label}</span>
    </button>
  )
}

function SidebarWidget({ widget }: { widget: Widget }) {
  const { stats } = useWidgetStore()
  const { containers } = useDockerStore()
  const s = stats[widget.id]

  const row = (label: string, value: string, color?: string) => (
    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ color: color ?? 'var(--accent)', fontFamily: 'var(--font-mono)', fontWeight: 500 }}>{value}</span>
    </div>
  )

  const pctColor = (pct: number) =>
    pct >= 90 ? 'var(--status-offline)' : pct >= 70 ? '#f59e0b' : 'var(--status-online)'

  let body: React.ReactNode = null

  if (widget.type === 'docker_overview') {
    const { running, stopped, restarting } = containerCounts(containers)
    body = <>
      {row('Total', String(containers.length))}
      {row('Running', String(running), 'var(--status-online)')}
      {stopped > 0 && row('Stopped', String(stopped), 'var(--text-muted)')}
      {restarting > 0 && row('Restarting', String(restarting), '#f59e0b')}
    </>
  } else if (!s) {
    return null
  } else if (widget.type === 'server_status' && 'cpu' in (s as object)) {
    const ss = s as ServerStats
    body = <>
      {row('CPU', `${Math.round(ss.cpu.load * 10) / 10}%`, pctColor(ss.cpu.load))}
      {ss.ram.total > 0 && row('RAM', `${Math.round((ss.ram.used / ss.ram.total) * 100)}%`, pctColor(Math.round(ss.ram.used / ss.ram.total * 100)))}
      {ss.disks.filter(d => d.total > 0).map(d => {
        const pct = Math.round((d.used / d.total) * 100)
        return row(d.name, `${pct}% · ${(d.used / 1024).toFixed(0)}/${(d.total / 1024).toFixed(0)} GB`, pctColor(pct))
      })}
    </>
  } else if ((widget.type === 'adguard_home' || widget.type === 'pihole') && 'total_queries' in (s as object)) {
    const ag = s as AdGuardStats
    const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
    if (ag.total_queries === -1) {
      body = <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Unreachable</span>
    } else {
      body = <>
        {row('Queries', fmt(ag.total_queries))}
        {row('Blocked', `${ag.blocked_percent}%`, 'var(--status-offline)')}
        {row('Status', ag.protection_enabled ? 'Protected' : 'Paused', ag.protection_enabled ? 'var(--status-online)' : '#f59e0b')}
      </>
    }
  } else if (widget.type === 'home_assistant' && Array.isArray(s)) {
    const entities = s as HaEntityState[]
    if (entities.length === 0) return null
    const haStateColor = (state: string): string | undefined => {
      if (['on', 'open', 'unlocked', 'playing', 'home', 'active'].includes(state)) return 'var(--status-online)'
      if (['off', 'closed', 'locked', 'paused', 'idle', 'standby'].includes(state)) return 'var(--text-muted)'
      return undefined
    }
    body = <>
      {entities.map(e => row(
        e.label || e.friendly_name || e.entity_id,
        e.state + (e.unit ? ` ${e.unit}` : ''),
        haStateColor(e.state)
      ))}
    </>
  } else if (widget.type === 'nginx_pm' && 'proxy_hosts' in (s as object)) {
    const npm = s as NpmStats
    body = <>
      {row('Proxies', String(npm.proxy_hosts))}
      {row('Streams', String(npm.streams))}
      {row('Certs', String(npm.certificates), npm.cert_expiring_soon > 0 ? '#f59e0b' : undefined)}
      {npm.cert_expiring_soon > 0 && row('Expiring', String(npm.cert_expiring_soon), '#f59e0b')}
    </>
  } else {
    return null
  }

  return (
    <div
      className="glass"
      style={{ borderRadius: 'var(--radius-md)', padding: '10px 12px', fontSize: 12, display: 'flex', flexDirection: 'column', gap: 6 }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 2 }}>{widget.name}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
        {body}
      </div>
    </div>
  )
}
