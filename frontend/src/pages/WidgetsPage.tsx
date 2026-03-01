import { useEffect, useRef, useState } from 'react'
import { useWidgetStore } from '../store/useWidgetStore'
import { useDockerStore } from '../store/useDockerStore'
import { useDashboardStore } from '../store/useDashboardStore'
import { useStore } from '../store/useStore'
import { Trash2, Pencil, X, Check, Plus, Minus, LayoutDashboard, Shield, ShieldOff, Upload, Container, Play, Square, RotateCcw } from 'lucide-react'
import type { Widget, ServerStatusConfig, AdGuardHomeConfig, ServerStats, AdGuardStats } from '../types'
import { normalizeUrl, containerCounts } from '../utils'

// ── Widget icon — URL-matched service icon or custom icon_url ─────────────────
function WidgetIcon({ widget, size = 32 }: { widget: Pick<Widget, 'type' | 'config' | 'icon_url'>; size?: number }) {
  const { services } = useStore()

  if (widget.type === 'docker_overview') {
    if (widget.icon_url) {
      return <img src={widget.icon_url} alt="" style={{ width: size, height: size, objectFit: 'contain', borderRadius: 6, flexShrink: 0 }} />
    }
    return <Container size={size * 0.8} style={{ color: 'var(--accent)', flexShrink: 0 }} />
  }

  let iconUrl: string | null = null
  let iconEmoji: string | null = null

  if (widget.type === 'adguard_home') {
    const widgetUrl = normalizeUrl((widget.config as AdGuardHomeConfig).url ?? '')
    const match = widgetUrl
      ? services.find(s => normalizeUrl(s.url) === widgetUrl || (s.check_url && normalizeUrl(s.check_url) === widgetUrl))
      : undefined
    iconUrl = match?.icon_url ?? widget.icon_url ?? null
    iconEmoji = match?.icon ?? null
  } else {
    iconUrl = widget.icon_url ?? null
  }

  if (iconUrl) {
    return <img src={iconUrl} alt="" style={{ width: size, height: size, objectFit: 'contain', borderRadius: 6, flexShrink: 0 }} />
  }
  if (iconEmoji) {
    return <span style={{ fontSize: size * 0.7, lineHeight: 1, flexShrink: 0 }}>{iconEmoji}</span>
  }
  return null
}

