import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore'
import { useArrStore } from '../store/useArrStore'
import { useDashboardStore } from '../store/useDashboardStore'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { SortableContext, rectSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Pencil, Trash2, Check, X, RefreshCw, GripVertical, LayoutGrid, CalendarDays, Search, BarChart2, Compass, Database, Tv2 } from 'lucide-react'
import type { ArrInstance, ArrCalendarItem, RadarrCalendarItem, SonarrCalendarItem, RadarrStats, SonarrStats, ProwlarrStats, SabnzbdStats } from '../types/arr'
import { ArrCardContent, SabnzbdCardContent, SeerrCardContent } from '../components/MediaCard'

// ── Tab type ──────────────────────────────────────────────────────────────────

type MediaTab = 'instances' | 'library' | 'calendar' | 'indexers' | 'statistics' | 'discover'

// ── Tab bar ───────────────────────────────────────────────────────────────────

function TabBar({ active, onChange, showDiscover }: { active: MediaTab; onChange: (t: MediaTab) => void; showDiscover: boolean }) {
  const tabs: { id: MediaTab; label: string; icon: React.ReactNode }[] = [
    { id: 'instances',  label: 'Instances',  icon: <LayoutGrid size={13} /> },
    { id: 'library',    label: 'Library',    icon: <Database size={13} /> },
    { id: 'calendar',   label: 'Calendar',   icon: <CalendarDays size={13} /> },
    { id: 'indexers',   label: 'Indexers',   icon: <Search size={13} /> },
    { id: 'statistics', label: 'Statistics', icon: <BarChart2 size={13} /> },
    ...(showDiscover ? [{ id: 'discover' as MediaTab, label: 'Discover', icon: <Compass size={13} /> }] : []),
  ]
  return (
    <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: '6px 8px', display: 'flex', gap: 2, alignSelf: 'flex-start', flexWrap: 'wrap' }}>
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 14px',
            borderRadius: 'var(--radius-md)',
            fontSize: 13, fontWeight: active === t.id ? 600 : 400,
            background: active === t.id ? 'rgba(var(--accent-rgb), 0.12)' : 'transparent',
            color: active === t.id ? 'var(--accent)' : 'var(--text-secondary)',
            border: active === t.id ? '1px solid rgba(var(--accent-rgb), 0.25)' : '1px solid transparent',
            cursor: 'pointer',
            transition: 'all 150ms ease',
            fontFamily: 'var(--font-sans)',
          }}
        >
          {t.icon}
          {t.label}
        </button>
      ))}
    </div>
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

  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}>
      <div
        className="glass"
        style={{ borderRadius: 'var(--radius-xl)', padding: 20, display: 'flex', flexDirection: 'column', gap: 14, position: 'relative' }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {isAdmin && (
          <div
            {...attributes}
            {...listeners}
            style={{
              position: 'absolute', top: 12, left: 12, cursor: 'grab', padding: 4,
              opacity: hovered ? 0.5 : 0, transition: 'opacity 150ms ease', color: 'var(--text-muted)', zIndex: 1,
            }}
          >
            <GripVertical size={14} />
          </div>
        )}

        <div style={{ paddingLeft: isAdmin ? 16 : 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {instance.type === 'sabnzbd'
            ? <SabnzbdCardContent instance={instance} />
            : instance.type === 'seerr'
              ? <SeerrCardContent instance={instance} />
              : <ArrCardContent instance={instance} />
          }
        </div>

        {isAdmin && !isEditing && (
          <div style={{
            position: 'absolute', bottom: 12, right: 12, display: 'flex', gap: 4,
            opacity: hovered ? 1 : 0, transition: 'opacity 150ms ease',
          }}>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={onEdit} style={{ width: 26, height: 26, padding: 4 }}>
              <Pencil size={11} />
            </button>
            <button className="btn btn-danger btn-icon btn-sm" onClick={onDelete} style={{ width: 26, height: 26, padding: 4 }}>
              <Trash2 size={11} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Instance edit form ────────────────────────────────────────────────────────

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
          <option value="seerr">Seerr</option>
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

// ── Instances tab ─────────────────────────────────────────────────────────────

function InstancesTab({ showAddForm: showFromParent, onFormClose }: { showAddForm?: boolean; onFormClose?: () => void }) {
  const { isAdmin } = useStore()
  const { instances, loadInstances, loadAllStats, createInstance, updateInstance, deleteInstance, reorderInstances } = useArrStore()
  const { addArrInstance, removeByRef, isOnDashboard, getDashboardItemId, removeItem } = useDashboardStore()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

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
    const reordered = arrayMove(sorted, oldIndex, newIndex)
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, flex: 1 }}>Instances</h3>
        <button className="btn btn-ghost btn-icon" data-tooltip="Refresh stats" onClick={handleRefresh} disabled={refreshing}>
          {refreshing
            ? <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
            : <RefreshCw size={16} />
          }
        </button>
      </div>

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

      {isAdmin && showAddForm && (
        <InstanceForm onSave={handleCreate} onCancel={() => setShowAddForm(false)} />
      )}
    </div>
  )
}

// ── Calendar tab ──────────────────────────────────────────────────────────────

function CalendarTab() {
  const { instances, calendars, loadCalendar } = useArrStore()
  const [loading, setLoading] = useState(false)

  const radarrSonarrInstances = instances.filter(i => (i.type === 'radarr' || i.type === 'sonarr') && i.enabled)

  useEffect(() => {
    if (radarrSonarrInstances.length === 0) return
    const loadAll = async () => {
      setLoading(true)
      await Promise.allSettled(radarrSonarrInstances.map(i => loadCalendar(i.id)))
      setLoading(false)
    }
    loadAll()
  }, [radarrSonarrInstances.map(i => i.id).join(',')])

  // Build unified calendar: group events by date
  const events: Array<{ date: string; items: Array<{ title: string; type: 'movie' | 'episode'; instanceId: string; instanceName: string; hasFile: boolean }> }> = []

  radarrSonarrInstances.forEach(inst => {
    const items = calendars[inst.id] ?? []
    items.forEach(item => {
      let dateStr: string | undefined
      let type: 'movie' | 'episode'
      let title: string

      if (inst.type === 'radarr') {
        const radarrItem = item as RadarrCalendarItem
        dateStr = radarrItem.inCinemas || radarrItem.digitalRelease
        type = 'movie'
        title = radarrItem.title
      } else {
        const sonarrItem = item as SonarrCalendarItem
        dateStr = sonarrItem.airDateUtc?.split('T')[0]
        type = 'episode'
        title = `${sonarrItem.series.title} S${String(sonarrItem.seasonNumber).padStart(2, '0')}E${String(sonarrItem.episodeNumber).padStart(2, '0')}`
      }

      if (!dateStr) return

      let event = events.find(e => e.date === dateStr)
      if (!event) {
        event = { date: dateStr, items: [] }
        events.push(event)
      }
      event.items.push({
        title,
        type,
        instanceId: inst.id,
        instanceName: inst.name,
        hasFile: 'hasFile' in item ? item.hasFile : false,
      })
    })
  })

  events.sort((a, b) => a.date.localeCompare(b.date))

  if (radarrSonarrInstances.length === 0) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No Radarr/Sonarr instances configured.</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Loading calendar…</span>
        </div>
      )}

      {events.length === 0 && !loading && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No upcoming releases.</p>
        </div>
      )}

      {events.map(event => (
        <div key={event.date} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h4 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
            {new Date(event.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {event.items.map((item, idx) => (
              <div key={`${event.date}-${idx}`} className="glass" style={{ borderRadius: 'var(--radius-lg)', padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ fontSize: 18 }}>
                  {item.type === 'movie' ? '🎬' : '📺'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.title}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                    {item.instanceName}
                  </div>
                </div>
                {item.hasFile && (
                  <div style={{ fontSize: 11, background: 'rgba(var(--accent-rgb), 0.15)', color: 'var(--accent)', padding: '2px 6px', borderRadius: 'var(--radius-sm)' }}>
                    Downloaded
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Indexers tab ──────────────────────────────────────────────────────────────

function IndexersTab() {
  const { instances, indexers, loadIndexers } = useArrStore()
  const [loading, setLoading] = useState(false)

  const prowlarrInstances = instances.filter(i => i.type === 'prowlarr' && i.enabled)

  useEffect(() => {
    if (prowlarrInstances.length === 0) return
    const loadAll = async () => {
      setLoading(true)
      await Promise.allSettled(prowlarrInstances.map(i => loadIndexers(i.id)))
      setLoading(false)
    }
    loadAll()
  }, [prowlarrInstances.map(i => i.id).join(',')])

  if (prowlarrInstances.length === 0) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No Prowlarr instances configured.</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Loading indexers…</span>
        </div>
      )}

      {prowlarrInstances.map(inst => {
        const instIndexers = indexers[inst.id] ?? []
        const enabledCount = instIndexers.filter(i => i.enable).length

        return (
          <div key={inst.id} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600 }}>
              {inst.name}
              <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-secondary)', marginLeft: 8 }}>
                ({enabledCount} enabled)
              </span>
            </h3>

            {instIndexers.length === 0 && !loading && (
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No indexers configured.</div>
            )}

            {instIndexers.length > 0 && (
              <div className="glass" style={{ borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(var(--text-rgb), 0.1)' }}>
                      <th style={{ padding: '12px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Name</th>
                      <th style={{ padding: '12px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Protocol</th>
                      <th style={{ padding: '12px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>Privacy</th>
                      <th style={{ padding: '12px 14px', textAlign: 'center', fontWeight: 600, color: 'var(--text-secondary)' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {instIndexers.map((indexer, idx) => (
                      <tr key={indexer.id} style={{ borderTop: idx > 0 ? '1px solid rgba(var(--text-rgb), 0.05)' : 'none' }}>
                        <td style={{ padding: '12px 14px' }}>{indexer.name}</td>
                        <td style={{ padding: '12px 14px', color: 'var(--text-secondary)' }}>{indexer.protocol}</td>
                        <td style={{ padding: '12px 14px', color: 'var(--text-secondary)' }}>{indexer.privacy}</td>
                        <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                          <div style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: 12,
                            background: indexer.enable ? 'rgba(34, 197, 94, 0.15)' : 'rgba(var(--text-rgb), 0.08)',
                            color: indexer.enable ? '#22c55e' : 'var(--text-secondary)',
                          }}>
                            {indexer.enable ? 'Enabled' : 'Disabled'}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Statistics tab ────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round((bytes / Math.pow(k, i)) * 10) / 10 + ' ' + sizes[i]
}

function StatisticsTab() {
  const { instances, stats } = useArrStore()
  const enabledInstances = instances.filter(i => i.enabled)

  if (enabledInstances.length === 0) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No instances configured.</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
      {enabledInstances.map(inst => {
        const stat = stats[inst.id]
        if (!stat) {
          return (
            <div key={inst.id} className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{inst.name}</div>
              <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
            </div>
          )
        }

        return (
          <div key={inst.id} className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{inst.name}</div>

            {stat.type === 'radarr' && (
              <>
                <StatRow label="Movies" value={String((stat as RadarrStats).movieCount)} />
                <StatRow label="Monitored" value={String((stat as RadarrStats).monitored)} />
                <StatRow label="With File" value={String((stat as RadarrStats).withFile)} />
                <StatRow label="Size" value={formatBytes((stat as RadarrStats).sizeOnDisk)} />
              </>
            )}

            {stat.type === 'sonarr' && (
              <>
                <StatRow label="Series" value={String((stat as SonarrStats).seriesCount)} />
                <StatRow label="Monitored" value={String((stat as SonarrStats).monitored)} />
                <StatRow label="Episodes" value={String((stat as SonarrStats).episodeCount)} />
                <StatRow label="Size" value={formatBytes((stat as SonarrStats).sizeOnDisk)} />
              </>
            )}

            {stat.type === 'prowlarr' && (
              <>
                <StatRow label="Indexers" value={String((stat as ProwlarrStats).indexerCount)} />
                <StatRow label="Enabled" value={String((stat as ProwlarrStats).enabledIndexers)} />
                <StatRow label="Grabs (24h)" value={String((stat as ProwlarrStats).grabCount24h)} />
              </>
            )}

            {stat.type === 'sabnzbd' && (
              <>
                <StatRow label="Queue Items" value={String((stat as SabnzbdStats).queueCount)} />
                <StatRow label="Speed" value={(stat as SabnzbdStats).speed} />
                <StatRow label="Queue Size" value={`${(stat as SabnzbdStats).mb} MB`} />
                <StatRow label="Free Space" value={`${(stat as SabnzbdStats).diskspaceFreeGb} GB`} />
                <StatRow label="Status" value={(stat as SabnzbdStats).paused ? 'Paused' : 'Active'} />
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ fontWeight: 500 }}>{value}</span>
    </div>
  )
}

// ── Stub tab ──────────────────────────────────────────────────────────────────

function ComingSoonTab({ label }: { label: string }) {
  return (
    <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 48, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>{label} — Coming soon</p>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

interface Props {
  showAddForm?: boolean
  onFormClose?: () => void
}

export function MediaPage({ showAddForm: showFromParent, onFormClose }: Props) {
  const { instances } = useArrStore()
  const [activeTab, setActiveTab] = useState<MediaTab>('instances')

  // When Topbar "Add Instance" fires, switch to Instances tab
  useEffect(() => {
    if (showFromParent) {
      setActiveTab('instances')
    }
  }, [showFromParent])

  const hasSeerr = instances.some(i => i.type === 'seerr' && i.enabled)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, flex: 1 }}>Media</h2>
      </div>

      <TabBar active={activeTab} onChange={setActiveTab} showDiscover={hasSeerr} />

      {activeTab === 'instances' && (
        <InstancesTab showAddForm={showFromParent} onFormClose={onFormClose} />
      )}
      {activeTab === 'library' && <ComingSoonTab label="Library" />}
      {activeTab === 'calendar' && <CalendarTab />}
      {activeTab === 'indexers' && <IndexersTab />}
      {activeTab === 'statistics' && <StatisticsTab />}
      {activeTab === 'discover' && <ComingSoonTab label="Discover" />}
    </div>
  )
}
