import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store/useStore'
import { useArrStore } from '../store/useArrStore'
import { useTmdbStore } from '../store/useTmdbStore'
import { useDashboardStore } from '../store/useDashboardStore'
import { useTrashStore } from '../store/useTrashStore'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { SortableContext, rectSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Pencil, Trash2, Check, X, RefreshCw, GripVertical, LayoutGrid, CalendarDays, Search, Compass, Database, AlertTriangle, Sliders, ChevronDown, ChevronRight, Plus } from 'lucide-react'
import type { ArrInstance, ArrCalendarItem, RadarrCalendarItem, SonarrCalendarItem, ProwlarrStats } from '../types/arr'
import type { TmdbResult, TmdbFilters, TmdbDiscoverFilters } from '../types/tmdb'
import { ArrCardContent, SabnzbdCardContent, SeerrCardContent } from '../components/MediaCard'
// ── Tab type ──────────────────────────────────────────────────────────────────

type MediaTab = 'instances' | 'library' | 'calendar' | 'indexers' | 'discover' | 'trash'

// ── Tab bar ───────────────────────────────────────────────────────────────────

function TabBar({ active, onChange }: { active: MediaTab; onChange: (t: MediaTab) => void }) {
  const tabs: { id: MediaTab; label: string; icon: React.ReactNode }[] = [
    { id: 'instances',  label: 'Instances',  icon: <LayoutGrid size={13} /> },
    { id: 'library',    label: 'Library',    icon: <Database size={13} /> },
    { id: 'calendar',   label: 'Calendar',   icon: <CalendarDays size={13} /> },
    { id: 'indexers',   label: 'Indexers',   icon: <Search size={13} /> },
    { id: 'discover' as MediaTab, label: 'Discover', icon: <Compass size={13} /> },
    { id: 'trash' as MediaTab, label: 'TRaSH', icon: <Sliders size={13} /> },
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
  const { instances, loadInstances, loadAllStats, loadSabQueue, createInstance, updateInstance, deleteInstance, reorderInstances } = useArrStore()
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

  const sabIds = instances.filter(i => i.type === 'sabnzbd' && i.enabled).map(i => i.id).join(',')

  useEffect(() => {
    if (!sabIds) return
    const ids = sabIds.split(',')
    ids.forEach(id => loadSabQueue(id).catch(() => {}))
    const interval = setInterval(() => ids.forEach(id => loadSabQueue(id).catch(() => {})), 2000)
    return () => clearInterval(interval)
  }, [sabIds])

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
          <div className="card-grid" style={{ gap: 14 }}>
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

  // Helper: format date as "Mo, 07.03.2026"
  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  // Helper: short date for calendar items "Mo, 07.03"
  const formatShortDate = (date: Date): string => {
    return date.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })
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

  // Filter by date range and instance (use string comparison for date accuracy)
  const startStr = dateRange.start.getFullYear() + '-' + String(dateRange.start.getMonth() + 1).padStart(2, '0') + '-' + String(dateRange.start.getDate()).padStart(2, '0')
  const endStr = dateRange.end.getFullYear() + '-' + String(dateRange.end.getMonth() + 1).padStart(2, '0') + '-' + String(dateRange.end.getDate()).padStart(2, '0')

  const dateFilteredEvents = events.filter(e => {
    return e.date >= startStr && e.date < endStr
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
                      {formatShortDate(new Date(event.date))}
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
  const { instances, indexers, stats, loadIndexers } = useArrStore()
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
              <h3 style={{ fontSize: 14, fontWeight: 600 }}>{inst.name}</h3>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {enabledCount} enabled
              </span>
              {(() => {
                const s = stats[inst.id]
                const failing = s?.type === 'prowlarr' ? (s as ProwlarrStats).failingIndexers : 0
                return failing > 0 ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#f59e0b', background: 'rgba(245,158,11,0.12)', padding: '2px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(245,158,11,0.3)' }}>
                    <AlertTriangle size={11} /> {failing} failing
                  </span>
                ) : null
              })()}
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

type LibrarySortKey = 'az' | 'za' | 'year' | 'missing'
type LibraryFilter = 'all' | 'missing' | 'unmonitored'

function getTypeLabel(type?: string): string {
  return type === 'radarr' ? '🎬' : type === 'sonarr' ? '📺' : '🎥'
}

function LibraryTab() {
  const { instances, movies, series, loadMovies, loadSeries } = useArrStore()
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<LibrarySortKey>('az')
  const [filter, setFilter] = useState<LibraryFilter>('all')

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
  const isRadarr = selected?.type === 'radarr'
  const items: any[] = selected ? (isRadarr ? (movies[selected.id] ?? []) : (series[selected.id] ?? [])) : []

  const isMissing = (item: any): boolean => {
    if (isRadarr) return item.monitored && !item.hasFile
    return item.monitored && (item.statistics?.episodeFileCount ?? 0) < (item.statistics?.episodeCount ?? 0)
  }

  const filtered = items
    .filter((item: any) => {
      const title: string = item.title ?? ''
      if (!title.toLowerCase().includes(search.toLowerCase())) return false
      if (filter === 'missing') return isMissing(item)
      if (filter === 'unmonitored') return !item.monitored
      return true
    })
    .sort((a: any, b: any) => {
      if (sortKey === 'za') return (b.title ?? '').localeCompare(a.title ?? '')
      if (sortKey === 'year') return (b.year ?? 0) - (a.year ?? 0)
      if (sortKey === 'missing') {
        const am = isMissing(a) ? 0 : 1
        const bm = isMissing(b) ? 0 : 1
        return am - bm || (a.title ?? '').localeCompare(b.title ?? '')
      }
      return (a.title ?? '').localeCompare(b.title ?? '')
    })

  const missingCount = items.filter(isMissing).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Controls row */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Instance selector */}
        <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: '6px 8px', display: 'flex', gap: 2 }}>
          {radarrSonarrInstances.map(i => (
            <button
              key={i.id}
              onClick={() => { setSelectedInstanceId(i.id); setFilter('all'); setSearch('') }}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 'var(--radius-md)',
                fontSize: 13, fontWeight: selectedInstanceId === i.id ? 600 : 400,
                background: selectedInstanceId === i.id ? 'rgba(var(--accent-rgb), 0.12)' : 'transparent',
                color: selectedInstanceId === i.id ? 'var(--accent)' : 'var(--text-secondary)',
                border: selectedInstanceId === i.id ? '1px solid rgba(var(--accent-rgb), 0.25)' : '1px solid transparent',
                cursor: 'pointer', transition: 'all 150ms ease', fontFamily: 'var(--font-sans)',
              }}
            >
              <span style={{ fontSize: 14 }}>{getTypeLabel(i.type)}</span>
              {i.name}
            </button>
          ))}
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="Search…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="form-input"
          style={{ flex: 1, minWidth: 150, fontSize: 13, padding: '5px 10px' }}
        />

        {/* Filter chips */}
        <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: '6px 8px', display: 'flex', gap: 2 }}>
          {(['all', 'missing', 'unmonitored'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: '6px 12px', borderRadius: 'var(--radius-md)', fontSize: 12,
                fontWeight: filter === f ? 600 : 400,
                background: filter === f ? 'rgba(var(--accent-rgb), 0.12)' : 'transparent',
                color: filter === f ? 'var(--accent)' : 'var(--text-secondary)',
                border: filter === f ? '1px solid rgba(var(--accent-rgb), 0.25)' : '1px solid transparent',
                cursor: 'pointer', transition: 'all 150ms ease', fontFamily: 'var(--font-sans)',
                textTransform: 'capitalize',
              }}
            >
              {f === 'missing' && missingCount > 0 ? `Missing (${missingCount})` : f === 'all' ? 'All' : f === 'unmonitored' ? 'Unmonitored' : f}
            </button>
          ))}
        </div>

        {/* Sort */}
        <select
          className="form-input"
          value={sortKey}
          onChange={e => setSortKey(e.target.value as LibrarySortKey)}
          style={{ fontSize: 12, padding: '6px 10px', flexShrink: 0 }}
        >
          <option value="az">A → Z</option>
          <option value="za">Z → A</option>
          <option value="year">Newest first</option>
          <option value="missing">Missing first</option>
        </select>

        {loading && <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />}
      </div>

      {/* Results count */}
      {!loading && items.length > 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {filtered.length} of {items.length} {isRadarr ? 'movies' : 'series'}
          {missingCount > 0 && filter !== 'missing' && (
            <span style={{ marginLeft: 10, color: '#f59e0b' }}>• {missingCount} missing</span>
          )}
        </div>
      )}

      {filtered.length === 0 && !loading && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No results found.</p>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14 }}>
        {filtered.map((item: any) => {
          const posterUrl = item.images?.find((i: any) => i.coverType === 'poster')?.remoteUrl
          const title: string = item.title ?? 'Unknown'
          const missing = isMissing(item)

          // Radarr: hasFile boolean. Sonarr: episodeFileCount / episodeCount (aired, no specials/unaired)
          const fileLabel = isRadarr
            ? (item.hasFile ? 'Downloaded' : 'Missing')
            : (() => {
                const got = item.statistics?.episodeFileCount ?? 0
                const total = item.statistics?.episodeCount ?? 0
                return total > 0 ? `${got} / ${total} ep` : '—'
              })()
          const fileColor = isRadarr
            ? (item.hasFile ? '#22c55e' : (item.monitored ? '#ef4444' : 'var(--text-muted)'))
            : (() => {
                const got = item.statistics?.episodeFileCount ?? 0
                const total = item.statistics?.episodeCount ?? 0
                if (total === 0) return 'var(--text-muted)'
                return got >= total ? '#22c55e' : (item.monitored ? '#ef4444' : '#f59e0b')
              })()

          return (
            <div
              key={item.id}
              className="glass"
              style={{ borderRadius: 'var(--radius-lg)', overflow: 'hidden', display: 'flex', flexDirection: 'column', transition: 'all 200ms ease', cursor: 'default' }}
              onMouseEnter={e => {
                ;(e.currentTarget as HTMLElement).style.transform = 'translateY(-3px)'
                ;(e.currentTarget as HTMLElement).style.boxShadow = '0 8px 24px rgba(0,0,0,0.3)'
              }}
              onMouseLeave={e => {
                ;(e.currentTarget as HTMLElement).style.transform = 'none'
                ;(e.currentTarget as HTMLElement).style.boxShadow = 'none'
              }}
            >
              {/* Poster */}
              <div style={{
                aspectRatio: '2 / 3',
                background: posterUrl ? undefined : 'linear-gradient(135deg, rgba(var(--accent-rgb), 0.2), rgba(var(--text-rgb), 0.1))',
                backgroundImage: posterUrl ? `url(${posterUrl})` : undefined,
                backgroundSize: 'cover', backgroundPosition: 'center',
                display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
              }}>
                {!posterUrl && <span style={{ fontSize: 32 }}>{getTypeLabel(selected?.type)}</span>}

                {/* Badges top-right */}
                <div style={{ position: 'absolute', top: 6, right: 6, display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end' }}>
                  {!item.monitored && (
                    <span style={{
                      background: 'rgba(0,0,0,0.75)', color: 'var(--text-muted)',
                      padding: '2px 6px', borderRadius: 'var(--radius-sm)', fontSize: 10, fontWeight: 600,
                      backdropFilter: 'blur(4px)',
                    }}>Unmonitored</span>
                  )}
                  {missing && (
                    <span style={{
                      background: 'rgba(239,68,68,0.85)', color: '#fff',
                      padding: '2px 6px', borderRadius: 'var(--radius-sm)', fontSize: 10, fontWeight: 600,
                      backdropFilter: 'blur(4px)',
                    }}>Missing</span>
                  )}
                </div>
              </div>

              {/* Info */}
              <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={title}>
                  {title}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between' }}>
                  {item.year > 0 && (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.year}</span>
                  )}
                  <span style={{ fontSize: 11, color: fileColor, marginLeft: 'auto' }}>{fileLabel}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Discover tab (TMDB) ────────────────────────────────────────────────────────

const DISCOVER_LANGUAGES = [
  { code: '', label: 'Any language' },
  { code: 'en', label: 'English' },
  { code: 'de', label: 'German' },
  { code: 'fr', label: 'French' },
  { code: 'es', label: 'Spanish' },
  { code: 'it', label: 'Italian' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'zh', label: 'Chinese' },
  { code: 'ru', label: 'Russian' },
  { code: 'nl', label: 'Dutch' },
  { code: 'pl', label: 'Polish' },
  { code: 'sv', label: 'Swedish' },
  { code: 'tr', label: 'Turkish' },
]

const SORT_OPTIONS = [
  { label: 'Popularity', value: 'popularity.desc' },
  { label: 'Rating', value: 'vote_average.desc' },
  { label: 'Release date', value: 'release_date.desc' },
  { label: 'Title A–Z', value: 'original_title.asc' },
]

const DEFAULT_FILTERS: TmdbFilters = {
  mediaType: 'all',
  language: '',
  genreIds: [],
  watchProviderIds: [],
  voteAverageGte: 0,
  releaseYearFrom: '',
  releaseYearTo: '',
  sortBy: 'popularity.desc',
}

function DiscoverTab({ hasTmdbKey, onNavigate }: { hasTmdbKey: boolean; onNavigate: (page: string) => void }) {
  const { instances, seerrRequests, discoverRequest, loadSeerrRequests } = useArrStore()
  const {
    trending, discoverMovies, discoverTv, searchResults, genres, watchProviders, tvDetail,
    loadTrending, loadDiscoverMovies, loadDiscoverTv, search: searchTmdb,
    loadGenres, loadWatchProviders, loadTvDetail, clearSearch,
  } = useTmdbStore()

  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<'trending' | 'movies' | 'tv' | 'search'>('trending')
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchError, setSearchError] = useState<string | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [filters, setFilters] = useState<TmdbFilters>({ ...DEFAULT_FILTERS })
  const [requesting, setRequesting] = useState<string | null>(null)
  const [confirmRequest, setConfirmRequest] = useState<{ item: TmdbResult; mediaType: 'movie' | 'tv'; mediaId: number } | null>(null)
  const [selectedSeasons, setSelectedSeasons] = useState<number[]>([])
  const [tvDetailLoading, setTvDetailLoading] = useState(false)
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const seerrInstances = instances.filter(i => i.type === 'seerr' && i.enabled)
  const seerrInstance = seerrInstances[0]

  // Serialize filters for use in effect deps
  const filtersJson = JSON.stringify(filters)

  // Build server-side filter params
  const buildFilters = (f: TmdbFilters): TmdbDiscoverFilters => ({
    language: f.language || undefined,
    genreIds: f.genreIds.length > 0 ? f.genreIds : undefined,
    watchProviderIds: f.watchProviderIds.length > 0 ? f.watchProviderIds : undefined,
    voteAverageGte: f.voteAverageGte > 0 ? f.voteAverageGte : undefined,
    releaseYearFrom: f.releaseYearFrom || undefined,
    releaseYearTo: f.releaseYearTo || undefined,
  })

  const hasMounted = useRef(false)

  // Initial load
  useEffect(() => {
    hasMounted.current = false
    setPage(1)
    const sf = buildFilters(DEFAULT_FILTERS)
    const load = async () => {
      setLoading(true)
      await Promise.all([
        loadTrending('all', 'day'),
        loadDiscoverMovies(1, DEFAULT_FILTERS.sortBy, sf),
        loadDiscoverTv(1, DEFAULT_FILTERS.sortBy, sf),
        loadGenres(),
        loadWatchProviders(),
        ...(seerrInstance ? [loadSeerrRequests(seerrInstance.id, 'all')] : []),
      ])
      setLoading(false)
      hasMounted.current = true
    }
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Reload movies/tv when filters change
  useEffect(() => {
    if (!hasMounted.current) return
    if (tab !== 'movies' && tab !== 'tv') return
    setPage(1)
    const sf = buildFilters(filters)
    const load = async () => {
      setLoading(true)
      if (tab === 'movies') await loadDiscoverMovies(1, filters.sortBy, sf)
      else await loadDiscoverTv(1, filters.sortBy, sf)
      setLoading(false)
    }
    load()
  }, [filtersJson]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reload when tab switches to movies/tv
  useEffect(() => {
    if (!hasMounted.current) return
    if (tab !== 'movies' && tab !== 'tv') return
    setPage(1)
    const sf = buildFilters(filters)
    const load = async () => {
      setLoading(true)
      if (tab === 'movies') await loadDiscoverMovies(1, filters.sortBy, sf)
      else await loadDiscoverTv(1, filters.sortBy, sf)
      setLoading(false)
    }
    load()
  }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

  // Search debounce
  useEffect(() => {
    if (tab !== 'search' || !searchQuery.trim()) return
    const timer = setTimeout(async () => {
      setPage(1)
      setLoading(true)
      try {
        await searchTmdb(searchQuery, 1, filters.language || undefined)
        setSearchError(null)
      } catch (e) {
        setSearchError(e instanceof Error ? e.message : 'Search failed')
      }
      setLoading(false)
    }, 500)
    return () => clearTimeout(timer)
  }, [tab, searchQuery, filters.language]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-dismiss notification
  useEffect(() => {
    if (!notification) return
    const timer = setTimeout(() => setNotification(null), 4000)
    return () => clearTimeout(timer)
  }, [notification])

  // Pre-select seasons when TV detail loads
  useEffect(() => {
    if (!confirmRequest || confirmRequest.mediaType !== 'tv') return
    const detail = tvDetail[confirmRequest.mediaId]
    if (!detail) return
    const realSeasons = detail.seasons.filter(s => s.season_number > 0)
    const pendingNums = seerrInstance
      ? (seerrRequests[seerrInstance.id]?.results ?? [])
          .filter(r => r.media.mediaType === 'tv' && r.media.tmdbId === confirmRequest.mediaId)
          .flatMap(r => r.seasons?.map(s => s.seasonNumber) ?? [])
      : []
    setSelectedSeasons(realSeasons.filter(s => !pendingNums.includes(s.season_number)).map(s => s.season_number))
  }, [confirmRequest?.mediaId, tvDetail]) // eslint-disable-line react-hooks/exhaustive-deps

  // Resolve raw results
  const rawResults: TmdbResult[] = tab === 'search'
    ? (searchResults?.results ?? [])
    : tab === 'trending'
    ? (trending?.results ?? [])
    : tab === 'movies'
    ? (discoverMovies?.results ?? [])
    : (discoverTv?.results ?? [])

  // Total pages for Load More
  const totalPages = tab === 'movies'
    ? (discoverMovies?.total_pages ?? 1)
    : tab === 'tv'
    ? (discoverTv?.total_pages ?? 1)
    : tab === 'search'
    ? (searchResults?.total_pages ?? 1)
    : 1

  // Client-side filter for trending/search (mediaType, rating, genre)
  const allResults: TmdbResult[] = (() => {
    let results = rawResults.filter(r => r.media_type !== 'person')
    if (tab === 'trending' || tab === 'search') {
      if (filters.mediaType !== 'all') {
        results = results.filter(r => r.media_type === filters.mediaType)
      }
      if (filters.voteAverageGte > 0) {
        results = results.filter(r => (r.vote_average ?? 0) >= filters.voteAverageGte)
      }
      if (filters.genreIds.length > 0) {
        results = results.filter(r => r.genre_ids?.some(g => filters.genreIds.includes(g)))
      }
      switch (filters.sortBy) {
        case 'vote_average.desc':
          results.sort((a, b) => (b.vote_average ?? 0) - (a.vote_average ?? 0)); break
        case 'release_date.desc':
          results.sort((a, b) =>
            (b.release_date ?? b.first_air_date ?? '').localeCompare(a.release_date ?? a.first_air_date ?? '')
          ); break
        case 'original_title.asc':
          results.sort((a, b) => (a.title ?? a.name ?? '').localeCompare(b.title ?? b.name ?? '')); break
      }
    }
    return results
  })()

  // Determine per-item request status (from Seerr requests if available)
  const getItemStatus = (item: TmdbResult): 'available' | 'pending' | 'missing_seasons' | null => {
    if (!seerrInstance) return null
    const requests = seerrRequests[seerrInstance.id]?.results ?? []
    const mt = item.media_type as 'movie' | 'tv'
    const req = requests.find(r => r.media.mediaType === mt && r.media.tmdbId === item.id)
    if (!req) return null
    if (req.media.status === 5) return 'available'
    if (req.media.status === 4) return 'missing_seasons'
    return 'pending'
  }

  // Genre/provider lists depend on current tab
  const genreList = tab === 'tv'
    ? (genres?.tv ?? [])
    : (genres?.movie ?? [])

  const providerList = tab === 'tv'
    ? (watchProviders?.tv ?? [])
    : (watchProviders?.movie ?? [])

  const activeFilterCount = [
    filters.mediaType !== 'all',
    !!filters.language,
    filters.genreIds.length > 0,
    filters.watchProviderIds.length > 0,
    filters.voteAverageGte > 0,
    !!filters.releaseYearFrom || !!filters.releaseYearTo,
  ].filter(Boolean).length

  const handleLoadMore = async () => {
    const nextPage = page + 1
    setPage(nextPage)
    const sf = buildFilters(filters)
    setLoading(true)
    if (tab === 'movies') {
      await loadDiscoverMovies(nextPage, filters.sortBy, sf, true)
    } else if (tab === 'tv') {
      await loadDiscoverTv(nextPage, filters.sortBy, sf, true)
    } else if (tab === 'search' && searchQuery.trim()) {
      await searchTmdb(searchQuery, nextPage, filters.language || undefined, true)
    }
    setLoading(false)
  }

  const openRequestModal = async (item: TmdbResult) => {
    const mt = item.media_type as 'movie' | 'tv'
    setConfirmRequest({ item, mediaType: mt, mediaId: item.id })
    setSelectedSeasons([])
    if (mt === 'tv') {
      if (!tvDetail[item.id]) {
        setTvDetailLoading(true)
        await loadTvDetail(item.id)
        setTvDetailLoading(false)
      }
    }
  }

  if (!hasTmdbKey) {
    return (
      <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 48, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, minHeight: 300 }}>
        <Search size={40} style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>TMDB API Key required</p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
            Add your free TMDB API key in Settings → General to enable Discover.
          </p>
          <button className="btn btn-primary btn-sm" onClick={() => onNavigate('settings')}>
            Go to Settings
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'relative' }}>

      {/* Notification Toast */}
      {notification && (
        <div style={{
          position: 'sticky', top: 0, zIndex: 500,
          padding: '12px 16px', borderRadius: 'var(--radius-md)',
          fontSize: 13, fontWeight: 500,
          backgroundColor: notification.type === 'success' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
          color: notification.type === 'success' ? '#22c55e' : '#ef4444',
          border: `1px solid ${notification.type === 'success' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
        }}>
          {notification.message}
        </div>
      )}

      {/* Tab bar + sort + search + filters toggle */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Tabs */}
        <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: '6px 8px', display: 'flex', gap: 2 }}>
          {(['trending', 'movies', 'tv', 'search'] as const).map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); setPage(1); if (t !== 'search') { setSearchInput(''); setSearchQuery('') } }}
              style={{
                padding: '7px 14px', borderRadius: 'var(--radius-md)',
                fontSize: 13, fontWeight: tab === t ? 600 : 400,
                background: tab === t ? 'rgba(var(--accent-rgb), 0.12)' : 'transparent',
                color: tab === t ? 'var(--accent)' : 'var(--text-secondary)',
                border: tab === t ? '1px solid rgba(var(--accent-rgb), 0.25)' : '1px solid transparent',
                cursor: 'pointer', transition: 'all 150ms ease', textTransform: 'capitalize',
                fontFamily: 'var(--font-sans)',
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Sort dropdown */}
        <select
          value={filters.sortBy}
          onChange={e => setFilters(f => ({ ...f, sortBy: e.target.value }))}
          className="form-input"
          style={{ fontSize: 13, padding: '6px 8px', width: 'auto' }}
        >
          {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        {/* Search input — only active on search tab */}
        {tab === 'search' && (
          <input
            type="text"
            placeholder="Search movies and TV shows…"
            value={searchInput}
            onChange={e => {
              const v = e.target.value
              setSearchInput(v)
              setSearchQuery(v)
              if (!v) { clearSearch(); setSearchError(null) }
            }}
            className="form-input"
            style={{ flex: 1, minWidth: 180, fontSize: 13, padding: '6px 8px' }}
            autoFocus
          />
        )}

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 'auto' }}>
          {loading && <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />}
          {/* Filters toggle */}
          <button
            onClick={() => setFiltersOpen(o => !o)}
            className={activeFilterCount > 0 ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
            style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            <span style={{ fontSize: 10, lineHeight: 1 }}>{filtersOpen ? '▲' : '▼'}</span>
          </button>
        </div>
      </div>

      {/* Search error */}
      {tab === 'search' && searchError && (
        <p style={{ fontSize: 12, color: '#ef4444', margin: '-8px 0 0' }}>{searchError}</p>
      )}

      {/* Collapsible filter panel */}
      {filtersOpen && (
        <div className="glass" style={{ borderRadius: 'var(--radius-lg)', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Row 1: media type, language, rating, years */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>

            {/* Media type toggle */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500 }}>Type</span>
              <div style={{ display: 'flex', gap: 2 }}>
                {(['all', 'movie', 'tv'] as const).map(mt => (
                  <button
                    key={mt}
                    onClick={() => setFilters(f => ({ ...f, mediaType: mt }))}
                    style={{
                      padding: '5px 10px', borderRadius: 'var(--radius-md)', fontSize: 12,
                      background: filters.mediaType === mt ? 'rgba(var(--accent-rgb), 0.2)' : 'rgba(var(--text-rgb), 0.08)',
                      color: filters.mediaType === mt ? 'var(--accent)' : 'var(--text-secondary)',
                      border: filters.mediaType === mt ? '1px solid rgba(var(--accent-rgb), 0.4)' : '1px solid transparent',
                      cursor: 'pointer', transition: 'all 150ms ease', fontFamily: 'var(--font-sans)',
                      textTransform: 'capitalize',
                    }}
                  >
                    {mt === 'all' ? 'All' : mt === 'movie' ? 'Movies' : 'TV'}
                  </button>
                ))}
              </div>
            </div>

            {/* Language */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500 }}>Language</span>
              <select
                value={filters.language}
                onChange={e => setFilters(f => ({ ...f, language: e.target.value }))}
                className="form-input"
                style={{ fontSize: 12, padding: '5px 8px', width: 'auto' }}
              >
                {DISCOVER_LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
              </select>
            </div>

            {/* Min rating slider */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500 }}>
                Min rating{filters.voteAverageGte > 0 ? `: ${filters.voteAverageGte.toFixed(1)}` : ': any'}
              </span>
              <input
                type="range" min={0} max={10} step={0.5}
                value={filters.voteAverageGte}
                onChange={e => setFilters(f => ({ ...f, voteAverageGte: parseFloat(e.target.value) }))}
                style={{ width: 120, accentColor: 'var(--accent)', cursor: 'pointer' }}
              />
            </div>

            {/* Year range */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500 }}>Year</span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  type="text" placeholder="from" maxLength={4}
                  value={filters.releaseYearFrom}
                  onChange={e => { if (/^\d{0,4}$/.test(e.target.value)) setFilters(f => ({ ...f, releaseYearFrom: e.target.value })) }}
                  className="form-input"
                  style={{ width: 60, fontSize: 12, padding: '5px 8px' }}
                />
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>–</span>
                <input
                  type="text" placeholder="to" maxLength={4}
                  value={filters.releaseYearTo}
                  onChange={e => { if (/^\d{0,4}$/.test(e.target.value)) setFilters(f => ({ ...f, releaseYearTo: e.target.value })) }}
                  className="form-input"
                  style={{ width: 60, fontSize: 12, padding: '5px 8px' }}
                />
              </div>
            </div>

            {/* Reset button */}
            {activeFilterCount > 0 && (
              <button
                onClick={() => setFilters({ ...DEFAULT_FILTERS })}
                className="btn btn-ghost btn-sm"
                style={{ fontSize: 12, alignSelf: 'flex-end' }}
              >
                Reset
              </button>
            )}
          </div>

          {/* Row 2: Genres */}
          {genreList.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500 }}>Genres</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {genreList.map(g => {
                  const active = filters.genreIds.includes(g.id)
                  return (
                    <button
                      key={g.id}
                      onClick={() => setFilters(f => ({
                        ...f,
                        genreIds: active ? f.genreIds.filter(id => id !== g.id) : [...f.genreIds, g.id],
                      }))}
                      style={{
                        padding: '4px 10px', borderRadius: 'var(--radius-md)', fontSize: 12,
                        background: active ? 'rgba(var(--accent-rgb), 0.2)' : 'rgba(var(--text-rgb), 0.08)',
                        color: active ? 'var(--accent)' : 'var(--text-secondary)',
                        border: active ? '1px solid rgba(var(--accent-rgb), 0.4)' : '1px solid transparent',
                        cursor: 'pointer', transition: 'all 150ms ease', fontFamily: 'var(--font-sans)',
                      }}
                    >
                      {g.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Row 3: Streaming providers */}
          {providerList.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500 }}>Streaming service</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {providerList.map(p => {
                  const active = filters.watchProviderIds.includes(p.id)
                  const logoUrl = p.logoPath ? `https://image.tmdb.org/t/p/w45${p.logoPath}` : null
                  return (
                    <button
                      key={p.id}
                      onClick={() => setFilters(f => ({
                        ...f,
                        watchProviderIds: active ? f.watchProviderIds.filter(id => id !== p.id) : [...f.watchProviderIds, p.id],
                      }))}
                      title={p.name}
                      style={{
                        padding: 4, borderRadius: 'var(--radius-md)',
                        background: active ? 'rgba(var(--accent-rgb), 0.2)' : 'rgba(var(--text-rgb), 0.06)',
                        border: active ? '2px solid var(--accent)' : '2px solid transparent',
                        cursor: 'pointer', transition: 'all 150ms ease',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      {logoUrl
                        ? <img src={logoUrl} alt={p.name} style={{ width: 32, height: 32, borderRadius: 6, display: 'block' }} />
                        : <span style={{ fontSize: 11, padding: '4px 8px', color: active ? 'var(--accent)' : 'var(--text-secondary)' }}>{p.name}</span>
                      }
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {allResults.length === 0 && !loading && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {tab === 'search' ? (searchQuery ? 'No results found.' : 'Enter a search term…') : 'No results found.'}
          </p>
        </div>
      )}

      {/* Results grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14 }}>
        {allResults.map(item => {
          const posterUrl = item.poster_path ? `https://image.tmdb.org/t/p/w300${item.poster_path}` : null
          const title = item.title ?? item.name ?? 'Unknown'
          const year = item.release_date?.slice(0, 4) ?? item.first_air_date?.slice(0, 4) ?? ''
          const rating = item.vote_average ? Math.round(item.vote_average * 10) / 10 : null
          const overview = item.overview ? item.overview.slice(0, 100) + (item.overview.length > 100 ? '...' : '') : ''
          const itemStatus = getItemStatus(item)
          const canRequest = !!seerrInstance && (itemStatus === null || itemStatus === 'missing_seasons')

          const btnLabel = requesting === `${item.media_type}-${item.id}`
            ? 'Requesting…'
            : itemStatus === 'available' ? '✓ Available'
            : itemStatus === 'pending' ? '⏳ Requested'
            : itemStatus === 'missing_seasons' ? 'Request missing seasons'
            : '+ Request'

          return (
            <div
              key={`${item.media_type}-${item.id}`}
              className="glass"
              style={{
                borderRadius: 'var(--radius-lg)', overflow: 'hidden',
                display: 'flex', flexDirection: 'column',
                transition: 'all 200ms ease',
              }}
              onMouseEnter={e => {
                ;(e.currentTarget as HTMLElement).style.transform = 'translateY(-4px)'
                ;(e.currentTarget as HTMLElement).style.boxShadow = '0 8px 24px rgba(0,0,0,0.3)'
              }}
              onMouseLeave={e => {
                ;(e.currentTarget as HTMLElement).style.transform = 'none'
                ;(e.currentTarget as HTMLElement).style.boxShadow = 'none'
              }}
            >
              {/* Poster */}
              <div style={{
                aspectRatio: '2/3',
                background: posterUrl ? undefined : 'linear-gradient(135deg, rgba(var(--accent-rgb),0.2), rgba(var(--text-rgb),0.1))',
                backgroundImage: posterUrl ? `url(${posterUrl})` : undefined,
                backgroundSize: 'cover', backgroundPosition: 'center',
                display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
              }}>
                {!posterUrl && <span style={{ fontSize: 32 }}>{item.media_type === 'movie' ? '🎬' : '📺'}</span>}

                {/* Media type badge */}
                <div style={{
                  position: 'absolute', top: 8, left: 8,
                  background: 'rgba(0,0,0,0.7)', color: 'var(--accent)',
                  padding: '3px 7px', borderRadius: 'var(--radius-sm)',
                  fontSize: 10, fontWeight: 600, textTransform: 'uppercase', backdropFilter: 'blur(8px)',
                }}>
                  {item.media_type === 'movie' ? 'Movie' : 'TV'}
                </div>

                {/* Rating badge */}
                {rating !== null && rating > 0 && (
                  <div style={{
                    position: 'absolute', top: 8, right: 8,
                    background: 'rgba(0,0,0,0.7)',
                    color: rating >= 7 ? '#22c55e' : rating >= 5 ? '#eab308' : '#ef4444',
                    padding: '3px 7px', borderRadius: 'var(--radius-sm)',
                    fontSize: 11, fontWeight: 600, backdropFilter: 'blur(8px)',
                  }}>
                    ★ {rating}
                  </div>
                )}

                {/* Status badge */}
                {itemStatus && (
                  <div style={{
                    position: 'absolute', bottom: 8, right: 8,
                    background: itemStatus === 'available' ? 'rgba(34,197,94,0.9)' : 'rgba(234,179,8,0.9)',
                    color: '#fff', padding: '3px 7px', borderRadius: 'var(--radius-sm)',
                    fontSize: 10, fontWeight: 600, textTransform: 'uppercase', backdropFilter: 'blur(8px)',
                  }}>
                    {itemStatus === 'available' ? '✓ Available' : '⏳ Requested'}
                  </div>
                )}
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

                {seerrInstance && (
                  <button
                    onClick={e => {
                      e.stopPropagation()
                      if (!canRequest) return
                      openRequestModal(item)
                    }}
                    disabled={!canRequest || requesting === `${item.media_type}-${item.id}`}
                    className={canRequest ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
                    style={{ fontSize: 12, padding: '6px 12px', marginTop: 'auto', opacity: canRequest ? 1 : 0.6 }}
                  >
                    {btnLabel}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Load more */}
      {tab !== 'trending' && allResults.length > 0 && page < totalPages && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 4 }}>
          <button
            onClick={handleLoadMore}
            disabled={loading}
            className="btn btn-ghost btn-sm"
            style={{ fontSize: 12, minWidth: 120 }}
          >
            {loading ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}

      {/* Request modal */}
      {confirmRequest && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, backdropFilter: 'blur(4px)',
        }} onClick={() => setConfirmRequest(null)}>
          <div className="glass" style={{
            borderRadius: 'var(--radius-xl)', padding: 24,
            width: 420, maxWidth: 'calc(100vw - 32px)',
            maxHeight: '80vh', overflowY: 'auto',
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Confirm Request</h3>

            {/* Preview */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
              {confirmRequest.item.poster_path && (
                <img
                  src={`https://image.tmdb.org/t/p/w92${confirmRequest.item.poster_path}`}
                  alt=""
                  style={{ width: 60, borderRadius: 'var(--radius-md)', objectFit: 'cover', flexShrink: 0 }}
                />
              )}
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
                  {confirmRequest.item.title ?? confirmRequest.item.name}
                </p>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {confirmRequest.mediaType === 'movie' ? 'Movie' : 'TV Series'}
                  {(confirmRequest.item.release_date ?? confirmRequest.item.first_air_date) &&
                    ` · ${(confirmRequest.item.release_date ?? confirmRequest.item.first_air_date ?? '').slice(0, 4)}`}
                </p>
              </div>
            </div>

            {/* Season selection for TV */}
            {confirmRequest.mediaType === 'tv' && (() => {
              const detail = tvDetail[confirmRequest.mediaId]
              if (tvDetailLoading) {
                return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                    <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading seasons…</span>
                  </div>
                )
              }
              if (!detail) {
                return (
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
                    Could not load season list. The request will include all seasons.
                  </p>
                )
              }
              const realSeasons = detail.seasons.filter(s => s.season_number > 0)
              const pendingNums = seerrInstance
                ? (seerrRequests[seerrInstance.id]?.results ?? [])
                    .filter(r => r.media.mediaType === 'tv' && r.media.tmdbId === confirmRequest.mediaId)
                    .flatMap(r => r.seasons?.map(s => s.seasonNumber) ?? [])
                : []
              const missingSeasons = realSeasons.filter(s => !pendingNums.includes(s.season_number))
              return (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>Seasons</span>
                    {missingSeasons.length > 0 && (
                      <button
                        onClick={() => setSelectedSeasons(missingSeasons.map(s => s.season_number))}
                        className="btn btn-ghost btn-sm"
                        style={{ fontSize: 11 }}
                      >
                        Select all missing
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {realSeasons.map(s => {
                      const isPending = pendingNums.includes(s.season_number)
                      const isSelected = selectedSeasons.includes(s.season_number)

                      return (
                        <button
                          key={s.season_number}
                          disabled={isPending}
                          onClick={() => {
                            if (isPending) return
                            setSelectedSeasons(prev =>
                              prev.includes(s.season_number)
                                ? prev.filter(n => n !== s.season_number)
                                : [...prev, s.season_number]
                            )
                          }}
                          style={{
                            padding: '6px 10px', borderRadius: 'var(--radius-md)', fontSize: 12,
                            background: isPending
                              ? 'rgba(var(--text-rgb), 0.05)'
                              : isSelected
                              ? 'rgba(var(--accent-rgb), 0.25)'
                              : 'rgba(var(--text-rgb), 0.1)',
                            color: isPending
                              ? 'var(--text-muted)'
                              : isSelected
                              ? 'var(--accent)'
                              : 'var(--text-secondary)',
                            border: isSelected && !isPending ? '1px solid var(--accent)' : '1px solid transparent',
                            cursor: isPending ? 'default' : 'pointer',
                            opacity: isPending ? 0.5 : 1,
                            transition: 'all 150ms ease', fontFamily: 'var(--font-sans)',
                          }}
                        >
                          S{s.season_number}
                          {isPending && <span style={{ fontSize: 10, marginLeft: 4, opacity: 0.75 }}>· Pending</span>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })()}

            {/* Actions */}
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
                  if (!seerrInstance) return
                  const key = `${confirmRequest.mediaType}-${confirmRequest.item.id}`
                  setRequesting(key)
                  try {
                    const seasons = confirmRequest.mediaType === 'tv' && selectedSeasons.length > 0
                      ? selectedSeasons
                      : undefined
                    await discoverRequest(
                      seerrInstance.id,
                      confirmRequest.mediaType,
                      confirmRequest.mediaId,
                      seasons,
                    )
                    setNotification({ type: 'success', message: `✓ ${confirmRequest.mediaType === 'movie' ? 'Movie' : 'Series'} requested!` })
                    setConfirmRequest(null)
                  } catch (e: any) {
                    setNotification({ type: 'error', message: `Error: ${e.message ?? 'Request failed'}` })
                  } finally {
                    setRequesting(null)
                  }
                }}
                disabled={
                  !seerrInstance ||
                  (confirmRequest.mediaType === 'tv' &&
                  !!tvDetail[confirmRequest.mediaId] &&
                  selectedSeasons.length === 0)
                }
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

// ── TRaSH Guides tab ──────────────────────────────────────────────────────────

function TRaSHTab() {
  const { isAdmin } = useStore()
  const { instances } = useArrStore()
  const {
    profiles, configs, formatLists, previews, loading, applying, cacheInfo,
    loadProfiles, loadConfig, loadFormatList, loadCustomFormats,
    saveProfileSlug, saveOverrides, createCustomFormat, updateCustomFormat,
    deleteCustomFormat, loadPreview, applyChangeset, refreshGithub, loadCacheInfo,
    customFormats,
  } = useTrashStore()

  const radarrSonarrInstances = instances.filter(i => (i.type === 'radarr' || i.type === 'sonarr') && i.enabled)

  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(
    radarrSonarrInstances[0]?.id ?? null
  )
  const [refreshing, setRefreshing] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)
  const [localProfileSlug, setLocalProfileSlug] = useState<string>('')
  const [showCustomModal, setShowCustomModal] = useState(false)
  const [editingCF, setEditingCF] = useState<{ id: string; name: string; specifications: string } | null>(null)
  const [cfName, setCfName] = useState('')
  const [cfSpecs, setCfSpecs] = useState('[]')
  const [cfError, setCfError] = useState('')
  const [savingCF, setSavingCF] = useState(false)
  const [localOverrides, setLocalOverrides] = useState<Record<string, { score: string; excluded: boolean }>>({})
  const [overridesDirty, setOverridesDirty] = useState(false)
  const [savingOverrides, setSavingOverrides] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [trashUpdatesOpen, setTrashUpdatesOpen] = useState(false)
  const [changesetOpen, setChangesetOpen] = useState(false)
  const [applyError, setApplyError] = useState('')

  const instanceId = selectedInstanceId

  useEffect(() => {
    loadCacheInfo().catch(() => {})
  }, [])

  useEffect(() => {
    if (!instanceId) return
    loadProfiles(instanceId).catch(() => {})
    loadConfig(instanceId).catch(() => {})
    loadFormatList(instanceId).catch(() => {})
    loadCustomFormats(instanceId).catch(() => {})
  }, [instanceId])

  useEffect(() => {
    if (!instanceId) return
    const config = configs[instanceId]
    setLocalProfileSlug(config?.profile_slug ?? '')
  }, [instanceId, configs])

  useEffect(() => {
    if (!instanceId) return
    const list = formatLists[instanceId] ?? []
    const overrides: Record<string, { score: string; excluded: boolean }> = {}
    for (const entry of list) {
      if (entry.source === 'trash') {
        overrides[entry.slug] = {
          score: entry.scoreOverride !== null ? String(entry.scoreOverride) : '',
          excluded: entry.excluded,
        }
      }
    }
    setLocalOverrides(overrides)
    setOverridesDirty(false)
  }, [instanceId, formatLists])

  const handleRefreshGithub = async () => {
    setRefreshing(true)
    try {
      await refreshGithub()
      if (instanceId) {
        await loadProfiles(instanceId)
        await loadFormatList(instanceId)
      }
    } catch (e: unknown) {
      // ignore
    } finally {
      setRefreshing(false)
    }
  }

  const handleSaveProfile = async () => {
    if (!instanceId) return
    setSavingProfile(true)
    try {
      await saveProfileSlug(instanceId, localProfileSlug || null)
      await loadFormatList(instanceId)
    } finally {
      setSavingProfile(false)
    }
  }

  const handleSaveOverrides = async () => {
    if (!instanceId) return
    setSavingOverrides(true)
    try {
      const overrides = Object.entries(localOverrides).map(([slug, v]) => ({
        format_slug: slug,
        score_override: v.score !== '' ? parseInt(v.score, 10) : null,
        excluded: v.excluded,
      }))
      await saveOverrides(instanceId, overrides)
      setOverridesDirty(false)
    } finally {
      setSavingOverrides(false)
    }
  }

  const handleOpenAddCF = () => {
    setEditingCF(null)
    setCfName('')
    setCfSpecs('[]')
    setCfError('')
    setShowCustomModal(true)
  }

  const handleOpenEditCF = (cf: { id: string; name: string; specifications: object[] }) => {
    setEditingCF({ id: cf.id, name: cf.name, specifications: JSON.stringify(cf.specifications, null, 2) })
    setCfName(cf.name)
    setCfSpecs(JSON.stringify(cf.specifications, null, 2))
    setCfError('')
    setShowCustomModal(true)
  }

  const handleSaveCF = async () => {
    if (!instanceId) return
    if (!cfName.trim()) { setCfError('Name required'); return }
    let specs: object[]
    try {
      specs = JSON.parse(cfSpecs) as object[]
    } catch {
      setCfError('Invalid JSON in specifications')
      return
    }
    setSavingCF(true)
    setCfError('')
    try {
      if (editingCF) {
        await updateCustomFormat(instanceId, editingCF.id, cfName.trim(), specs)
      } else {
        await createCustomFormat(instanceId, cfName.trim(), specs)
      }
      setShowCustomModal(false)
    } catch (e: unknown) {
      setCfError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSavingCF(false)
    }
  }

  const handlePreview = async () => {
    if (!instanceId) return
    setApplyError('')
    try {
      await loadPreview(instanceId)
      setPreviewOpen(true)
      setTrashUpdatesOpen(false)
      setChangesetOpen(false)
    } catch (e: unknown) {
      setApplyError(e instanceof Error ? e.message : 'Preview failed')
    }
  }

  const handleApply = async () => {
    if (!instanceId) return
    if (!confirm('Apply TRaSH Guides changes to Arr? This will create/update custom formats and quality profile scores.')) return
    setApplyError('')
    try {
      const result = await applyChangeset(instanceId)
      const msg = `Applied: ${result.created} created, ${result.updated} updated, ${result.scoresUpdated} scores updated.`
      if (result.errors.length > 0) {
        setApplyError(`${msg} Errors: ${result.errors.slice(0, 3).join('; ')}`)
      } else {
        alert(msg)
      }
      // Reload format list after apply
      await loadFormatList(instanceId)
    } catch (e: unknown) {
      setApplyError(e instanceof Error ? e.message : 'Apply failed')
    }
  }

  const formatRelativeTime = (isoStr: string | null): string => {
    if (!isoStr) return 'Never'
    const diff = Date.now() - new Date(isoStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'Just now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    return `${Math.floor(hours / 24)}d ago`
  }

  const instanceProfiles = instanceId ? (profiles[instanceId] ?? []) : []
  const formatList = instanceId ? (formatLists[instanceId] ?? []) : []
  const preview = instanceId ? previews[instanceId] : undefined
  const instanceCFs = instanceId ? (customFormats[instanceId] ?? []) : []
  const isLoadingFormats = instanceId ? !!loading[`formats_${instanceId}`] : false
  const isLoadingPreview = instanceId ? !!loading[`preview_${instanceId}`] : false
  const isApplying = instanceId ? !!applying[instanceId] : false

  const hasChanges = preview
    ? (preview.toCreate.length + preview.toUpdate.length + preview.toUpdateScores.length +
       preview.customToCreate.length + preview.customToUpdate.length) > 0
    : false

  if (radarrSonarrInstances.length === 0) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No Radarr or Sonarr instances configured.</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Top bar: GitHub refresh + cache info */}
      {isAdmin && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={handleRefreshGithub}
            disabled={refreshing}
            style={{ fontSize: 12, gap: 6 }}
          >
            {refreshing
              ? <div className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />
              : <RefreshCw size={12} />
            }
            Refresh TRaSH data from GitHub
          </button>
          {cacheInfo?.fetchedAt && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Last fetched: {formatRelativeTime(cacheInfo.fetchedAt)}
            </span>
          )}
        </div>
      )}

      {/* Instance selector */}
      {radarrSonarrInstances.length > 1 && (
        <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: '6px 8px', display: 'flex', gap: 2, alignSelf: 'flex-start' }}>
          {radarrSonarrInstances.map(i => (
            <button
              key={i.id}
              onClick={() => setSelectedInstanceId(i.id)}
              style={{
                padding: '7px 14px', borderRadius: 'var(--radius-md)', fontSize: 13,
                fontWeight: selectedInstanceId === i.id ? 600 : 400,
                background: selectedInstanceId === i.id ? 'rgba(var(--accent-rgb), 0.12)' : 'transparent',
                color: selectedInstanceId === i.id ? 'var(--accent)' : 'var(--text-secondary)',
                border: selectedInstanceId === i.id ? '1px solid rgba(var(--accent-rgb), 0.25)' : '1px solid transparent',
                cursor: 'pointer', transition: 'all 150ms ease', fontFamily: 'var(--font-sans)',
              }}
            >
              {i.name}
            </button>
          ))}
        </div>
      )}

      {instanceId && (
        <>
          {/* Section A — Configuration */}
          <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h4 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Configuration</h4>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <select
                className="form-input"
                value={localProfileSlug}
                onChange={e => setLocalProfileSlug(e.target.value)}
                style={{ fontSize: 13, padding: '6px 10px', flex: 1, minWidth: 200 }}
                disabled={!isAdmin}
              >
                <option value="">— Select quality profile —</option>
                {instanceProfiles.map(p => (
                  <option key={p.slug} value={p.slug}>{p.name}</option>
                ))}
              </select>
              {isAdmin && (
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleSaveProfile}
                  disabled={savingProfile}
                  style={{ fontSize: 12, gap: 4 }}
                >
                  <Check size={12} />
                  {savingProfile ? 'Saving…' : 'Save'}
                </button>
              )}
            </div>
          </div>

          {/* Section B — Format customization */}
          <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h4 style={{ fontSize: 14, fontWeight: 600, margin: 0, flex: 1 }}>Format Customization</h4>
              {isAdmin && overridesDirty && (
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleSaveOverrides}
                  disabled={savingOverrides}
                  style={{ fontSize: 12, gap: 4 }}
                >
                  <Check size={12} />
                  {savingOverrides ? 'Saving…' : 'Save overrides'}
                </button>
              )}
              {isAdmin && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={handleOpenAddCF}
                  style={{ fontSize: 12, gap: 4 }}
                >
                  <Plus size={12} />
                  Add custom format
                </button>
              )}
            </div>

            {isLoadingFormats ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading formats…</span>
              </div>
            ) : formatList.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                {configs[instanceId]?.profile_slug
                  ? 'No formats found. Try refreshing TRaSH data from GitHub.'
                  : 'Select a quality profile above to see formats.'}
              </p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 500 }}>Name</th>
                      <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 500 }}>Source</th>
                      <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 500 }}>Default Score</th>
                      <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 500 }}>Your Score</th>
                      <th style={{ textAlign: 'center', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 500 }}>Excluded</th>
                      {isAdmin && <th style={{ padding: '6px 8px' }}></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {formatList.map(entry => {
                      const overrideVal = localOverrides[entry.slug]
                      const isOverridden = entry.source === 'trash' && (
                        (overrideVal?.score !== undefined && overrideVal.score !== '') ||
                        overrideVal?.excluded
                      )
                      const rowBg = isOverridden ? 'var(--accent-ghost)' : 'transparent'
                      return (
                        <tr
                          key={entry.slug}
                          style={{
                            background: rowBg,
                            borderBottom: '1px solid rgba(var(--text-rgb), 0.06)',
                          }}
                        >
                          <td style={{ padding: '7px 8px', color: 'var(--text-primary)' }}>{entry.name}</td>
                          <td style={{ padding: '7px 8px' }}>
                            {entry.source === 'trash'
                              ? <span className="badge badge-neutral" style={{ fontSize: 10 }}>TRaSH</span>
                              : <span className="badge badge-accent" style={{ fontSize: 10 }}>Custom</span>
                            }
                          </td>
                          <td style={{ padding: '7px 8px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                            {entry.defaultScore !== 0 ? entry.defaultScore : '—'}
                          </td>
                          <td style={{ padding: '7px 8px', textAlign: 'right' }}>
                            {entry.source === 'trash' ? (
                              <input
                                type="number"
                                value={overrideVal?.score ?? ''}
                                onChange={e => {
                                  if (!isAdmin) return
                                  setLocalOverrides(prev => ({
                                    ...prev,
                                    [entry.slug]: { ...prev[entry.slug], score: e.target.value },
                                  }))
                                  setOverridesDirty(true)
                                }}
                                placeholder="default"
                                disabled={!isAdmin}
                                style={{
                                  width: 70, textAlign: 'right',
                                  background: 'rgba(var(--text-rgb), 0.06)',
                                  border: '1px solid var(--border)',
                                  borderRadius: 'var(--radius-sm)',
                                  padding: '3px 6px', fontSize: 12,
                                  color: 'var(--text-primary)',
                                }}
                              />
                            ) : '—'}
                          </td>
                          <td style={{ padding: '7px 8px', textAlign: 'center' }}>
                            {entry.source === 'trash' ? (
                              <input
                                type="checkbox"
                                checked={overrideVal?.excluded ?? false}
                                onChange={e => {
                                  if (!isAdmin) return
                                  setLocalOverrides(prev => ({
                                    ...prev,
                                    [entry.slug]: { ...prev[entry.slug], excluded: e.target.checked },
                                  }))
                                  setOverridesDirty(true)
                                }}
                                disabled={!isAdmin}
                              />
                            ) : '—'}
                          </td>
                          {isAdmin && (
                            <td style={{ padding: '7px 8px' }}>
                              {entry.source === 'custom' && (
                                <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                                  <button
                                    className="btn btn-ghost btn-icon btn-sm"
                                    onClick={() => {
                                      const cf = instanceCFs.find(c => c.id === entry.slug)
                                      if (cf) handleOpenEditCF(cf)
                                    }}
                                    style={{ width: 24, height: 24, padding: 3 }}
                                  >
                                    <Pencil size={10} />
                                  </button>
                                  <button
                                    className="btn btn-danger btn-icon btn-sm"
                                    onClick={() => {
                                      if (confirm(`Delete custom format "${entry.name}"?`)) {
                                        deleteCustomFormat(instanceId, entry.slug).catch(() => {})
                                      }
                                    }}
                                    style={{ width: 24, height: 24, padding: 3 }}
                                  >
                                    <Trash2 size={10} />
                                  </button>
                                </div>
                              )}
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Section C — Preview */}
          <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h4 style={{ fontSize: 14, fontWeight: 600, margin: 0, flex: 1 }}>Preview</h4>
              <button
                className="btn btn-ghost btn-sm"
                onClick={handlePreview}
                disabled={isLoadingPreview || !configs[instanceId]?.profile_slug}
                style={{ fontSize: 12, gap: 4 }}
              >
                {isLoadingPreview
                  ? <div className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />
                  : <RefreshCw size={12} />
                }
                Preview changes
              </button>
            </div>

            {applyError && (
              <div style={{ fontSize: 12, color: 'var(--status-offline)', padding: '8px 12px', background: 'rgba(239,68,68,0.1)', borderRadius: 'var(--radius-md)' }}>
                {applyError}
              </div>
            )}

            {preview && previewOpen && (
              <>
                {/* TRaSH updates section */}
                {(preview.trashUpdates.newFormats.length > 0 ||
                  preview.trashUpdates.updatedFormats.length > 0 ||
                  preview.trashUpdates.removedFromTRaSH.length > 0) && (
                  <div>
                    <button
                      onClick={() => setTrashUpdatesOpen(v => !v)}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer', background: 'none', border: 'none', color: 'var(--text-primary)', padding: 0 }}
                    >
                      {trashUpdatesOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      TRaSH Guide changes
                    </button>
                    {trashUpdatesOpen && (
                      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 20 }}>
                        {preview.trashUpdates.newFormats.length > 0 && (
                          <div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>New formats</div>
                            {preview.trashUpdates.newFormats.map(f => (
                              <div key={f.slug} style={{ fontSize: 12, color: '#10b981' }}>+ {f.name}</div>
                            ))}
                          </div>
                        )}
                        {preview.trashUpdates.updatedFormats.length > 0 && (
                          <div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Updated formats</div>
                            {preview.trashUpdates.updatedFormats.map(f => (
                              <div key={f.slug} style={{ fontSize: 12, color: '#f59e0b' }}>~ {f.name}</div>
                            ))}
                          </div>
                        )}
                        {preview.trashUpdates.removedFromTRaSH.length > 0 && (
                          <div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                              Removed from TRaSH <span className="badge badge-warning" style={{ fontSize: 10 }}>stays in Arr unless manually deleted</span>
                            </div>
                            {preview.trashUpdates.removedFromTRaSH.map(f => (
                              <div key={f.slug} style={{ fontSize: 12, color: '#f87171' }}>- {f.name}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Changeset section */}
                <div>
                  <button
                    onClick={() => setChangesetOpen(v => !v)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer', background: 'none', border: 'none', color: 'var(--text-primary)', padding: 0 }}
                  >
                    {changesetOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    Changeset ({preview.toCreate.length + preview.toUpdate.length + preview.toUpdateScores.length} changes, {preview.noChange} unchanged, {preview.excluded} excluded)
                  </button>
                  {changesetOpen && (
                    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 20, fontSize: 12 }}>
                      {preview.toCreate.length > 0 && (
                        <div>
                          <div style={{ color: 'var(--text-muted)', marginBottom: 4 }}>To create ({preview.toCreate.length})</div>
                          {preview.toCreate.map(f => <div key={f.slug} style={{ color: '#10b981' }}>+ {f.name}</div>)}
                        </div>
                      )}
                      {preview.toUpdate.length > 0 && (
                        <div>
                          <div style={{ color: 'var(--text-muted)', marginBottom: 4 }}>To update ({preview.toUpdate.length})</div>
                          {preview.toUpdate.map(f => <div key={f.slug} style={{ color: '#f59e0b' }}>~ {f.name} — {f.changeDescription}</div>)}
                        </div>
                      )}
                      {preview.toUpdateScores.length > 0 && (
                        <div>
                          <div style={{ color: 'var(--text-muted)', marginBottom: 4 }}>Score changes ({preview.toUpdateScores.length})</div>
                          {preview.toUpdateScores.map(f => (
                            <div key={f.slug} style={{ color: '#60a5fa' }}>
                              {f.name}: {f.oldScore} → {f.newScore}
                            </div>
                          ))}
                        </div>
                      )}
                      {(preview.customToCreate.length > 0 || preview.customToUpdate.length > 0) && (
                        <div>
                          <div style={{ color: 'var(--text-muted)', marginBottom: 4 }}>Custom formats ({preview.customToCreate.length + preview.customToUpdate.length})</div>
                          {preview.customToCreate.map(f => <div key={f.slug} style={{ color: '#10b981' }}>+ {f.name}</div>)}
                          {preview.customToUpdate.map(f => <div key={f.slug} style={{ color: '#f59e0b' }}>~ {f.name}</div>)}
                        </div>
                      )}
                      <div style={{ color: 'var(--text-muted)' }}>No change: {preview.noChange} · Excluded: {preview.excluded}</div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Section D — Apply */}
          {isAdmin && (
            <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <h4 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Apply</h4>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleApply}
                  disabled={isApplying || !preview || !hasChanges}
                  style={{ fontSize: 12, gap: 4 }}
                >
                  {isApplying
                    ? <div className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />
                    : <Check size={12} />
                  }
                  {isApplying ? 'Applying…' : 'Apply changes'}
                </button>
                {!preview && (
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Run preview first</span>
                )}
                {preview && !hasChanges && (
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Nothing to apply</span>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Custom format modal */}
      {showCustomModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(4px)',
        }}>
          <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 24, width: '90%', maxWidth: 520, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h4 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>
              {editingCF ? 'Edit custom format' : 'Add custom format'}
            </h4>
            <input
              className="form-input"
              placeholder="Name *"
              value={cfName}
              onChange={e => setCfName(e.target.value)}
            />
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
                Specifications (use Radarr/Sonarr custom format JSON spec format)
              </div>
              <textarea
                className="form-input"
                value={cfSpecs}
                onChange={e => setCfSpecs(e.target.value)}
                rows={8}
                style={{ fontFamily: 'var(--font-mono)', fontSize: 11, resize: 'vertical' }}
                placeholder="[]"
              />
            </div>
            {cfError && <div style={{ fontSize: 12, color: 'var(--status-offline)' }}>{cfError}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary btn-sm" onClick={handleSaveCF} disabled={savingCF} style={{ fontSize: 12, gap: 4 }}>
                <Check size={12} /> {savingCF ? 'Saving…' : 'Save'}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowCustomModal(false)} style={{ fontSize: 12, gap: 4 }}>
                <X size={12} /> Cancel
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
  onNavigate?: (page: string) => void
}

export function MediaPage({ showAddForm: showFromParent, onFormClose, onNavigate }: Props) {
  const { settings } = useStore()
  const [activeTab, setActiveTab] = useState<MediaTab>('instances')

  // When Topbar "Add Instance" fires, switch to Instances tab
  useEffect(() => {
    if (showFromParent) {
      setActiveTab('instances')
    }
  }, [showFromParent])

  const hasTmdbKey = !!(settings?.tmdb_api_key)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, flex: 1 }}>Media</h2>
      </div>

      <TabBar active={activeTab} onChange={setActiveTab} />

      {activeTab === 'instances' && (
        <InstancesTab showAddForm={showFromParent} onFormClose={onFormClose} />
      )}
      {activeTab === 'library' && <LibraryTab />}
      {activeTab === 'calendar' && <CalendarTab />}
      {activeTab === 'indexers' && <IndexersTab />}
      {activeTab === 'discover' && <DiscoverTab hasTmdbKey={hasTmdbKey} onNavigate={onNavigate ?? (() => {})} />}
      {activeTab === 'trash' && <TRaSHTab />}
    </div>
  )
}