// ── Docker Overview widget content ────────────────────────────────────────────
export function DockerOverviewContent({ isAdmin }: { isAdmin: boolean }) {
  const { containers, loadContainers, loadAllStats, controlContainer } = useDockerStore()
  const [selectedId, setSelectedId] = useState('')
  const [controlling, setControlling] = useState(false)
  const [ctrlError, setCtrlError] = useState('')

  useEffect(() => {
    loadContainers()
    loadAllStats()
    const t = setInterval(() => { loadContainers(); loadAllStats() }, 30_000)
    return () => clearInterval(t)
  }, [])

  const { running, stopped, restarting } = containerCounts(containers)

  const selectedContainer = containers.find(c => c.id === selectedId) ?? null

  const handleControl = async (action: 'start' | 'stop' | 'restart') => {
    if (!selectedId) return
    setCtrlError('')
    setControlling(true)
    try {
      await controlContainer(selectedId, action)
      await loadContainers()
    } catch (e: any) {
      setCtrlError(e.message)
    } finally {
      setControlling(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Count grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
        {[
          { label: 'Total',      value: containers.length, color: 'var(--accent)' },
          { label: 'Running',    value: running,    color: 'var(--status-online)' },
          { label: 'Stopped',    value: stopped,    color: 'var(--text-muted)' },
          { label: 'Restarting', value: restarting, color: '#f59e0b' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ textAlign: 'center', padding: '6px 4px', borderRadius: 'var(--radius-sm)', border: `1px solid ${color}22`, background: `${color}0a` }}>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-mono)', color, lineHeight: 1.1 }}>{value}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500, marginTop: 2, letterSpacing: '0.3px' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Container selector + controls — admin only */}
      {isAdmin && containers.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <select
            className="form-input"
            value={selectedId}
            onChange={e => setSelectedId(e.target.value)}
            style={{ fontSize: 12, padding: '5px 8px' }}
          >
            <option value="">Select container…</option>
            {[...containers].sort((a, b) => a.name.localeCompare(b.name)).map(c => (
              <option key={c.id} value={c.id}>{c.name} ({c.state})</option>
            ))}
          </select>
          {selectedId && (
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => handleControl('start')}
                disabled={controlling || selectedContainer?.state === 'running'}
                style={{ flex: 1, gap: 3, fontSize: 11, padding: '4px 6px', color: (!controlling && selectedContainer?.state !== 'running') ? 'var(--status-online)' : undefined, borderColor: (!controlling && selectedContainer?.state !== 'running') ? 'rgba(34,197,94,0.35)' : undefined }}>
                {controlling ? <div className="spinner" style={{ width: 8, height: 8, borderWidth: 1.5 }} /> : <Play size={10} />} Start
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => handleControl('stop')}
                disabled={controlling || selectedContainer?.state !== 'running'}
                style={{ flex: 1, gap: 3, fontSize: 11, padding: '4px 6px', color: (!controlling && selectedContainer?.state === 'running') ? 'var(--status-offline)' : undefined, borderColor: (!controlling && selectedContainer?.state === 'running') ? 'rgba(239,68,68,0.35)' : undefined }}>
                {controlling ? <div className="spinner" style={{ width: 8, height: 8, borderWidth: 1.5 }} /> : <Square size={10} />} Stop
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => handleControl('restart')}
                disabled={controlling}
                style={{ flex: 1, gap: 3, fontSize: 11, padding: '4px 6px', color: !controlling ? '#f59e0b' : undefined, borderColor: !controlling ? 'rgba(245,158,11,0.35)' : undefined }}>
                {controlling ? <div className="spinner" style={{ width: 8, height: 8, borderWidth: 1.5 }} /> : <RotateCcw size={10} />} Restart
              </button>
            </div>
          )}
          {ctrlError && (
            <div style={{ fontSize: 11, color: 'var(--status-offline)' }}>{ctrlError}</div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Disk config row ───────────────────────────────────────────────────────────
function DiskRow({
  disk,
  onChange,
  onRemove,
}: {
  disk: { path: string; name: string }
  onChange: (d: { path: string; name: string }) => void
  onRemove: () => void
}) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <input
        className="form-input"
        placeholder="Name (e.g. Data)"
        value={disk.name}
        onChange={e => onChange({ ...disk, name: e.target.value })}
        style={{ flex: 1, minWidth: 0, fontSize: 13, padding: '5px 8px' }}
      />
      <input
        className="form-input"
        placeholder="Path (e.g. /data)"
        value={disk.path}
        onChange={e => onChange({ ...disk, path: e.target.value })}
        style={{ flex: 2, minWidth: 0, fontSize: 13, padding: '5px 8px' }}
      />
      <button
        type="button"
        className="btn btn-ghost btn-icon btn-sm"
        onClick={onRemove}
        style={{ flexShrink: 0, padding: '4px', width: 28, height: 28 }}
      >
        <Minus size={12} />
      </button>
    </div>
  )
}

// ── Widget form (create or edit) ───────────────────────────────────────────────
function WidgetForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Widget
  onSave: (data: { name: string; type: string; config: object; show_in_topbar: boolean; iconData?: { data: string; contentType: string } | null }) => Promise<void>
  onCancel: () => void
}) {
  const isEdit = !!initial
  const [type, setType] = useState<'server_status' | 'adguard_home' | 'docker_overview'>(
    (initial?.type as 'server_status' | 'adguard_home' | 'docker_overview') ?? 'server_status'
  )
  const [name, setName] = useState(initial?.name ?? '')
  const [showTopbar, setShowTopbar] = useState(initial?.show_in_topbar ?? false)

  // server_status config
  const [disks, setDisks] = useState<{ path: string; name: string }[]>(
    initial?.type === 'server_status' ? (initial.config as ServerStatusConfig).disks ?? [] : []
  )

  // adguard_home config
  const existingAdGuard = initial?.type === 'adguard_home' ? (initial.config as AdGuardHomeConfig) : null
  const [agUrl, setAgUrl] = useState(existingAdGuard?.url ?? '')
  const [agUsername, setAgUsername] = useState(existingAdGuard?.username ?? '')
  const [agPassword, setAgPassword] = useState('')  // blank = keep existing on edit

  // icon
  const [pendingIcon, setPendingIcon] = useState<{ data: string; contentType: string; preview: string } | null>(null)
  const iconInputRef = useRef<HTMLInputElement>(null)

  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const handleIconFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = e => {
      const dataUrl = e.target?.result as string
      const [header, data] = dataUrl.split(',')
      const contentType = header.split(':')[1].split(';')[0]
      setPendingIcon({ data, contentType, preview: dataUrl })
    }
    reader.readAsDataURL(file)
  }

  // Update default name when type changes (only on create)
  const handleTypeChange = (t: 'server_status' | 'adguard_home' | 'docker_overview') => {
    setType(t)
    if (!isEdit && !name) {
      if (t === 'adguard_home') setName('AdGuard Home')
      else if (t === 'docker_overview') setName('Docker Overview')
      else setName('Server Status')
    }
  }

  const handleSave = async () => {
    setError('')
    if (!name.trim()) return setError('Name is required')

    let config: object
    if (type === 'server_status') {
      config = { disks }
    } else if (type === 'docker_overview') {
      config = {}
    } else {
      if (!agUrl.trim()) return setError('URL is required')
      if (!agUsername.trim()) return setError('Username is required')
      if (!isEdit && !agPassword) return setError('Password is required')
      config = { url: agUrl.trim(), username: agUsername.trim(), ...(agPassword ? { password: agPassword } : {}) }
    }

    setSaving(true)
    try {
      await onSave({ name: name.trim(), type, config, show_in_topbar: showTopbar, iconData: pendingIcon ? { data: pendingIcon.data, contentType: pendingIcon.contentType } : null })
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const addDisk = () => setDisks(d => [...d, { name: '', path: '' }])
  const updateDisk = (i: number, disk: { name: string; path: string }) =>
    setDisks(d => d.map((x, idx) => idx === i ? disk : x))
  const removeDisk = (i: number) => setDisks(d => d.filter((_, idx) => idx !== i))

  return (
    <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
        {isEdit ? 'Edit Widget' : 'New Widget'}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Type selector — only on create */}
        {!isEdit && (
          <div>
            <label className="form-label" style={{ fontSize: 11 }}>Type</label>
            <select
              className="form-input"
              value={type}
              onChange={e => handleTypeChange(e.target.value as 'server_status' | 'adguard_home' | 'docker_overview')}
            >
              <option value="server_status">Server Status</option>
              <option value="adguard_home">AdGuard Home</option>
              <option value="docker_overview">Docker Overview</option>
            </select>
          </div>
        )}

        <div>
          <label className="form-label" style={{ fontSize: 11 }}>Name</label>
          <input
            className="form-input"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={type === 'adguard_home' ? 'AdGuard Home' : type === 'docker_overview' ? 'Docker Overview' : 'Server Status'}
          />
        </div>

        {/* Icon */}
        {true && (
          <div>
            <label className="form-label" style={{ fontSize: 11 }}>
              Icon
              {type === 'adguard_home' && <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: 6 }}>(auto-matched from app URL, or upload custom)</span>}
              {type === 'docker_overview' && <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: 6 }}>(custom icon, or leave blank for default)</span>}
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {(pendingIcon?.preview ?? (isEdit ? initial?.icon_url : null)) && (
                <img
                  src={pendingIcon?.preview ?? initial?.icon_url ?? ''}
                  alt=""
                  style={{ width: 36, height: 36, objectFit: 'contain', borderRadius: 6, border: '1px solid var(--glass-border)' }}
                />
              )}
              <input
                ref={iconInputRef}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml"
                style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleIconFile(f) }}
              />
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => iconInputRef.current?.click()}
                style={{ gap: 4, fontSize: 12 }}
              >
                <Upload size={12} /> {pendingIcon || (isEdit && initial?.icon_url) ? 'Change Icon' : 'Upload Icon'}
              </button>
              {(pendingIcon || (isEdit && initial?.icon_url)) && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setPendingIcon(null)}
                  style={{ fontSize: 12, color: 'var(--text-muted)' }}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 16 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={showTopbar}
              onChange={e => setShowTopbar(e.target.checked)}
              style={{ accentColor: 'var(--accent)', width: 14, height: 14 }}
            />
            Show in Topbar
          </label>
        </div>

        {/* server_status config */}
        {type === 'server_status' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="form-label" style={{ fontSize: 11, margin: 0 }}>Disks</label>
              <button type="button" className="btn btn-ghost btn-sm" onClick={addDisk} style={{ gap: 4, fontSize: 11, padding: '3px 8px' }}>
                <Plus size={11} /> Add Disk
              </button>
            </div>
            {disks.length === 0 && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No disks configured. Click "Add Disk" to add one.</span>
            )}
            {disks.map((d, i) => (
              <DiskRow key={i} disk={d} onChange={disk => updateDisk(i, disk)} onRemove={() => removeDisk(i)} />
            ))}
          </div>
        )}

        {/* adguard_home config */}
        {type === 'adguard_home' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div>
              <label className="form-label" style={{ fontSize: 11 }}>AdGuard Home URL</label>
              <input
                className="form-input"
                value={agUrl}
                onChange={e => setAgUrl(e.target.value)}
                placeholder="http://192.168.1.1:80"
                style={{ fontSize: 13 }}
              />
            </div>
            <div>
              <label className="form-label" style={{ fontSize: 11 }}>Username</label>
              <input
                className="form-input"
                value={agUsername}
                onChange={e => setAgUsername(e.target.value)}
                placeholder="admin"
                autoComplete="off"
                style={{ fontSize: 13 }}
              />
            </div>
            <div>
              <label className="form-label" style={{ fontSize: 11 }}>
                Password{isEdit && <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: 6 }}>(leave blank to keep existing)</span>}
              </label>
              <input
                className="form-input"
                type="password"
                value={agPassword}
                onChange={e => setAgPassword(e.target.value)}
                placeholder={isEdit ? '••••••••' : 'Password'}
                autoComplete="new-password"
                style={{ fontSize: 13 }}
              />
            </div>
          </div>
        )}
      </div>

      {error && <div style={{ fontSize: 12, color: 'var(--status-offline)' }}>{error}</div>}

      <div style={{ display: 'flex', gap: 6 }}>
        <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving} style={{ gap: 4 }}>
          <Check size={12} /> {saving ? 'Saving…' : 'Save'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onCancel} style={{ gap: 4 }}>
          <X size={12} /> Cancel
        </button>
      </div>
    </div>
  )
}

