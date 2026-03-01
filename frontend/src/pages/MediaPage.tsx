import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore'
import { useArrStore } from '../store/useArrStore'
import { useDashboardStore } from '../store/useDashboardStore'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { SortableContext, rectSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Pencil, Trash2, Check, X, ChevronDown, ChevronUp, RefreshCw, GripVertical } from 'lucide-react'
import type { ArrInstance, ArrStats, ArrStatus, ArrQueueItem, ArrCalendarItem, SonarrCalendarItem, SabnzbdQueueData, SabnzbdHistoryData } from '../types/arr'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

function fmtMb(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`
  if (mb === 0) return '0 MB'
  return `${mb.toFixed(0)} MB`
}

function fmtPct(done: number, total: number): string {
  if (total === 0) return '0%'
  return `${Math.round(((total - done) / total) * 100)}%`
}

const TYPE_LABELS: Record<string, string> = {
  radarr: 'Radarr',
  sonarr: 'Sonarr',
  prowlarr: 'Prowlarr',
  sabnzbd: 'SABnzbd',
}
const TYPE_COLORS: Record<string, string> = {
  radarr: '#f59e0b',
  sonarr: '#3b82f6',
  prowlarr: '#8b5cf6',
  sabnzbd: '#22c55e',
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</span>
      <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>{value}</span>
    </div>
  )
}

function ExpandBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      className="btn btn-ghost btn-sm"
      onClick={onClick}
      style={{ fontSize: 11, gap: 4, padding: '4px 8px', color: active ? 'var(--accent)' : 'var(--text-secondary)' }}
    >
      {label}
      {active ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
    </button>
  )
}

// ── Arr queue / calendar / indexers ───────────────────────────────────────────

function QueueList({ items }: { items: ArrQueueItem[] }) {
  if (items.length === 0) return <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>Queue is empty.</p>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {items.map(item => (
        <div key={item.id} className="glass" style={{ padding: '8px 12px', borderRadius: 'var(--radius-md)', fontSize: 12 }}>
          <div style={{ fontWeight: 500, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</div>
          <div style={{ display: 'flex', gap: 12, color: 'var(--text-muted)' }}>
            <span>{fmtPct(item.sizeleft, item.size)} done</span>
            <span>{fmtBytes(item.sizeleft)} left</span>
            <span style={{ textTransform: 'capitalize' }}>{item.protocol}</span>
            <span style={{ color: item.status === 'downloading' ? 'var(--status-online)' : 'var(--text-muted)', textTransform: 'capitalize' }}>{item.status}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function CalendarList({ items, type }: { items: ArrCalendarItem[]; type: string }) {
  if (items.length === 0) return <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>Nothing upcoming this week.</p>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {items.map(item => {
        const isSonarr = type === 'sonarr'
        const sonarrItem = item as SonarrCalendarItem
        const title = isSonarr
          ? `${sonarrItem.series?.title ?? 'Unknown'} — S${String(sonarrItem.seasonNumber).padStart(2, '0')}E${String(sonarrItem.episodeNumber).padStart(2, '0')}`
          : (item as any).title
        const date = isSonarr ? sonarrItem.airDateUtc : ((item as any).inCinemas ?? (item as any).digitalRelease)
        return (
          <div key={item.id} className="glass" style={{ padding: '8px 12px', borderRadius: 'var(--radius-md)', fontSize: 12, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
            <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
              {date ? new Date(date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : '—'}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function IndexerList({ items }: { items: import('../types/arr').ProwlarrIndexer[] }) {
  if (items.length === 0) return <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>No indexers.</p>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {items.map(idx => (
        <div key={idx.id} className="glass" style={{ padding: '6px 12px', borderRadius: 'var(--radius-md)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: idx.enable ? 'var(--status-online)' : 'var(--status-offline)', flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{idx.name}</span>
          <span style={{ color: 'var(--text-muted)', textTransform: 'capitalize', fontSize: 11 }}>{idx.protocol}</span>
          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{idx.privacy}</span>
        </div>
      ))}
    </div>
  )
}

// ── SABnzbd queue / history ───────────────────────────────────────────────────

function SabnzbdQueueList({ queue }: { queue: SabnzbdQueueData }) {
  if (queue.slots.length === 0) {
    return <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>Queue is empty.</p>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {queue.slots.map(slot => {
        const pct = parseFloat(slot.percentage)
        return (
          <div key={slot.nzo_id} className="glass" style={{ padding: '8px 12px', borderRadius: 'var(--radius-md)', fontSize: 12 }}>
            <div style={{ fontWeight: 500, marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{slot.filename}</div>
            <div style={{ height: 3, background: 'var(--glass-border)', borderRadius: 2, marginBottom: 6, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', borderRadius: 2 }} />
            </div>
            <div style={{ display: 'flex', gap: 12, color: 'var(--text-muted)' }}>
              <span>{pct.toFixed(0)}%</span>
              <span>{fmtMb(slot.mbleft)} left</span>
              <span>{slot.timeleft}</span>
              <span style={{ color: slot.status === 'Downloading' ? 'var(--status-online)' : 'var(--text-muted)' }}>{slot.status}</span>
            </div>
          </div>
        )
      })}
      {queue.noofslots > queue.slots.length && (
        <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', padding: '4px 0' }}>
          +{queue.noofslots - queue.slots.length} more items
        </p>
      )}
    </div>
  )
}

function SabnzbdHistoryList({ history }: { history: SabnzbdHistoryData }) {
  if (history.slots.length === 0) {
    return <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>No history yet.</p>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {history.slots.map(slot => (
        <div key={slot.nzo_id} className="glass" style={{ padding: '6px 12px', borderRadius: 'var(--radius-md)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
            background: slot.status === 'Completed' ? 'var(--status-online)' : 'var(--status-offline)',
          }} />
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{slot.name}</span>
          <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{fmtBytes(slot.bytes)}</span>
          {slot.cat && <span style={{ color: 'var(--text-muted)', fontSize: 11, flexShrink: 0 }}>{slot.cat}</span>}
        </div>
      ))}
    </div>
  )
}

// ── Card content (inner, no drag/action wrappers) ─────────────────────────────

function ArrCardContent({ instance }: { instance: ArrInstance }) {
  const { stats, statuses, queues, calendars, indexers, loadQueue, loadCalendar, loadIndexers } = useArrStore()
  const [expanded, setExpanded] = useState<'queue' | 'calendar' | 'indexers' | null>(null)
  const [loadingExpand, setLoadingExpand] = useState(false)

  const status: ArrStatus | undefined = statuses[instance.id]
  const stat: ArrStats | undefined = stats[instance.id]
  const online = status?.online ?? null

  const handleExpand = async (section: 'queue' | 'calendar' | 'indexers') => {
    if (expanded === section) { setExpanded(null); return }
    setExpanded(section)
    if (section === 'queue' && !queues[instance.id]) {
      setLoadingExpand(true); await loadQueue(instance.id).catch(() => {}); setLoadingExpand(false)
    }
    if (section === 'calendar' && !calendars[instance.id]) {
      setLoadingExpand(true); await loadCalendar(instance.id).catch(() => {}); setLoadingExpand(false)
    }
    if (section === 'indexers' && !indexers[instance.id]) {
      setLoadingExpand(true); await loadIndexers(instance.id).catch(() => {}); setLoadingExpand(false)
    }
  }

  return (
    <>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: 1, padding: '2px 8px',
          borderRadius: 'var(--radius-sm)', background: `${TYPE_COLORS[instance.type]}22`,
          color: TYPE_COLORS[instance.type], border: `1px solid ${TYPE_COLORS[instance.type]}44`,
          textTransform: 'uppercase',
        }}>
          {TYPE_LABELS[instance.type]}
        </span>
        <span style={{ fontWeight: 600, fontSize: 15, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{instance.name}</span>
        <span style={{
          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
          background: online === null ? 'var(--text-muted)' : online ? 'var(--status-online)' : 'var(--status-offline)',
          boxShadow: online ? '0 0 6px var(--status-online)' : 'none',
        }} />
      </div>

      {status?.online && status.version && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {status.instanceName ?? TYPE_LABELS[instance.type]} v{status.version}
        </div>
      )}

      {stat && stat.type !== 'sabnzbd' && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {stat.type === 'radarr' && (
            <>
              <Stat label="Movies" value={stat.movieCount} />
              <Stat label="Monitored" value={stat.monitored} />
              <Stat label="On Disk" value={stat.withFile} />
              <Stat label="Size" value={fmtBytes(stat.sizeOnDisk)} />
            </>
          )}
          {stat.type === 'sonarr' && (
            <>
              <Stat label="Series" value={stat.seriesCount} />
              <Stat label="Monitored" value={stat.monitored} />
              <Stat label="Episodes" value={stat.episodeCount} />
              <Stat label="Size" value={fmtBytes(stat.sizeOnDisk)} />
            </>
          )}
          {stat.type === 'prowlarr' && (
            <>
              <Stat label="Indexers" value={stat.indexerCount} />
              <Stat label="Enabled" value={stat.enabledIndexers} />
              <Stat label="Grabs 24h" value={stat.grabCount24h} />
            </>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {instance.type !== 'prowlarr' && (
          <>
            <ExpandBtn label="Queue" active={expanded === 'queue'} onClick={() => handleExpand('queue')} />
            <ExpandBtn label="Calendar" active={expanded === 'calendar'} onClick={() => handleExpand('calendar')} />
          </>
        )}
        {instance.type === 'prowlarr' && (
          <ExpandBtn label="Indexers" active={expanded === 'indexers'} onClick={() => handleExpand('indexers')} />
        )}
      </div>

      {expanded && (
        <div>
          {loadingExpand
            ? <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
            : expanded === 'queue' && queues[instance.id]
              ? <QueueList items={queues[instance.id]!.records} />
              : expanded === 'calendar' && calendars[instance.id]
                ? <CalendarList items={calendars[instance.id]!} type={instance.type} />
                : expanded === 'indexers' && indexers[instance.id]
                  ? <IndexerList items={indexers[instance.id]!} />
                  : null
          }
        </div>
      )}
    </>
  )
}

function SabnzbdCardContent({ instance }: { instance: ArrInstance }) {
  const { stats, statuses, sabQueues, histories, loadSabQueue, loadHistory } = useArrStore()
  const [expanded, setExpanded] = useState<'queue' | 'history' | null>(null)
  const [loadingExpand, setLoadingExpand] = useState(false)

  const status: ArrStatus | undefined = statuses[instance.id]
  const stat: ArrStats | undefined = stats[instance.id]
  const sabStat = stat?.type === 'sabnzbd' ? stat : undefined
  const online = status?.online ?? null

  const handleExpand = async (section: 'queue' | 'history') => {
    if (expanded === section) { setExpanded(null); return }
    setExpanded(section)
    if (section === 'queue' && !sabQueues[instance.id]) {
      setLoadingExpand(true); await loadSabQueue(instance.id).catch(() => {}); setLoadingExpand(false)
    }
    if (section === 'history' && !histories[instance.id]) {
      setLoadingExpand(true); await loadHistory(instance.id).catch(() => {}); setLoadingExpand(false)
    }
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: 1, padding: '2px 8px',
          borderRadius: 'var(--radius-sm)', background: `${TYPE_COLORS['sabnzbd']}22`,
          color: TYPE_COLORS['sabnzbd'], border: `1px solid ${TYPE_COLORS['sabnzbd']}44`,
          textTransform: 'uppercase',
        }}>SABnzbd</span>
        <span style={{ fontWeight: 600, fontSize: 15, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{instance.name}</span>
        <span style={{
          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
          background: online === null ? 'var(--text-muted)' : online ? 'var(--status-online)' : 'var(--status-offline)',
          boxShadow: online ? '0 0 6px var(--status-online)' : 'none',
        }} />
      </div>

      {status?.online && status.version && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>SABnzbd v{status.version}</div>
      )}

      {sabStat && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <Stat label="Queue" value={sabStat.queueCount} />
          <Stat label="Left" value={fmtMb(sabStat.mbleft)} />
          <Stat label="Speed" value={sabStat.paused ? 'Paused' : (sabStat.speed || '—')} />
          <Stat label="Disk Free" value={`${sabStat.diskspaceFreeGb.toFixed(1)} GB`} />
        </div>
      )}

      <div style={{ display: 'flex', gap: 6 }}>
        <ExpandBtn label="Queue" active={expanded === 'queue'} onClick={() => handleExpand('queue')} />
        <ExpandBtn label="History" active={expanded === 'history'} onClick={() => handleExpand('history')} />
      </div>

      {expanded && (
        <div>
          {loadingExpand
            ? <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
            : expanded === 'queue' && sabQueues[instance.id]
              ? <SabnzbdQueueList queue={sabQueues[instance.id]!} />
              : expanded === 'history' && histories[instance.id]
                ? <SabnzbdHistoryList history={histories[instance.id]!} />
                : null
          }
        </div>
      )}
    </>
  )
}

// ── Sortable card wrapper ─────────────────────────────────────────────────────

function SortableInstanceCard({
  instance,
  isAdmin,
  isEditing,
  onEdit,
  onDelete,
}: {
  instance: ArrInstance
  isAdmin: boolean
  isEditing: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: instance.id })
  const [hovered, setHovered] = useState(false)

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style}>
      <div
        className="glass"
        style={{ borderRadius: 'var(--radius-xl)', padding: 20, display: 'flex', flexDirection: 'column', gap: 14, position: 'relative' }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Drag handle — top-left, admin only */}
        {isAdmin && (
          <div
            {...attributes}
            {...listeners}
            style={{
              position: 'absolute', top: 12, left: 12, cursor: 'grab', padding: 4,
              opacity: hovered ? 0.5 : 0, transition: 'opacity 150ms ease', color: 'var(--text-muted)',
              zIndex: 1,
            }}
          >
            <GripVertical size={14} />
          </div>
        )}

        {/* Card content — padded left to not overlap drag handle */}
        <div style={{ paddingLeft: isAdmin ? 16 : 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {instance.type === 'sabnzbd'
            ? <SabnzbdCardContent instance={instance} />
            : <ArrCardContent instance={instance} />
          }
        </div>

        {/* Edit/delete actions — bottom-right, appear on hover */}
        {isAdmin && !isEditing && (
          <div style={{
            position: 'absolute', bottom: 12, right: 12, display: 'flex', gap: 4,
            opacity: hovered ? 1 : 0, transition: 'opacity 150ms ease',
          }}>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={onEdit} style={{ width: 26, height: 26, padding: 4 }}>
              <Pencil size={11} />
            </button>
            <button
              className="btn btn-danger btn-icon btn-sm"
              onClick={onDelete}
              style={{ width: 26, height: 26, padding: 4 }}
            >
              <Trash2 size={11} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Admin: instance edit form ─────────────────────────────────────────────────

function InstanceForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Partial<ArrInstance> & { api_key?: string }
  onSave: (data: { type: string; name: string; url: string; api_key: string; showOnDashboard: boolean }) => Promise<void>
  onCancel: () => void
}) {
  const { isOnDashboard } = useDashboardStore()
  const [type, setType] = useState(initial?.type ?? 'radarr')
  const [name, setName] = useState(initial?.name ?? '')
  const [url, setUrl] = useState(initial?.url ?? '')
  const [apiKey, setApiKey] = useState('')
  const [showOnDashboard, setShowOnDashboard] = useState(
    initial?.id ? isOnDashboard('arr_instance', initial.id) : false
  )
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setError('')
    if (!name.trim()) return setError('Name required')
    if (!url.trim()) return setError('URL required')
    if (!apiKey.trim() && !initial?.id) return setError('API Key required')
    setSaving(true)
    try {
      await onSave({ type, name: name.trim(), url: url.trim(), api_key: apiKey.trim(), showOnDashboard })
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="glass" style={{ padding: 16, borderRadius: 'var(--radius-xl)', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <select className="form-input" value={type} onChange={e => setType(e.target.value)} style={{ fontSize: 13, padding: '5px 8px', flexShrink: 0 }} disabled={!!initial?.id}>
          <option value="radarr">Radarr</option>
          <option value="sonarr">Sonarr</option>
          <option value="prowlarr">Prowlarr</option>
          <option value="sabnzbd">SABnzbd</option>
        </select>
        <input className="form-input" placeholder="Name *" value={name} onChange={e => setName(e.target.value)} style={{ flex: 1, minWidth: 100 }} />
      </div>
      <input className="form-input" placeholder="URL (e.g. http://192.168.1.100:7878) *" value={url} onChange={e => setUrl(e.target.value)} />
      <input className="form-input" type="password" placeholder={initial?.id ? 'API Key (leave empty to keep)' : 'API Key *'} value={apiKey} onChange={e => setApiKey(e.target.value)} />
      <label className="form-toggle">
        <input type="checkbox" checked={showOnDashboard} onChange={e => setShowOnDashboard(e.target.checked)} />
        <span className="form-label" style={{ margin: 0, fontSize: 13 }}>Show on Dashboard</span>
      </label>
      {error && <div style={{ fontSize: 12, color: 'var(--status-offline)' }}>{error}</div>}
      <div style={{ display: 'flex', gap: 6 }}>
        <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving} style={{ fontSize: 12, gap: 4 }}>
          <Check size={12} /> {saving ? 'Saving…' : 'Save'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onCancel} style={{ fontSize: 12, gap: 4 }}>
          <X size={12} /> Cancel
        </button>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

interface Props {
  showAddForm?: boolean
  onFormClose?: () => void
}

export function MediaPage({ showAddForm: showFromParent, onFormClose }: Props) {
  const { isAdmin } = useStore()
  const { instances, loadInstances, loadAllStats, createInstance, updateInstance, deleteInstance, reorderInstances } = useArrStore()
  const { addArrInstance, removeByRef, isOnDashboard, getDashboardItemId, removeItem } = useDashboardStore()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  // Sync add-form trigger from parent (Topbar button)
  useEffect(() => {
    if (showFromParent) {
      setShowAddForm(true)
      onFormClose?.()
    }
  }, [showFromParent])

  useEffect(() => {
    loadInstances().then(() => loadAllStats()).catch(() => {})
  }, [])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const sorted = [...instances].sort((a, b) => a.position - b.position)

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = sorted.findIndex(i => i.id === active.id)
    const newIndex = sorted.findIndex(i => i.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const reordered = [...sorted]
    const [moved] = reordered.splice(oldIndex, 1)
    reordered.splice(newIndex, 0, moved)
    reorderInstances(reordered.map(i => i.id))
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    await loadAllStats().catch(() => {})
    setRefreshing(false)
  }

  const handleCreate = async (data: { type: string; name: string; url: string; api_key: string; showOnDashboard: boolean }) => {
    const newId = await createInstance({ type: data.type, name: data.name, url: data.url, api_key: data.api_key, position: instances.length })
    if (data.showOnDashboard) await addArrInstance(newId).catch(() => {})
    setShowAddForm(false)
    await loadAllStats()
  }

  const handleUpdate = async (id: string, data: { type: string; name: string; url: string; api_key: string; showOnDashboard: boolean }) => {
    await updateInstance(id, { name: data.name, url: data.url, ...(data.api_key ? { api_key: data.api_key } : {}) })
    const wasOnDashboard = isOnDashboard('arr_instance', id)
    if (data.showOnDashboard && !wasOnDashboard) {
      await addArrInstance(id).catch(() => {})
    } else if (!data.showOnDashboard && wasOnDashboard) {
      const itemId = getDashboardItemId('arr_instance', id)
      if (itemId) await removeItem(itemId).catch(() => {})
      else await removeByRef('arr_instance', id).catch(() => {})
    }
    setEditingId(null)
  }

  if (instances.length === 0 && !isAdmin) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No media instances configured.</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, flex: 1 }}>Media</h2>
        <button className="btn btn-ghost btn-icon" data-tooltip="Refresh stats" onClick={handleRefresh} disabled={refreshing}>
          {refreshing
            ? <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
            : <RefreshCw size={16} />
          }
        </button>
      </div>

      {/* Sortable flat grid */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={sorted.map(i => i.id)} strategy={rectSortingStrategy}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
            {sorted.map(inst => (
              editingId === inst.id
                ? (
                  <InstanceForm
                    key={inst.id}
                    initial={inst}
                    onSave={(data) => handleUpdate(inst.id, data)}
                    onCancel={() => setEditingId(null)}
                  />

                )
                : (
                  <SortableInstanceCard
                    key={inst.id}
                    instance={inst}
                    isAdmin={isAdmin}
                    isEditing={editingId === inst.id}
                    onEdit={() => setEditingId(inst.id)}
                    onDelete={() => { if (confirm(`Delete "${inst.name}"?`)) deleteInstance(inst.id) }}
                  />
                )
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* Admin: add instance form (triggered from Topbar) */}
      {isAdmin && showAddForm && (
        <InstanceForm onSave={handleCreate} onCancel={() => setShowAddForm(false)} />
      )}
    </div>
  )
}
