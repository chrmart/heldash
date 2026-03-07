import { LayoutDashboard, Settings, AppWindow, Info, Tv2, BarChart2, Container } from 'lucide-react'
import { useStore } from '../store/useStore'
import { useArrStore } from '../store/useArrStore'
import { useWidgetStore } from '../store/useWidgetStore'
import type { ServerStats, AdGuardStats } from '../types'

interface Props {
  page: string
  onNavigate: (page: string) => void
}

export function Sidebar({ page, onNavigate }: Props) {
  const { settings, services, isAdmin, isAuthenticated, authUser, userGroups } = useStore()
  const { instances } = useArrStore()
  const { widgets } = useWidgetStore()

  const userGroupData = userGroups.find(g => g.id === authUser?.groupId)
  const canSeeDocker = isAdmin || (userGroupData?.docker_access ?? false)
  const title = settings?.dashboard_title ?? 'HELDASH'

  const onlineCount = services.filter(s => s.last_status === 'online').length
  const offlineCount = services.filter(s => s.last_status === 'offline').length

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
        </>
      )}

      <span className="nav-section-label" style={{ marginTop: 8 }}>System</span>
      {isAdmin && (
        <NavItem icon={<Settings size={16} />} label="Settings" active={page === 'settings'} onClick={() => onNavigate('settings')} />
      )}
      <NavItem icon={<Info size={16} />} label="About" active={page === 'about'} onClick={() => onNavigate('about')} />

      {/* Sidebar widgets */}
      {widgets.length > 0 && (
        <>
          <span className="nav-section-label" style={{ marginTop: 16 }}>Widgets</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 4px' }}>
            {widgets
              .filter(w => w.display_location === 'sidebar')
              .map(widget => (
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

function SidebarWidget({ widget }: { widget: any }) {
  const { stats } = useWidgetStore()
  const widgetStats = stats[widget.id]

  if (!widgetStats) return null

  return (
    <div
      className="glass"
      style={{
        borderRadius: 'var(--radius-md)',
        padding: '10px 12px',
        fontSize: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>{widget.name}</div>

      {widget.type === 'server_status' && widgetStats && 'cpu' in widgetStats && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
          {(() => {
            const s = widgetStats as ServerStats
            return <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>CPU</span>
                <span style={{ color: 'var(--accent)', fontWeight: 500 }}>{Math.round(s.cpu.load * 10) / 10}%</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>RAM</span>
                <span style={{ color: 'var(--accent)', fontWeight: 500 }}>
                  {Math.round(((s.ram.used || 0) / (s.ram.total || 1)) * 100)}%
                </span>
              </div>
            </>
          })()}
        </div>
      )}

      {widget.type === 'adguard_home' && widgetStats && 'total_queries' in widgetStats && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
          {(() => {
            const s = widgetStats as AdGuardStats
            return <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Queries</span>
                <span style={{ color: 'var(--accent)', fontWeight: 500 }}>{s.total_queries}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Blocked</span>
                <span style={{ color: 'var(--status-offline)', fontWeight: 500 }}>{s.blocked_percent}%</span>
              </div>
            </>
          })()}
        </div>
      )}

      {widget.type === 'docker_overview' && (
        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>📦 Docker Overview</div>
      )}
    </div>
  )
}