// ── Widget card ───────────────────────────────────────────────────────────────
function WidgetCard({
  widget,
  onEdit,
  onDelete,
  onToggleDashboard,
  isOnDashboard,
}: {
  widget: Widget
  onEdit: () => void
  onDelete: () => void
  onToggleDashboard: () => void
  isOnDashboard: boolean
}) {
  const { isAdmin } = useStore()
  const { stats, loadStats, setAdGuardProtection } = useWidgetStore()
  const s = stats[widget.id]
  const [toggling, setToggling] = useState(false)

  useEffect(() => {
    if (widget.type === 'docker_overview') return  // DockerOverviewContent handles its own data loading
    loadStats(widget.id).catch(() => {})
    const interval = setInterval(() => loadStats(widget.id).catch(() => {}), 30_000)
    return () => clearInterval(interval)
  }, [widget.id, widget.type])

  const handleProtectionToggle = async () => {
    if (!isAdmin || widget.type !== 'adguard_home' || !s) return
    const ag = s as AdGuardStats
    setToggling(true)
    try {
      await setAdGuardProtection(widget.id, !ag.protection_enabled)
    } finally {
      setToggling(false)
    }
  }

  return (
    <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 20, display: 'flex', flexDirection: 'column', gap: 14, position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <WidgetIcon widget={widget} size={32} />
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{widget.name}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, display: 'flex', gap: 8 }}>
              <span>{widget.type === 'adguard_home' ? 'AdGuard Home' : widget.type === 'docker_overview' ? 'Docker Overview' : 'Server Status'}</span>
              {widget.show_in_topbar && <span style={{ color: 'var(--accent)' }}>· Topbar</span>}
            </div>
          </div>
        </div>
        {isAdmin && (
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={onEdit} data-tooltip="Edit" style={{ padding: '4px', width: 28, height: 28 }}>
              <Pencil size={12} />
            </button>
            <button className="btn btn-danger btn-icon btn-sm" onClick={onDelete} data-tooltip="Delete" style={{ padding: '4px', width: 28, height: 28 }}>
              <Trash2 size={12} />
            </button>
          </div>
        )}
      </div>

      {/* Stats preview — branched by widget type */}
      {widget.type === 'docker_overview' ? (
        <DockerOverviewContent isAdmin={isAdmin} />
      ) : widget.type === 'server_status' ? (
        s ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(() => {
              const ss = s as ServerStats
              return (
                <>
                  <StatBar label="CPU" value={ss.cpu.load >= 0 ? ss.cpu.load : null} unit="%" />
                  <StatBar label="RAM" value={ss.ram.total > 0 ? Math.round((ss.ram.used / ss.ram.total) * 100) : null} unit="%" extra={ss.ram.total > 0 ? `${(ss.ram.used / 1024).toFixed(1)} / ${(ss.ram.total / 1024).toFixed(1)} GB` : undefined} />
                  {ss.disks.map(d => (
                    <StatBar key={d.path} label={d.name} value={d.total > 0 ? Math.round((d.used / d.total) * 100) : null} unit="%" extra={d.total > 0 ? `${(d.used / 1024).toFixed(0)} / ${(d.total / 1024).toFixed(0)} GB` : undefined} />
                  ))}
                </>
              )
            })()}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0' }}>Loading stats…</div>
        )
      ) : (
        // adguard_home
        s ? (
          <AdGuardStatsView
            stats={s as AdGuardStats}
            isAdmin={isAdmin}
            toggling={toggling}
            onToggle={handleProtectionToggle}
          />
        ) : (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0' }}>Loading stats…</div>
        )
      )}

      {/* Dashboard toggle — admin only */}
      {isAdmin && (
        <button
          className={isOnDashboard ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
          onClick={onToggleDashboard}
          style={{ gap: 4, fontSize: 12, alignSelf: 'flex-start' }}
        >
          <LayoutDashboard size={12} />
          {isOnDashboard ? 'On Dashboard' : 'Add to Dashboard'}
        </button>
      )}
    </div>
  )
}

