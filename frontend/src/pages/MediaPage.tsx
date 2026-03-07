import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore'
import { useArrStore } from '../store/useArrStore'
import { useDashboardStore } from '../store/useDashboardStore'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { SortableContext, rectSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Pencil, Trash2, Check, X, RefreshCw, GripVertical, LayoutGrid, CalendarDays, Search, Compass, Database } from 'lucide-react'
import type { ArrInstance, ArrCalendarItem, RadarrCalendarItem, SonarrCalendarItem } from '../types/arr'
import { ArrCardContent, SabnzbdCardContent, SeerrCardContent } from '../components/MediaCard'

// ── Tab type ──────────────────────────────────────────────────────────────────

type MediaTab = 'instances' | 'library' | 'calendar' | 'indexers' | 'discover'

// ── Tab bar ───────────────────────────────────────────────────────────────────

function TabBar({ active, onChange, showDiscover }: { active: MediaTab; onChange: (t: MediaTab) => void; showDiscover: boolean }) {
  const tabs: { id: MediaTab; label: string; icon: React.ReactNode }[] = [
    { id: 'instances',  label: 'Instances',  icon: <LayoutGrid size={13} /> },
    { id: 'library',    label: 'Library',    icon: <Database size={13} /> },
    { id: 'calendar',   label: 'Calendar',   icon: <CalendarDays size={13} /> },
    { id: 'indexers',   label: 'Indexers',   icon: <Search size={13} /> },
    ...(showDiscover ? [{ id: 'discover' as MediaTab, label: 'Discover', icon: <Compass size={13} /> }] : []),
  ]
  return (
    <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: '6px 8px', display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
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

type CalendarView = 'day' | 'week' | 'month' | 'list' | 'grid'

function CalendarTab() {
  const { instances, calendars, loadCalendar } = useArrStore()
  const [loading, setLoading] = useState(false)
  const [view, setView] = useState<CalendarView>('week')
  const [filterInstanceId, setFilterInstanceId] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [loadedUntil, setLoadedUntil] = useState(new Date())

  const radarrSonarrInstances = instances.filter(i => (i.type === 'radarr' || i.type === 'sonarr') && i.enabled)

  // Initial load
  useEffect(() => {
    if (radarrSonarrInstances.length === 0) return
    const loadAll = async () => {
      setLoading(true)
      await Promise.allSettled(radarrSonarrInstances.map(i => loadCalendar(i.id)))
      setLoading(false)
      setLoadedUntil(new Date(Date.now() + 365 * 86400000)) // Assume ~1 year of data loaded
    }
    loadAll()
  }, [radarrSonarrInstances.map(i => i.id).join(',')])

  // Reload if navigating beyond loaded data
  useEffect(() => {
    if (radarrSonarrInstances.length === 0 || selectedDate <= loadedUntil) return
    const loadAll = async () => {
      setLoading(true)
      await Promise.allSettled(radarrSonarrInstances.map(i => loadCalendar(i.id)))
      setLoading(false)
      setLoadedUntil(new Date(Date.now() + 365 * 86400000))
    }
    const timer = setTimeout(loadAll, 300) // Debounce rapid navigation
    return () => clearTimeout(timer)
  }, [selectedDate, radarrSonarrInstances.map(i => i.id).join('')])

  // Helper: format date as DD/MM/YYYY
  const formatDate = (date: Date): string => {
    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const year = date.getFullYear()
    return `${day}/${month}/${year}`
  }

  // Helper: get date range for a given view
  const getDateRange = (): { start: Date; end: Date; label: string } => {
    const d = new Date(selectedDate)
    d.setHours(0, 0, 0, 0)

    if (view === 'day') {
      return {
        start: d,
        end: new Date(d.getTime() + 86400000),
        label: formatDate(d),
      }
    } else if (view === 'week') {
      const start = new Date(d)
      // Start at Monday (1 = Monday, 0 = Sunday)
      const day = start.getDay()
      const diff = start.getDate() - day + (day === 0 ? -6 : 1)
      start.setDate(diff)
      const end = new Date(start)
      end.setDate(end.getDate() + 7)
      return {
        start,
        end,
        label: `${formatDate(start)} — ${formatDate(end)}`,
      }
    } else {
      // month view
      const start = new Date(d.getFullYear(), d.getMonth(), 1)
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 1)
      return {
        start,
        end,
        label: d.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' }),
      }
    }
  }

  const dateRange = getDateRange()

  // Navigation handlers
  const goToday = () => setSelectedDate(new Date())
  const goPrev = () => {
    const d = new Date(selectedDate)
    if (view === 'day') d.setDate(d.getDate() - 1)
    else if (view === 'week') d.setDate(d.getDate() - 7)
    else d.setMonth(d.getMonth() - 1)
    setSelectedDate(d)
  }
  const goNext = () => {
    const d = new Date(selectedDate)
    if (view === 'day') d.setDate(d.getDate() + 1)
    else if (view === 'week') d.setDate(d.getDate() + 7)
    else d.setMonth(d.getMonth() + 1)
    setSelectedDate(d)
  }

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

  // Filter by date range and instance
  const dateFilteredEvents = events.filter(e => {
    const eventDate = new Date(e.date)
    return eventDate >= dateRange.start && eventDate < dateRange.end
  })

  const filteredEvents = filterInstanceId
    ? dateFilteredEvents.map(e => ({
        ...e,
        items: e.items.filter(i => i.instanceId === filterInstanceId),
      })).filter(e => e.items.length > 0)
    : dateFilteredEvents

  if (radarrSonarrInstances.length === 0) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No Radarr/Sonarr instances configured.</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
      {/* Controls */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* View selector */}
        <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: '6px 8px', display: 'flex', gap: 2 }}>
          {(['day', 'week', 'month', 'list', 'grid'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 14px',
                borderRadius: 'var(--radius-md)',
                fontSize: 13, fontWeight: view === v ? 600 : 400,
                background: view === v ? 'rgba(var(--accent-rgb), 0.12)' : 'transparent',
                color: view === v ? 'var(--accent)' : 'var(--text-secondary)',
                border: view === v ? '1px solid rgba(var(--accent-rgb), 0.25)' : '1px solid transparent',
                cursor: 'pointer',
                transition: 'all 150ms ease',
                textTransform: 'capitalize',
                fontFamily: 'var(--font-sans)',
              }}
            >
              {v === 'day' && '📅'}
              {v === 'week' && '📆'}
              {v === 'month' && '🗓'}
              {v === 'list' && '☰'}
              {v === 'grid' && '▦'}
              {' '}{v}
            </button>
          ))}
        </div>

        {/* Date navigation (hidden for list/grid views) */}
        {(['day', 'week', 'month'] as const).includes(view) && (
          <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: '6px 8px', display: 'flex', gap: 2, alignItems: 'center' }}>
            <button
              onClick={goPrev}
              style={{
                padding: '7px 10px',
                borderRadius: 'var(--radius-md)',
                fontSize: 13,
                background: 'transparent',
                color: 'var(--text-secondary)',
                border: '1px solid transparent',
                cursor: 'pointer',
                transition: 'all 150ms ease',
                fontFamily: 'var(--font-sans)',
              }}
            >
              ←
            </button>
            <button
              onClick={goToday}
              style={{
                padding: '7px 12px',
                borderRadius: 'var(--radius-md)',
                fontSize: 13,
                background: 'transparent',
                color: 'var(--text-secondary)',
                border: '1px solid transparent',
                cursor: 'pointer',
                transition: 'all 150ms ease',
                fontFamily: 'var(--font-sans)',
              }}
            >
              Today
            </button>
            <button
              onClick={goNext}
              style={{
                padding: '7px 10px',
                borderRadius: 'var(--radius-md)',
                fontSize: 13,
                background: 'transparent',
                color: 'var(--text-secondary)',
                border: '1px solid transparent',
                cursor: 'pointer',
                transition: 'all 150ms ease',
                fontFamily: 'var(--font-sans)',
              }}
            >
              →
            </button>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 8, paddingLeft: 8, borderLeft: '1px solid rgba(var(--accent-rgb), 0.2)' }}>
              {dateRange.label}
            </div>
          </div>
        )}

        {/* Instance filter */}
        <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: '6px 8px', display: 'flex', gap: 2 }}>
          <button
            onClick={() => setFilterInstanceId(null)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 14px',
              borderRadius: 'var(--radius-md)',
              fontSize: 13, fontWeight: !filterInstanceId ? 600 : 400,
              background: !filterInstanceId ? 'rgba(var(--accent-rgb), 0.12)' : 'transparent',
              color: !filterInstanceId ? 'var(--accent)' : 'var(--text-secondary)',
              border: !filterInstanceId ? '1px solid rgba(var(--accent-rgb), 0.25)' : '1px solid transparent',
              cursor: 'pointer',
              transition: 'all 150ms ease',
              fontFamily: 'var(--font-sans)',
            }}
          >
            All
          </button>
          {radarrSonarrInstances.map(inst => (
            <button
              key={inst.id}
              onClick={() => setFilterInstanceId(inst.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 14px',
                borderRadius: 'var(--radius-md)',
                fontSize: 13, fontWeight: filterInstanceId === inst.id ? 600 : 400,
                background: filterInstanceId === inst.id ? 'rgba(var(--accent-rgb), 0.12)' : 'transparent',
                color: filterInstanceId === inst.id ? 'var(--accent)' : 'var(--text-secondary)',
                border: filterInstanceId === inst.id ? '1px solid rgba(var(--accent-rgb), 0.25)' : '1px solid transparent',
                cursor: 'pointer',
                transition: 'all 150ms ease',
                fontFamily: 'var(--font-sans)',
              }}
            >
              <span style={{ fontSize: 12 }}>{inst.type === 'radarr' ? '🎬' : '📺'}</span>
              {inst.name}
            </button>
          ))}
        </div>

        {loading && <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />}
      </div>

      {/* Content - scrollable */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', paddingRight: 8 }}>
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
            <div className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }} />
          </div>
        )}
        {filteredEvents.length === 0 && !loading && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No releases scheduled for this period.</p>
          </div>
        )}

        {(['list'] as const).includes(view) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {filteredEvents.map(event => (
              <div key={event.date} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <h4 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', position: 'sticky', top: 0, background: 'rgba(0,0,0,0.2)', padding: '8px 12px', borderRadius: 'var(--radius-md)' }}>
                  {formatDate(new Date(event.date))}
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
                        <div style={{ fontSize: 11, background: 'rgba(var(--accent-rgb), 0.15)', color: 'var(--accent)', padding: '4px 8px', borderRadius: 'var(--radius-sm)' }}>
                          ✓ Got it
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {(['grid'] as const).includes(view) && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
            {filteredEvents.flatMap(event =>
              event.items.map((item, idx) => (
                <div
                  key={`${event.date}-${idx}`}
                  className="glass"
                  style={{
                    borderRadius: 'var(--radius-lg)',
                    padding: 14,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
                    <div style={{ fontSize: 16 }}>
                      {item.type === 'movie' ? '🎬' : '📺'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                      {formatDate(new Date(event.date))}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 4 }}>
                      {item.title}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {item.instanceName}
                    </div>
                  </div>
                  {item.hasFile && (
                    <div style={{ fontSize: 11, background: 'rgba(var(--accent-rgb), 0.15)', color: 'var(--accent)', padding: '4px 8px', borderRadius: 'var(--radius-sm)', textAlign: 'center' }}>
                      ✓ Downloaded
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {(['day', 'week', 'month'] as const).includes(view) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {filteredEvents.map(event => (
              <div key={event.date} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <h4 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', position: 'sticky', top: 0, background: 'rgba(0,0,0,0.2)', padding: '8px 12px', borderRadius: 'var(--radius-md)' }}>
                  {formatDate(new Date(event.date))}
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
                        <div style={{ fontSize: 11, background: 'rgba(var(--accent-rgb), 0.15)', color: 'var(--accent)', padding: '4px 8px', borderRadius: 'var(--radius-sm)' }}>
                          ✓ Got it
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 20 }}>🔍</span>
              <h3 style={{ fontSize: 14, fontWeight: 600 }}>
                {inst.name}
                <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-secondary)', marginLeft: 8 }}>
                  ({enabledCount} enabled)
                </span>
              </h3>
            </div>

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

// ── Library tab ───────────────────────────────────────────────────────────────

function getTypeEmoji(type: string): string {
  switch (type) {
    case 'radarr': return '🎬'
    case 'sonarr': return '📺'
    default: return '🎥'
  }
}

function LibraryTab() {
  const { instances, movies, series, loadMovies, loadSeries } = useArrStore()
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null)

  const radarrSonarrInstances = instances.filter(i => (i.type === 'radarr' || i.type === 'sonarr') && i.enabled)

  useEffect(() => {
    if (radarrSonarrInstances.length === 0) return
    const loadAll = async () => {
      setLoading(true)
      await Promise.allSettled(radarrSonarrInstances.map(i => (
        i.type === 'radarr' ? loadMovies(i.id) : loadSeries(i.id)
      )))
      if (!selectedInstanceId && radarrSonarrInstances.length > 0) {
        setSelectedInstanceId(radarrSonarrInstances[0].id)
      }
      setLoading(false)
    }
    loadAll()
  }, [radarrSonarrInstances.map(i => i.id).join(',')])

  if (radarrSonarrInstances.length === 0) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No Radarr/Sonarr instances configured.</p>
      </div>
    )
  }

  const selected = selectedInstanceId ? radarrSonarrInstances.find(i => i.id === selectedInstanceId) : radarrSonarrInstances[0]
  const items = selected?.type === 'radarr' ? (movies[selected.id] ?? []) : (series[selected.id] ?? [])

  const filtered = items
    .filter((item: any) => {
      const title = item.title || item.name || ''
      return title.toLowerCase().includes(search.toLowerCase())
    })
    .sort((a: any, b: any) => {
      const titleA = (a.title || a.name || '').toLowerCase()
      const titleB = (b.title || b.name || '').toLowerCase()
      return titleA.localeCompare(titleB)
    })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: '6px 8px', display: 'flex', gap: 8, alignItems: 'center' }}>
          {radarrSonarrInstances.map(i => (
            <button
              key={i.id}
              onClick={() => setSelectedInstanceId(i.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 14px',
                borderRadius: 'var(--radius-md)',
                fontSize: 13, fontWeight: selectedInstanceId === i.id ? 600 : 400,
                background: selectedInstanceId === i.id ? 'rgba(var(--accent-rgb), 0.12)' : 'transparent',
                color: selectedInstanceId === i.id ? 'var(--accent)' : 'var(--text-secondary)',
                border: selectedInstanceId === i.id ? '1px solid rgba(var(--accent-rgb), 0.25)' : '1px solid transparent',
                cursor: 'pointer',
                transition: 'all 150ms ease',
                fontFamily: 'var(--font-sans)',
              }}
            >
              <span style={{ fontSize: 14 }}>{getTypeEmoji(i.type)}</span>
              {i.name}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Search…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="form-input"
          style={{ flex: 1, minWidth: 150, fontSize: 13, padding: '5px 8px' }}
        />
        {loading && <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />}
      </div>

      {filtered.length === 0 && !loading && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No results found.</p>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14 }}>
        {filtered.map((item: any) => {
          const posterUrl = item.images?.find((i: any) => i.coverType === 'poster')?.remoteUrl
          const title = item.title || item.name || 'Unknown'
          const monitored = item.monitored ? '✓' : '○'
          const hasFile = item.hasFile ? '💾' : '❌'

          return (
            <div
              key={item.id}
              className="glass"
              style={{
                borderRadius: 'var(--radius-lg)',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                gap: 0,
                transition: 'all 200ms ease',
                cursor: 'pointer',
              }}
              onMouseEnter={e => {
                ;(e.currentTarget as HTMLElement).style.transform = 'translateY(-4px)'
                ;(e.currentTarget as HTMLElement).style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.3)'
              }}
              onMouseLeave={e => {
                ;(e.currentTarget as HTMLElement).style.transform = 'none'
                ;(e.currentTarget as HTMLElement).style.boxShadow = 'none'
              }}
            >
              {/* Poster */}
              <div
                style={{
                  aspectRatio: '2 / 3',
                  background: posterUrl ? undefined : 'linear-gradient(135deg, rgba(var(--accent-rgb), 0.2), rgba(var(--text-rgb), 0.1))',
                  backgroundImage: posterUrl ? `url(${posterUrl})` : undefined,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                }}
              >
                {!posterUrl && <span style={{ fontSize: 32 }}>{getTypeEmoji(selected?.type)}</span>}

                {/* Status Badges */}
                <div
                  style={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    display: 'flex',
                    gap: 4,
                    backdropFilter: 'blur(8px)',
                  }}
                >
                  <div
                    style={{
                      background: 'rgba(0, 0, 0, 0.7)',
                      color: monitored === '✓' ? '#22c55e' : '#ef4444',
                      padding: '4px 8px',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: 14,
                    }}
                  >
                    {monitored}
                  </div>
                  <div
                    style={{
                      background: 'rgba(0, 0, 0, 0.7)',
                      color: hasFile === '💾' ? '#22c55e' : '#ef4444',
                      padding: '4px 8px',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: 14,
                    }}
                  >
                    {hasFile}
                  </div>
                </div>
              </div>

              {/* Info */}
              <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {title}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', gap: 8 }}>
                  <span title="Monitored">{monitored} Monitor</span>
                  <span title="File">•</span>
                  <span title="Has File">{hasFile}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Discover tab (Seerr) ───────────────────────────────────────────────────────

function DiscoverTab() {
  const { instances, discoverMovies, discoverTv, discoverTrending, discoverSearch, loadDiscoverMovies, loadDiscoverTv, loadDiscoverTrending, loadDiscoverSearch, discoverRequest } = useArrStore()
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<'trending' | 'movies' | 'tv' | 'search'>('trending')
  const [page, setPage] = useState(1)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [requesting, setRequesting] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState('popularity.desc')
  const [confirmRequest, setConfirmRequest] = useState<{ item: any; mediaType: 'movie' | 'tv'; tmdbId: number } | null>(null)
  const [selectedSeasons, setSelectedSeasons] = useState<number[]>([])

  const seerrInstances = instances.filter(i => i.type === 'seerr' && i.enabled)
  const selected = seerrInstances[0]

  // Load all data on mount in parallel
  useEffect(() => {
    if (!selected) return
    const load = async () => {
      setLoading(true)
      await Promise.all([
        loadDiscoverTrending(selected.id),
        loadDiscoverMovies(selected.id, 1, sortBy),
        loadDiscoverTv(selected.id, 1, sortBy),
      ])
      setLoading(false)
    }
    load()
  }, [selected?.id, sortBy])

  // Load specific page when pagination changes
  useEffect(() => {
    if (!selected || page === 1) return
    const load = async () => {
      if (tab === 'movies') await loadDiscoverMovies(selected.id, page, sortBy)
      else if (tab === 'tv') await loadDiscoverTv(selected.id, page, sortBy)
    }
    load()
  }, [tab, page, selected?.id, sortBy])

  // Handle search: trigger API call when search query changes
  useEffect(() => {
    if (tab !== 'search' || !selected || !searchQuery.trim()) return
    const timer = setTimeout(async () => {
      setLoading(true)
      await loadDiscoverSearch(selected.id, searchQuery)
      setLoading(false)
    }, 300) // Debounce
    return () => clearTimeout(timer)
  }, [searchQuery, selected?.id, tab])

  if (!selected) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No Seerr instances configured.</p>
      </div>
    )
  }

  // Get data based on active tab
  let data: any
  if (tab === 'search') {
    data = discoverSearch[selected.id]
  } else if (tab === 'trending') {
    data = discoverTrending[selected.id]
  } else if (tab === 'movies') {
    data = discoverMovies[selected.id]
  } else {
    data = discoverTv[selected.id]
  }

  const allResults = data?.results ?? []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: '6px 8px', display: 'flex', gap: 2 }}>
          {(['trending', 'movies', 'tv', 'search'] as const).map(t => (
            <button
              key={t}
              onClick={() => {
                setTab(t)
                setPage(1)
                if (t !== 'search') {
                  setSearchInput('')
                  setSearchQuery('')
                }
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 14px',
                borderRadius: 'var(--radius-md)',
                fontSize: 13, fontWeight: tab === t ? 600 : 400,
                background: tab === t ? 'rgba(var(--accent-rgb), 0.12)' : 'transparent',
                color: tab === t ? 'var(--accent)' : 'var(--text-secondary)',
                border: tab === t ? '1px solid rgba(var(--accent-rgb), 0.25)' : '1px solid transparent',
                cursor: 'pointer',
                transition: 'all 150ms ease',
                textTransform: 'capitalize',
                fontFamily: 'var(--font-sans)',
              }}
            >
              {t === 'search' && '🔍'}
              {t !== 'search' && ' '}
              {t}
            </button>
          ))}
        </div>

        {tab !== 'trending' && tab !== 'search' && (
          <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: '6px 8px', display: 'flex', gap: 2 }}>
            {[
              { label: 'Popular', value: 'popularity.desc' },
              { label: 'Top Rated', value: 'vote_average.desc' },
              { label: 'Latest', value: 'release_date.desc' },
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => { setSortBy(opt.value); setPage(1) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '7px 14px',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 13, fontWeight: sortBy === opt.value ? 600 : 400,
                  background: sortBy === opt.value ? 'rgba(var(--accent-rgb), 0.12)' : 'transparent',
                  color: sortBy === opt.value ? 'var(--accent)' : 'var(--text-secondary)',
                  border: sortBy === opt.value ? '1px solid rgba(var(--accent-rgb), 0.25)' : '1px solid transparent',
                  cursor: 'pointer',
                  transition: 'all 150ms ease',
                  fontFamily: 'var(--font-sans)',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}

        <input
          type="text"
          placeholder={tab === 'search' ? 'Search for movies and TV shows…' : 'Filter results…'}
          value={tab === 'search' ? searchInput : ''}
          onChange={e => {
            if (tab === 'search') {
              setSearchInput(e.target.value)
              setSearchQuery(e.target.value)
            }
          }}
          className="form-input"
          style={{ flex: 1, minWidth: 150, fontSize: 13, padding: '5px 8px' }}
          disabled={tab !== 'search'}
        />
        {loading && <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />}
      </div>

      {allResults.length === 0 && !loading && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {tab === 'search' ? (searchQuery ? 'No results found.' : 'Enter a search term…') : 'No results found.'}
          </p>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14 }}>
        {allResults.map((item: any) => {
          const posterUrl = item.posterPath ? `https://image.tmdb.org/t/p/w300${item.posterPath}` : null
          const backdropUrl = item.backdropPath ? `https://image.tmdb.org/t/p/w500${item.backdropPath}` : null
          const title = item.title || item.name || 'Unknown'
          const year = item.releaseDate?.slice(0, 4) || item.firstAirDate?.slice(0, 4) || ''
          const rating = item.voteAverage ? Math.round(item.voteAverage * 10) / 10 : null
          const overview = item.overview?.slice(0, 100) + (item.overview?.length > 100 ? '...' : '') || ''

          return (
            <div
              key={`${item.mediaType}-${item.id}`}
              className="glass"
              style={{
                borderRadius: 'var(--radius-lg)',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                gap: 0,
                transition: 'all 200ms ease',
                cursor: 'pointer',
              }}
              onMouseEnter={e => {
                ;(e.currentTarget as HTMLElement).style.transform = 'translateY(-4px)'
                ;(e.currentTarget as HTMLElement).style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.3)'
              }}
              onMouseLeave={e => {
                ;(e.currentTarget as HTMLElement).style.transform = 'none'
                ;(e.currentTarget as HTMLElement).style.boxShadow = 'none'
              }}
            >
              {/* Poster */}
              <div
                style={{
                  aspectRatio: '2 / 3',
                  background: posterUrl ? undefined : 'linear-gradient(135deg, rgba(var(--accent-rgb), 0.2), rgba(var(--text-rgb), 0.1))',
                  backgroundImage: posterUrl ? `url(${posterUrl})` : undefined,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                }}
              >
                {!posterUrl && <span style={{ fontSize: 32 }}>{item.mediaType === 'movie' ? '🎬' : '📺'}</span>}

                {/* Rating Badge */}
                {rating !== null && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 8,
                      right: 8,
                      background: 'rgba(0, 0, 0, 0.7)',
                      color: rating >= 7 ? '#22c55e' : rating >= 5 ? '#eab308' : '#ef4444',
                      padding: '4px 8px',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: 11,
                      fontWeight: 600,
                      backdropFilter: 'blur(8px)',
                    }}
                  >
                    ★ {rating}
                  </div>
                )}

                {/* Media Type Badge */}
                <div
                  style={{
                    position: 'absolute',
                    top: 8,
                    left: 8,
                    background: 'rgba(0, 0, 0, 0.7)',
                    color: 'var(--accent)',
                    padding: '4px 8px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 10,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    backdropFilter: 'blur(8px)',
                  }}
                >
                  {item.mediaType === 'movie' ? 'Movie' : 'TV'}
                </div>
              </div>

              {/* Info */}
              <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>
                    {title}
                  </div>
                  {year && <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{year}</div>}
                </div>

                {overview && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {overview}
                  </div>
                )}

                <button
                  onClick={e => {
                    e.stopPropagation()
                    setConfirmRequest({ item, mediaType: item.mediaType, tmdbId: item.tmdbId })
                    setSelectedSeasons(item.mediaType === 'tv' ? [1] : [])
                  }}
                  disabled={requesting === `${item.mediaType}-${item.id}`}
                  className="btn btn-primary btn-sm"
                  style={{ fontSize: 12, padding: '6px 12px', marginTop: 'auto' }}
                >
                  {requesting === `${item.mediaType}-${item.id}` ? 'Requesting...' : '+ Request'}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {tab !== 'trending' && allResults.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 12 }}>
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="btn btn-ghost btn-sm"
            style={{ fontSize: 12 }}
          >
            Previous
          </button>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', alignSelf: 'center' }}>Page {page}</span>
          <button
            onClick={() => setPage(page + 1)}
            className="btn btn-ghost btn-sm"
            style={{ fontSize: 12 }}
          >
            Next
          </button>
        </div>
      )}

      {/* Request Confirmation Modal */}
      {confirmRequest && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          backdropFilter: 'blur(4px)',
        }} onClick={() => setConfirmRequest(null)}>
          <div className="glass" style={{
            borderRadius: 'var(--radius-xl)',
            padding: 24,
            maxWidth: 400,
            maxHeight: '80vh',
            overflowY: 'auto',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Confirm Request</h3>

            {/* Item Preview */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
              {confirmRequest.item.posterPath && (
                <img
                  src={`https://image.tmdb.org/t/p/w92${confirmRequest.item.posterPath}`}
                  alt=""
                  style={{ width: 60, borderRadius: 'var(--radius-md)', objectFit: 'cover' }}
                />
              )}
              <div>
                <p style={{ fontSize: 14, fontWeight: 500 }}>
                  {confirmRequest.item.title || confirmRequest.item.name}
                </p>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {confirmRequest.mediaType === 'movie' ? '🎬 Movie' : '📺 TV Series'}
                </p>
              </div>
            </div>

            {/* Season Selection for TV */}
            {confirmRequest.mediaType === 'tv' && (
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>Request Seasons:</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(season => (
                    <button
                      key={season}
                      onClick={() => {
                        setSelectedSeasons(prev =>
                          prev.includes(season)
                            ? prev.filter(s => s !== season)
                            : [...prev, season]
                        )
                      }}
                      style={{
                        padding: '6px 10px',
                        borderRadius: 'var(--radius-md)',
                        fontSize: 12,
                        background: selectedSeasons.includes(season)
                          ? 'rgba(var(--accent-rgb), 0.3)'
                          : 'rgba(var(--text-rgb), 0.1)',
                        color: selectedSeasons.includes(season)
                          ? 'var(--accent)'
                          : 'var(--text-secondary)',
                        border: selectedSeasons.includes(season)
                          ? '1px solid var(--accent)'
                          : '1px solid transparent',
                        cursor: 'pointer',
                        transition: 'all 150ms ease',
                        fontFamily: 'var(--font-sans)',
                      }}
                    >
                      S{season}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setConfirmRequest(null)}
                className="btn btn-ghost btn-sm"
                style={{ flex: 1, fontSize: 12 }}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!selected) return
                  const key = `${confirmRequest.mediaType}-${confirmRequest.item.id}`
                  setRequesting(key)
                  try {
                    await discoverRequest(
                      selected.id,
                      confirmRequest.mediaType,
                      confirmRequest.tmdbId,
                      confirmRequest.mediaType === 'tv' ? selectedSeasons : undefined
                    )
                    alert(`✓ ${confirmRequest.mediaType === 'movie' ? 'Movie' : 'Series'} requested!`)
                    setConfirmRequest(null)
                  } catch (e: any) {
                    alert(`Error: ${e.message || 'Request failed'}`)
                  } finally {
                    setRequesting(null)
                  }
                }}
                disabled={confirmRequest.mediaType === 'tv' && selectedSeasons.length === 0}
                className="btn btn-primary btn-sm"
                style={{ flex: 1, fontSize: 12 }}
              >
                Request
              </button>
            </div>
          </div>
        </div>
      )}
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
      {activeTab === 'library' && <LibraryTab />}
      {activeTab === 'calendar' && <CalendarTab />}
      {activeTab === 'indexers' && <IndexersTab />}
      {activeTab === 'discover' && <DiscoverTab />}
    </div>
  )
}