// ── AdGuard stats view (shared between WidgetCard and DashboardWidgetCard) ────
export function AdGuardStatsView({
  stats,
  isAdmin,
  toggling,
  onToggle,
}: {
  stats: AdGuardStats
  isAdmin: boolean
  toggling: boolean
  onToggle: () => void
}) {
  const isError = stats.total_queries === -1
  if (isError) {
    return <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0' }}>Unreachable</div>
  }
  const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, textAlign: 'center' }}>
        <AdGuardStat label="Total" value={fmt(stats.total_queries)} />
        <AdGuardStat label="Blocked" value={fmt(stats.blocked_queries)} />
        <AdGuardStat label="Rate" value={`${stats.blocked_percent}%`} highlight />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {stats.protection_enabled
            ? <Shield size={13} style={{ color: 'var(--status-online)' }} />
            : <ShieldOff size={13} style={{ color: 'var(--text-muted)' }} />
          }
          <span style={{ fontSize: 12, color: stats.protection_enabled ? 'var(--status-online)' : 'var(--text-muted)' }}>
            {stats.protection_enabled ? 'Protected' : 'Paused'}
          </span>
        </div>
        {isAdmin && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={onToggle}
            disabled={toggling}
            style={{ fontSize: 11, padding: '3px 10px', gap: 4 }}
          >
            {toggling
              ? <div className="spinner" style={{ width: 10, height: 10, borderWidth: 1.5 }} />
              : stats.protection_enabled ? <ShieldOff size={11} /> : <Shield size={11} />
            }
            {stats.protection_enabled ? 'Pause' : 'Enable'}
          </button>
        )}
      </div>
    </div>
  )
}

function AdGuardStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-mono)', color: highlight ? 'var(--accent)' : 'var(--text-primary)' }}>
        {value}
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</div>
    </div>
  )
}

function StatBar({ label, value, unit, extra }: { label: string; value: number | null; unit: string; extra?: string }) {
  const pct = value ?? 0
  const color = pct >= 90 ? 'var(--status-offline)' : pct >= 70 ? '#f59e0b' : 'var(--accent)'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
        <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{label}</span>
        <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
          {value === null ? '—' : `${value}${unit}`}
          {extra && <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>{extra}</span>}
        </span>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: 'var(--glass-border)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: color, borderRadius: 2, transition: 'width 0.4s ease' }} />
      </div>
    </div>
  )
}

// ── Main Widgets page ─────────────────────────────────────────────────────────
interface Props {
  showAddForm: boolean
  onFormClose: () => void
}

export function WidgetsPage({ showAddForm, onFormClose }: Props) {
  const { isAdmin } = useStore()
  const { widgets, loadWidgets, createWidget, updateWidget, deleteWidget, uploadWidgetIcon } = useWidgetStore()
  const { isOnDashboard, addWidget, removeByRef } = useDashboardStore()
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => {
    loadWidgets().catch(() => {})
  }, [])

  const handleCreate = async (data: { name: string; type: string; config: object; show_in_topbar: boolean; iconData?: { data: string; contentType: string } | null }) => {
    const { iconData, ...widgetData } = data
    const id = await createWidget(widgetData)
    if (iconData) await uploadWidgetIcon(id, iconData.data, iconData.contentType)
    onFormClose()
  }

  const handleUpdate = async (id: string, data: { name: string; type: string; config: object; show_in_topbar: boolean; iconData?: { data: string; contentType: string } | null }) => {
    const { iconData, ...widgetData } = data
    await updateWidget(id, widgetData)
    if (iconData) await uploadWidgetIcon(id, iconData.data, iconData.contentType)
    setEditingId(null)
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete widget "${name}"?`)) return
    await deleteWidget(id)
  }

  const handleToggleDashboard = async (widget: Widget) => {
    if (isOnDashboard('widget', widget.id)) {
      await removeByRef('widget', widget.id)
    } else {
      await addWidget(widget.id)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Add form */}
      {showAddForm && isAdmin && (
        <WidgetForm
          onSave={handleCreate}
          onCancel={onFormClose}
        />
      )}

      {widgets.length === 0 && !showAddForm && (
        <div className="empty-state">
          <div className="empty-state-icon">◈</div>
          <div className="empty-state-text">
            {isAdmin
              ? 'No widgets yet.\nClick "+ Add Widget" to create one.'
              : 'No widgets available.'}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
        {widgets.map(widget => (
          editingId === widget.id
            ? (
              <WidgetForm
                key={widget.id}
                initial={widget}
                onSave={(data) => handleUpdate(widget.id, data)}
                onCancel={() => setEditingId(null)}
              />
            )
            : (
              <WidgetCard
                key={widget.id}
                widget={widget}
                onEdit={() => setEditingId(widget.id)}
                onDelete={() => handleDelete(widget.id, widget.name)}
                onToggleDashboard={() => handleToggleDashboard(widget)}
                isOnDashboard={isOnDashboard('widget', widget.id)}
              />
            )
        ))}
      </div>
    </div>
  )
}
