import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store/useStore'
import { useArrStore } from '../store/useArrStore'
import { useTmdbStore } from '../store/useTmdbStore'
import { useDashboardStore } from '../store/useDashboardStore'
import { useRecyclarrStore } from '../store/useRecyclarrStore'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { SortableContext, rectSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Pencil, Trash2, Check, X, RefreshCw, GripVertical, LayoutGrid, CalendarDays, Search, Compass, Database, AlertTriangle, Sliders, Plus, ChevronDown, ChevronRight, Clock, Shield } from 'lucide-react'
import type { ArrInstance, ArrCalendarItem, RadarrCalendarItem, SonarrCalendarItem, ProwlarrStats, ArrCFSpecification, RadarrMovie, SonarrSeries } from '../types/arr'
import type { TmdbResult, TmdbFilters, TmdbDiscoverFilters } from '../types/tmdb'
import { ArrCardContent, SabnzbdCardContent, SeerrCardContent } from '../components/MediaCard'
// ── Tab type ──────────────────────────────────────────────────────────────────

type MediaTab = 'instances' | 'library' | 'calendar' | 'indexers' | 'discover' | 'recyclarr' | 'cf-manager'

// ── Tab bar ───────────────────────────────────────────────────────────────────

function TabBar({ active, onChange }: { active: MediaTab; onChange: (t: MediaTab) => void }) {
  const tabs: { id: MediaTab; label: string; icon: React.ReactNode }[] = [
    { id: 'instances',  label: 'Instances',  icon: <LayoutGrid size={13} /> },
    { id: 'library',    label: 'Library',    icon: <Database size={13} /> },
    { id: 'calendar',   label: 'Calendar',   icon: <CalendarDays size={13} /> },
    { id: 'indexers',   label: 'Indexers',   icon: <Search size={13} /> },
    { id: 'discover' as MediaTab, label: 'Discover', icon: <Compass size={13} /> },
    { id: 'recyclarr' as MediaTab, label: 'Recyclarr', icon: <Sliders size={13} /> },
    { id: 'cf-manager' as MediaTab, label: 'CF-Manager', icon: <Shield size={13} /> },
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
    } catch (e: unknown) {
      setError((e as Error).message)
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
  const items: (RadarrMovie | SonarrSeries)[] = selected ? (isRadarr ? (movies[selected.id] ?? []) : (series[selected.id] ?? [])) : []

  const isMissing = (item: RadarrMovie | SonarrSeries): boolean => {
    if (isRadarr) return item.monitored && !(item as RadarrMovie).hasFile
    return item.monitored && ((item as SonarrSeries).statistics?.episodeFileCount ?? 0) < ((item as SonarrSeries).statistics?.episodeCount ?? 0)
  }

  const filtered = items
    .filter((item: RadarrMovie | SonarrSeries) => {
      const title: string = item.title ?? ''
      if (!title.toLowerCase().includes(search.toLowerCase())) return false
      if (filter === 'missing') return isMissing(item)
      if (filter === 'unmonitored') return !item.monitored
      return true
    })
    .sort((a: RadarrMovie | SonarrSeries, b: RadarrMovie | SonarrSeries) => {
      if (sortKey === 'za') return (b.title ?? '').localeCompare(a.title ?? '')
      if (sortKey === 'year') return ((b as RadarrMovie).year ?? 0) - ((a as RadarrMovie).year ?? 0)
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
        {filtered.map((item: RadarrMovie | SonarrSeries) => {
          const posterUrl = item.images?.find((i: { coverType: string; remoteUrl: string }) => i.coverType === 'poster')?.remoteUrl
          const title: string = item.title ?? 'Unknown'
          const missing = isMissing(item)

          // Radarr: hasFile boolean. Sonarr: episodeFileCount / episodeCount (aired, no specials/unaired)
          const radarrItem = item as RadarrMovie
          const sonarrItem = item as SonarrSeries
          const fileLabel = isRadarr
            ? (radarrItem.hasFile ? 'Downloaded' : 'Missing')
            : (() => {
                const got = sonarrItem.statistics?.episodeFileCount ?? 0
                const total = sonarrItem.statistics?.episodeCount ?? 0
                return total > 0 ? `${got} / ${total} ep` : '—'
              })()
          const fileColor = isRadarr
            ? (radarrItem.hasFile ? '#22c55e' : (item.monitored ? '#ef4444' : 'var(--text-muted)'))
            : (() => {
                const got = sonarrItem.statistics?.episodeFileCount ?? 0
                const total = sonarrItem.statistics?.episodeCount ?? 0
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
  const { instances, seerrRequests, seerrTvStatus, seerrMovieStatus, discoverRequest, loadSeerrRequests, loadSeerrTvStatus, loadSeerrMovieStatus } = useArrStore()
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

  // Background-load Seerr status for all visible items (enables accurate card indicators)
  useEffect(() => {
    if (!seerrInstance) return
    // discoverMovies/discoverTv have no media_type on items — handle by source
    ;(discoverMovies?.results ?? []).forEach(item => {
      if (seerrMovieStatus[item.id] === undefined) loadSeerrMovieStatus(seerrInstance.id, item.id)
    });
    (discoverTv?.results ?? []).forEach(item => {
      if (seerrTvStatus[item.id] === undefined) loadSeerrTvStatus(seerrInstance.id, item.id)
    });
    // trending and search include media_type
    [...(trending?.results ?? []), ...(searchResults?.results ?? [])].forEach(item => {
      if (item.media_type === 'movie' && seerrMovieStatus[item.id] === undefined) {
        loadSeerrMovieStatus(seerrInstance.id, item.id)
      } else if (item.media_type === 'tv' && seerrTvStatus[item.id] === undefined) {
        loadSeerrTvStatus(seerrInstance.id, item.id)
      }
    })
  }, [discoverMovies, discoverTv, trending, searchResults, seerrInstance?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Pre-select seasons when TV detail loads
  useEffect(() => {
    if (!confirmRequest || confirmRequest.mediaType !== 'tv') return
    const detail = tvDetail[confirmRequest.mediaId]
    if (!detail) return
    const realSeasons = detail.seasons.filter(s => s.season_number > 0)
    // Seasons already in Sonarr (available) or pending/processing via Seerr TV status
    const seerrSeasons = seerrTvStatus[confirmRequest.mediaId]?.seasons ?? []
    const availableNums = seerrSeasons.filter(s => s.status === 5).map(s => s.seasonNumber)
    const pendingFromSeerr = seerrSeasons.filter(s => s.status === 2 || s.status === 3).map(s => s.seasonNumber)
    // Fallback: seasons from explicit Seerr requests (for pending seasons not yet reflected in seerrTvStatus)
    const pendingFromRequests = seerrInstance
      ? (seerrRequests[seerrInstance.id]?.results ?? [])
          .filter(r => r.media.mediaType === 'tv' && r.media.tmdbId === confirmRequest.mediaId)
          .flatMap(r => r.seasons?.map(s => s.seasonNumber) ?? [])
      : []
    const excludeNums = [...new Set([...availableNums, ...pendingFromSeerr, ...pendingFromRequests])]
    setSelectedSeasons(realSeasons.filter(s => !excludeNums.includes(s.season_number)).map(s => s.season_number))
  }, [confirmRequest?.mediaId, tvDetail, seerrTvStatus]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // Infer effective media type — discover/movie and discover/tv endpoints don't include media_type
  const getEffectiveMediaType = (item: TmdbResult): 'movie' | 'tv' | null => {
    if (item.media_type === 'movie' || item.media_type === 'tv') return item.media_type
    if (tab === 'movies') return 'movie'
    if (tab === 'tv') return 'tv'
    return null
  }

  // Determine per-item request status
  const getItemStatus = (item: TmdbResult): 'available' | 'pending' | 'missing_seasons' | 'missing_seasons_all_requested' | null => {
    if (!seerrInstance) return null
    const mt = getEffectiveMediaType(item)
    if (!mt) return null

    // Use Seerr media status when loaded — accurate for both direct-library and requested items
    if (mt === 'movie' && seerrMovieStatus[item.id] !== undefined) {
      const s = seerrMovieStatus[item.id].status
      if (s === 5) return 'available'
      if (s === 2 || s === 3) return 'pending'
      return null  // status 1 = not in Radarr
    }
    if (mt === 'tv' && seerrTvStatus[item.id] !== undefined) {
      const tvStatus = seerrTvStatus[item.id]
      const s = tvStatus.status
      if (s === 5) return 'available'
      if (s === 2 || s === 3) return 'pending'
      if (s === 4) {
        const seasonList = tvStatus.seasons ?? []
        const nonAvailable = seasonList.filter(se => se.status !== 5)
        if (nonAvailable.length > 0 && nonAvailable.every(se => se.status === 2 || se.status === 3)) {
          return 'missing_seasons_all_requested'
        }
        return 'missing_seasons'
      }
      return null  // status 1 = not in Sonarr
    }

    // Fallback while Seerr status not yet loaded: check seerrRequests
    const requests = seerrRequests[seerrInstance.id]?.results ?? []
    const req = requests.find(r => r.media.mediaType === mt && r.media.tmdbId === item.id)
    if (!req) return null
    if (req.media.status === 5) return 'available'
    if (req.media.status === 4) return 'missing_seasons'
    if (req.media.status === 2 || req.media.status === 3) return 'pending'
    return null
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

  const openRequestModal = async (item: TmdbResult, mediaType: 'movie' | 'tv') => {
    setConfirmRequest({ item, mediaType, mediaId: item.id })
    setSelectedSeasons([])
    if (mediaType === 'tv') {
      const needsTmdb = !tvDetail[item.id]
      const needsSeerr = !!seerrInstance && seerrTvStatus[item.id] === undefined
      if (needsTmdb || needsSeerr) {
        setTvDetailLoading(true)
        await Promise.all([
          needsTmdb ? loadTvDetail(item.id) : Promise.resolve(),
          needsSeerr ? loadSeerrTvStatus(seerrInstance!.id, item.id) : Promise.resolve(),
        ])
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
          const mt = getEffectiveMediaType(item)
          const posterUrl = item.poster_path ? `https://image.tmdb.org/t/p/w300${item.poster_path}` : null
          const title = item.title ?? item.name ?? 'Unknown'
          const year = item.release_date?.slice(0, 4) ?? item.first_air_date?.slice(0, 4) ?? ''
          const rating = item.vote_average ? Math.round(item.vote_average * 10) / 10 : null
          const overview = item.overview ? item.overview.slice(0, 100) + (item.overview.length > 100 ? '...' : '') : ''
          const itemStatus = getItemStatus(item)
          const canRequest = !!seerrInstance && !!mt && (itemStatus === null || itemStatus === 'missing_seasons')
          const isYellowStatus = itemStatus === 'pending' || itemStatus === 'missing_seasons' || itemStatus === 'missing_seasons_all_requested'
          const itemKey = `${mt ?? item.media_type ?? 'unknown'}-${item.id}`

          const btnLabel = requesting === itemKey
            ? 'Requesting…'
            : itemStatus === 'available' ? '✓ Available'
            : itemStatus === 'pending' || itemStatus === 'missing_seasons_all_requested' ? '⏳ Pending'
            : '+ Request'

          return (
            <div
              key={itemKey}
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
                {!posterUrl && <span style={{ fontSize: 32 }}>{mt === 'movie' ? '🎬' : '📺'}</span>}

                {/* Media type badge */}
                <div style={{
                  position: 'absolute', top: 8, left: 8,
                  background: 'rgba(0,0,0,0.7)', color: 'var(--accent)',
                  padding: '3px 7px', borderRadius: 'var(--radius-sm)',
                  fontSize: 10, fontWeight: 600, textTransform: 'uppercase', backdropFilter: 'blur(8px)',
                }}>
                  {mt === 'movie' ? 'Movie' : 'TV'}
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
                    {itemStatus === 'available' ? '✓ Available'
                      : itemStatus === 'missing_seasons' ? '⚠ Partial'
                      : '⏳ Pending'}
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

                {seerrInstance && !!mt && (
                  <button
                    onClick={e => {
                      e.stopPropagation()
                      if (!canRequest) return
                      openRequestModal(item, mt)
                    }}
                    disabled={!canRequest || requesting === itemKey}
                    className={itemStatus === 'available' ? 'btn btn-ghost btn-sm' : 'btn btn-primary btn-sm'}
                    style={{
                      fontSize: 12, padding: '6px 12px', marginTop: 'auto',
                      pointerEvents: canRequest ? undefined : 'none',
                      ...(isYellowStatus ? {
                        color: '#f59e0b',
                        borderColor: canRequest ? '#f59e0b' : 'rgba(245,158,11,0.4)',
                        opacity: canRequest ? 1 : 0.7,
                      } : !canRequest ? { opacity: 0.6 } : {}),
                    }}
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
              // Seasons available in Sonarr or pending/processing (from Seerr TV status)
              const seerrSeasonData = seerrTvStatus[confirmRequest.mediaId]?.seasons ?? []
              const availableSeasonNums = seerrSeasonData.filter(s => s.status === 5).map(s => s.seasonNumber)
              const pendingSeasonNums = seerrSeasonData.filter(s => s.status === 2 || s.status === 3).map(s => s.seasonNumber)
              // Fallback: seasons from explicit Seerr requests
              const requestedSeasonNums = seerrInstance
                ? (seerrRequests[seerrInstance.id]?.results ?? [])
                    .filter(r => r.media.mediaType === 'tv' && r.media.tmdbId === confirmRequest.mediaId)
                    .flatMap(r => r.seasons?.map(s => s.seasonNumber) ?? [])
                : []
              const unavailableNums = [...new Set([...availableSeasonNums, ...pendingSeasonNums, ...requestedSeasonNums])]
              const missingSeasons = realSeasons.filter(s => !unavailableNums.includes(s.season_number))
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
                      const isAvailable = availableSeasonNums.includes(s.season_number)
                      const isPending = !isAvailable && (pendingSeasonNums.includes(s.season_number) || requestedSeasonNums.includes(s.season_number))
                      const isUnavailable = isAvailable || isPending
                      const isSelected = selectedSeasons.includes(s.season_number)

                      return (
                        <button
                          key={s.season_number}
                          disabled={isUnavailable}
                          onClick={() => {
                            if (isUnavailable) return
                            setSelectedSeasons(prev =>
                              prev.includes(s.season_number)
                                ? prev.filter(n => n !== s.season_number)
                                : [...prev, s.season_number]
                            )
                          }}
                          style={{
                            padding: '6px 10px', borderRadius: 'var(--radius-md)', fontSize: 12,
                            background: isUnavailable
                              ? 'rgba(var(--text-rgb), 0.05)'
                              : isSelected
                              ? 'rgba(var(--accent-rgb), 0.25)'
                              : 'rgba(var(--text-rgb), 0.1)',
                            color: isUnavailable
                              ? 'var(--text-muted)'
                              : isSelected
                              ? 'var(--accent)'
                              : 'var(--text-secondary)',
                            border: isSelected && !isUnavailable ? '1px solid var(--accent)' : '1px solid transparent',
                            cursor: isUnavailable ? 'default' : 'pointer',
                            opacity: isUnavailable ? 0.5 : 1,
                            transition: 'all 150ms ease', fontFamily: 'var(--font-sans)',
                          }}
                        >
                          S{s.season_number}
                          {isAvailable && <span style={{ fontSize: 10, marginLeft: 4, opacity: 0.75 }}>· In Sonarr</span>}
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
                  } catch (e: unknown) {
                    setNotification({ type: 'error', message: `Error: ${(e as Error).message ?? 'Request failed'}` })
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

// ── Recyclarr Setup Wizard ────────────────────────────────────────────────────

function RecyclarrWizard({
  onClose,
  instances,
}: {
  onClose: () => void
  instances: import('../types/arr').ArrInstance[]
}) {
  const { qualityProfiles, loadQualityProfiles } = useArrStore()
  const { profiles, configs, loadProfiles, saveConfig } = useRecyclarrStore()

  const [step, setStep] = useState(1)
  const TOTAL_STEPS = 5
  const [confirmClose, setConfirmClose] = useState(false)

  // Step 1
  const [selectedInstanceId, setSelectedInstanceId] = useState('')

  // Step 2
  const [selectedProfileTrashIds, setSelectedProfileTrashIds] = useState<string[]>([])

  // Step 3
  const [minScores, setMinScores] = useState<Record<string, string>>({})
  const [preferredRatio, setPreferredRatio] = useState(0)
  const [deleteOldCfs, setDeleteOldCfs] = useState(false)

  // Step 2 — profile loading state
  const [profilesLoading, setProfilesLoading] = useState(false)
  const [profilesLoadError, setProfilesLoadError] = useState<string | null>(null)

  // Step 4 — user CFs from filesystem
  const [selectedUserCfs, setSelectedUserCfs] = useState<Array<{ trash_id: string; name: string; score: number }>>([])
  const [userCfList, setUserCfList] = useState<import('../types/recyclarr').UserCfFile[]>([])
  const [userCfsLoading, setUserCfsLoading] = useState(false)
  const [userCfsLoadError, setUserCfsLoadError] = useState<string | null>(null)

  // Step 5 — schedule
  const [scheduleType, setScheduleType] = useState<'manual' | 'daily' | 'weekly' | 'cron'>('manual')
  const [scheduleTime, setScheduleTime] = useState('04:00')
  const [scheduleDay, setScheduleDay] = useState('1')
  const [scheduleCron, setScheduleCron] = useState('')

  // Step 5 — YAML preview
  const [yamlPreview, setYamlPreview] = useState<string | null>(null)
  const [yamlPreviewLoading, setYamlPreviewLoading] = useState(false)
  const [yamlPreviewError, setYamlPreviewError] = useState<string | null>(null)

  // Saving
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const selectedInstance = instances.find(i => i.id === selectedInstanceId)
  const instType = selectedInstance?.type as 'radarr' | 'sonarr' | undefined

  const instProfiles = instType ? (profiles[instType] ?? []) : []

  const profileGroups = instProfiles.reduce<Record<string, typeof instProfiles>>((acc, p) => {
    const g = p.group ?? 'Standard'
    if (!acc[g]) acc[g] = []
    acc[g].push(p)
    return acc
  }, {})
  const sortedProfileGroupKeys = ['Standard', 'Anime', 'Deutsch (German)', 'French', 'Dutch']
    .filter(g => profileGroups[g]?.length)

  const selectedProfileObjs = instProfiles.filter(p => selectedProfileTrashIds.includes(p.trash_id))

  const doLoadProfiles = async (type: 'radarr' | 'sonarr') => {
    setProfilesLoading(true)
    setProfilesLoadError(null)
    try {
      await loadProfiles(type)
    } catch (e: unknown) {
      setProfilesLoadError(e instanceof Error ? e.message : 'Failed to load profiles from container')
    } finally {
      setProfilesLoading(false)
    }
  }

  // Auto-load profiles when instance selected
  useEffect(() => {
    if (!instType) return
    if (instProfiles.length === 0) doLoadProfiles(instType)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instType])

  // Load arr quality profiles when entering step 2 (for adoption warning)
  useEffect(() => {
    if (step !== 2 || !selectedInstanceId) return
    if (!qualityProfiles[selectedInstanceId] || qualityProfiles[selectedInstanceId].length === 0) {
      loadQualityProfiles(selectedInstanceId).catch(() => {})
    }
  }, [step, selectedInstanceId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load user CFs from filesystem when entering step 4
  useEffect(() => {
    if (step !== 4 || !instType) return
    setUserCfsLoading(true)
    setUserCfsLoadError(null)
    import('../api').then(({ api }) => api.recyclarr.listUserCfs(instType!))
      .then(res => setUserCfList(res.cfs))
      .catch((e: Error) => setUserCfsLoadError(e.message ?? 'Failed to load user CFs'))
      .finally(() => setUserCfsLoading(false))
  }, [step]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load YAML preview when entering step 5
  useEffect(() => {
    if (step !== 5 || !selectedInstanceId) return
    setYamlPreviewLoading(true)
    setYamlPreviewError(null)
    setYamlPreview(null)
    const profilesConfigData = selectedProfileObjs.map(p => ({
      trash_id: p.trash_id,
      name: p.name,
      min_format_score: minScores[p.trash_id] ? parseInt(minScores[p.trash_id], 10) : undefined,
      reset_unmatched_scores_enabled: true,
      reset_unmatched_scores_except: selectedUserCfs.map(ucf => ucf.trash_id),
    }))
    const userCfNames = selectedUserCfs.map(ucf => ({
      trash_id: ucf.trash_id,
      name: ucf.name,
      score: ucf.score,
      profileTrashId: '',
      profileName: '',
    }))
    import('../api').then(({ api }) =>
      api.recyclarr.previewYamlForInstance(selectedInstanceId, {
        enabled: true,
        selectedProfiles: selectedProfileTrashIds,
        scoreOverrides: [],
        userCfNames,
        preferredRatio,
        profilesConfig: profilesConfigData,
        syncSchedule: buildScheduleStr(),
        deleteOldCfs,
      })
    ).then(res => {
      setYamlPreview(res.yaml)
    }).catch((e: Error) => {
      setYamlPreviewError(e.message ?? 'Preview failed')
    }).finally(() => {
      setYamlPreviewLoading(false)
    })
  }, [step]) // eslint-disable-line react-hooks/exhaustive-deps

  const buildScheduleStr = (): string => {
    if (scheduleType === 'manual') return 'manual'
    if (scheduleType === 'cron') return scheduleCron.trim() || 'manual'
    const colonIdx = scheduleTime.indexOf(':')
    const h = colonIdx >= 0 ? parseInt(scheduleTime.slice(0, colonIdx), 10) || 0 : 4
    const m = colonIdx >= 0 ? parseInt(scheduleTime.slice(colonIdx + 1), 10) || 0 : 0
    if (scheduleType === 'daily') return `${m} ${h} * * *`
    return `${m} ${h} * * ${scheduleDay}`
  }

  const handleFinish = async () => {
    if (!selectedInstanceId) return
    setSaving(true)
    setSaveError(null)
    const existing = configs.find(c => c.instanceId === selectedInstanceId)
    const userCfTrashIds = selectedUserCfs.map(ucf => ucf.trash_id)
    const newProfilesConfig: import('../types/recyclarr').RecyclarrProfileConfig[] = selectedProfileObjs.map(p => ({
      trash_id: p.trash_id,
      name: p.name,
      min_format_score: minScores[p.trash_id] ? parseInt(minScores[p.trash_id], 10) : undefined,
      reset_unmatched_scores_enabled: true,
      reset_unmatched_scores_except: userCfTrashIds,
    }))
    const newUserCfNames = selectedUserCfs.map(ucf => ({
      trash_id: ucf.trash_id,
      name: ucf.name,
      score: ucf.score,
      profileTrashId: '',
      profileName: '',
    }))
    // Merge with existing config (append new, keep existing — no overwrites)
    const mergedSelectedProfiles = existing
      ? [...new Set([...existing.selectedProfiles, ...selectedProfileTrashIds])]
      : selectedProfileTrashIds
    const mergedProfilesConfig = existing
      ? [...existing.profilesConfig, ...newProfilesConfig.filter(np => !existing.profilesConfig.some(ep => ep.trash_id === np.trash_id))]
      : newProfilesConfig
    const mergedUserCfNames = existing
      ? [...existing.userCfNames, ...newUserCfNames.filter(nu => !existing.userCfNames.some(eu => eu.trash_id === nu.trash_id))]
      : newUserCfNames
    const mergedScoreOverrides = existing ? existing.scoreOverrides : []
    const mergedSchedule = (existing?.syncSchedule && existing.syncSchedule !== 'manual')
      ? existing.syncSchedule
      : buildScheduleStr()
    try {
      await saveConfig(selectedInstanceId, {
        enabled: true,
        selectedProfiles: mergedSelectedProfiles,
        scoreOverrides: mergedScoreOverrides,
        userCfNames: mergedUserCfNames,
        preferredRatio,
        profilesConfig: mergedProfilesConfig,
        syncSchedule: mergedSchedule,
        deleteOldCfs,
      })
      onClose()
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const canAdvance = (): boolean => {
    if (step === 1) return !!selectedInstanceId
    if (step === 2) return selectedProfileTrashIds.length > 0
    return true
  }

  const handleClose = () => {
    if (step > 1) { setConfirmClose(true); return }
    onClose()
  }

  const sStyle = {
    background: 'rgba(var(--text-rgb), 0.06)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    padding: '4px 8px',
    fontSize: 12,
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-sans)',
  }

  const renderStep = () => {
    switch (step) {
      case 1: return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
            Select the Radarr or Sonarr instance to configure Recyclarr for.
          </p>
          {instances.map(inst => (
            <label key={inst.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 'var(--radius-md)', cursor: 'pointer', background: selectedInstanceId === inst.id ? 'rgba(var(--accent-rgb), 0.1)' : 'rgba(var(--text-rgb), 0.04)', border: selectedInstanceId === inst.id ? '1px solid rgba(var(--accent-rgb), 0.3)' : '1px solid transparent', transition: 'all 150ms ease' }}>
              <input type="radio" name="wizard-instance" value={inst.id} checked={selectedInstanceId === inst.id} onChange={() => setSelectedInstanceId(inst.id)} />
              <span style={{ fontWeight: 500, fontSize: 13 }}>{inst.name}</span>
              <span className="badge-neutral" style={{ fontSize: 11, textTransform: 'uppercase' }}>{inst.type}</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{inst.url}</span>
            </label>
          ))}
          {selectedInstanceId && (() => {
            const existingCfg = configs.find(c => c.instanceId === selectedInstanceId)
            return (
              <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'rgba(var(--accent-rgb), 0.06)', border: '1px solid rgba(var(--accent-rgb), 0.2)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span className="badge-success" style={{ fontSize: 11 }}>Verbindung bereits konfiguriert — API Key wird automatisch übernommen</span>
                {existingCfg && (
                  <span className="badge-neutral" style={{ fontSize: 11 }}>
                    {existingCfg.selectedProfiles.length} Profile konfiguriert — Wizard ergänzt bestehende Konfiguration
                  </span>
                )}
              </div>
            )
          })()}
        </div>
      )

      case 2: return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
            Select quality profiles for Recyclarr to manage. At least one is required.
          </p>
          {profilesLoading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div className="spinner" style={{ width: 13, height: 13, borderWidth: 2 }} />
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading profiles from container…</span>
            </div>
          )}
          {!profilesLoading && profilesLoadError && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)' }}>
              <span style={{ fontSize: 13, color: '#f87171' }}>Could not load profiles from container. Is Recyclarr running?</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{profilesLoadError}</span>
              <button className="btn-primary" style={{ alignSelf: 'flex-start', fontSize: 12, padding: '4px 12px' }}
                onClick={() => instType && doLoadProfiles(instType)}>Retry</button>
            </div>
          )}
          {!profilesLoading && !profilesLoadError && instProfiles.length === 0 && (
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>No profiles found for this instance type.</span>
          )}
          {sortedProfileGroupKeys.map(group => (
            <div key={group}>
              {sortedProfileGroupKeys.length > 1 && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, fontStyle: 'italic' }}>{group}</div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(profileGroups[group] ?? []).map(p => (
                  <div key={p.trash_id} style={{ display: 'flex', flexDirection: 'column' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 'var(--radius-md)', cursor: 'pointer', background: selectedProfileTrashIds.includes(p.trash_id) ? 'rgba(var(--accent-rgb), 0.1)' : 'rgba(var(--text-rgb), 0.04)', border: selectedProfileTrashIds.includes(p.trash_id) ? '1px solid rgba(var(--accent-rgb), 0.3)' : '1px solid transparent', transition: 'all 150ms ease' }}>
                      <input type="checkbox" checked={selectedProfileTrashIds.includes(p.trash_id)} onChange={e => {
                        setSelectedProfileTrashIds(prev =>
                          e.target.checked ? [...prev, p.trash_id] : prev.filter(id => id !== p.trash_id)
                        )
                      }} />
                      <span style={{ fontSize: 13 }}>{p.name}</span>
                      {p.source === 'cache' && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>cached</span>}
                    </label>
                    {(() => {
                      const arrProfiles = qualityProfiles[selectedInstanceId] ?? []
                      const matchingArrProfile = arrProfiles.find(ap => ap.name === p.name)
                      if (!matchingArrProfile || !selectedProfileTrashIds.includes(p.trash_id)) return null
                      return (
                        <div style={{ marginLeft: 22, marginTop: 2, fontSize: 11, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <AlertTriangle size={11} />
                          Profil existiert bereits in {selectedInstance?.name ?? 'der Instanz'} — direkt nach dem Speichern syncen, um Duplikat zu vermeiden.
                        </div>
                      )
                    })()}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )

      case 3: return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Configure settings for each selected profile.</p>

          {/* Preferred ratio — global */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>
              Preferred Ratio: {preferredRatio.toFixed(1)}
            </label>
            <input type="range" min={0} max={1} step={0.1} value={preferredRatio}
              onChange={e => setPreferredRatio(parseFloat(e.target.value))}
              style={{ accentColor: 'var(--accent)', cursor: 'pointer' }} />
            <span className="badge-neutral" style={{ fontSize: 10, alignSelf: 'flex-start' }}>0.0 = quality, 1.0 = file size</span>
          </div>

          {/* Delete old CFs */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={deleteOldCfs} onChange={e => setDeleteOldCfs(e.target.checked)} />
            Delete unused custom formats
            {deleteOldCfs && <span className="badge-error" style={{ fontSize: 10 }}>Removes Recyclarr CFs when removed from config</span>}
          </label>

          {/* Per-profile min format score */}
          {selectedProfileObjs.map(p => {
            const tid = p.trash_id
            return (
              <div key={tid} style={{ padding: '12px 14px', background: 'rgba(var(--text-rgb), 0.04)', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Min Format Score</label>
                  <input type="number" value={minScores[tid] ?? ''} placeholder="No minimum"
                    onChange={e => setMinScores(prev => ({ ...prev, [tid]: e.target.value }))}
                    style={{ ...sStyle, width: 150 }} />
                  <span className="badge-neutral" style={{ fontSize: 10, alignSelf: 'flex-start' }}>10000 = skip English releases (German profiles)</span>
                </div>
              </div>
            )
          })}
        </div>
      )

      case 4: return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
            Select your user CFs and assign scores. These will be synced by Recyclarr to all selected profiles.
          </p>
          {userCfsLoading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div className="spinner" style={{ width: 13, height: 13, borderWidth: 2 }} />
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading user CFs…</span>
            </div>
          )}
          {!userCfsLoading && userCfsLoadError && (
            <div style={{ fontSize: 12, color: '#f87171', padding: '8px 12px', background: 'rgba(248,113,113,0.08)', borderRadius: 'var(--radius-sm)' }}>
              {userCfsLoadError}
            </div>
          )}
          {!userCfsLoading && !userCfsLoadError && userCfList.length === 0 && (
            <div style={{ padding: '14px 16px', borderRadius: 'var(--radius-md)', background: 'rgba(var(--text-rgb), 0.04)', border: '1px solid var(--border)' }}>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 4px' }}>
                No user CFs found. Create them in the CF Manager tab first.
              </p>
            </div>
          )}
          {!userCfsLoading && userCfList.length > 0 && (
            <div style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {[...userCfList].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())).map(cf => {
                const selected = selectedUserCfs.find(u => u.trash_id === cf.trash_id)
                const checked = !!selected
                return (
                  <div key={cf.trash_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: checked ? 'rgba(var(--accent-rgb), 0.06)' : 'rgba(var(--text-rgb), 0.03)', borderRadius: 'var(--radius-sm)', border: checked ? '1px solid rgba(var(--accent-rgb), 0.2)' : '1px solid transparent' }}>
                    <input type="checkbox" checked={checked} onChange={e => {
                      if (e.target.checked) {
                        setSelectedUserCfs(prev => [...prev, { trash_id: cf.trash_id, name: cf.name, score: 0 }])
                      } else {
                        setSelectedUserCfs(prev => prev.filter(u => u.trash_id !== cf.trash_id))
                      }
                    }} />
                    <span style={{ flex: 1, fontSize: 13 }}>{cf.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{cf.trash_id}</span>
                    {checked && (
                      <input
                        type="number"
                        value={selected!.score}
                        onChange={e => setSelectedUserCfs(prev => prev.map(u => u.trash_id === cf.trash_id ? { ...u, score: parseInt(e.target.value, 10) || 0 } : u))}
                        style={{ width: 70, textAlign: 'right', background: 'rgba(var(--text-rgb), 0.06)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '2px 6px', fontSize: 12, color: 'var(--text-primary)' }}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => setStep(s => s + 1)} style={{ alignSelf: 'flex-start', fontSize: 12, color: 'var(--text-muted)' }}>
            Skip →
          </button>
        </div>
      )

      case 5: return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Wähle, wie Recyclarr automatisch synchronisiert werden soll.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
              <input type="radio" name="wiz-sched" checked={scheduleType === 'manual'} onChange={() => setScheduleType('manual')} />
              Manuell (Standard)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', flexWrap: 'wrap' }}>
              <input type="radio" name="wiz-sched" checked={scheduleType === 'daily'} onChange={() => setScheduleType('daily')} />
              Täglich um
              <input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} disabled={scheduleType !== 'daily'}
                style={{ ...sStyle, width: 100, opacity: scheduleType !== 'daily' ? 0.4 : 1 }} />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', flexWrap: 'wrap' }}>
              <input type="radio" name="wiz-sched" checked={scheduleType === 'weekly'} onChange={() => setScheduleType('weekly')} />
              Wöchentlich
              <select value={scheduleDay} onChange={e => setScheduleDay(e.target.value)} disabled={scheduleType !== 'weekly'}
                style={{ ...sStyle, opacity: scheduleType !== 'weekly' ? 0.4 : 1 }}>
                <option value="1">Montag</option>
                <option value="2">Dienstag</option>
                <option value="3">Mittwoch</option>
                <option value="4">Donnerstag</option>
                <option value="5">Freitag</option>
                <option value="6">Samstag</option>
                <option value="0">Sonntag</option>
              </select>
              um
              <input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} disabled={scheduleType !== 'weekly'}
                style={{ ...sStyle, width: 100, opacity: scheduleType !== 'weekly' ? 0.4 : 1 }} />
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                <input type="radio" name="wiz-sched" checked={scheduleType === 'cron'} onChange={() => setScheduleType('cron')} />
                Benutzerdefiniert
              </label>
              <input value={scheduleCron} onChange={e => setScheduleCron(e.target.value)} disabled={scheduleType !== 'cron'}
                placeholder="0 4 * * *" style={{ ...sStyle, width: 130, fontFamily: 'var(--font-mono)', opacity: scheduleType !== 'cron' ? 0.4 : 1 }} />
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 14px', background: 'rgba(var(--text-rgb), 0.04)', borderRadius: 'var(--radius-md)' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 130 }}>Instanz</span>
              <span style={{ fontSize: 12, fontWeight: 500 }}>{selectedInstance?.name ?? '—'}</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 130 }}>Profile</span>
              <span style={{ fontSize: 12 }}>{selectedProfileObjs.map(p => p.name).join(', ') || '—'}</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 130 }}>User CFs</span>
              <span style={{ fontSize: 12 }}>{selectedUserCfs.length}</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 130 }}>Preferred Ratio</span>
              <span style={{ fontSize: 12 }}>{preferredRatio.toFixed(1)}</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 130 }}>Zeitplan</span>
              <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)' }}>{buildScheduleStr()}</span>
            </div>
          </div>
          <details style={{ marginTop: 4 }}>
            <summary style={{ fontSize: 12, cursor: 'pointer', color: 'var(--text-secondary)', userSelect: 'none', padding: '4px 0' }}>
              Generiertes YAML anzeigen
            </summary>
            <div style={{ marginTop: 8 }}>
              {yamlPreviewLoading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8 }}>
                  <div className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Lade YAML-Vorschau…</span>
                </div>
              )}
              {yamlPreviewError && (
                <div style={{ fontSize: 12, color: '#f87171', padding: '6px 8px', background: 'rgba(248,113,113,0.08)', borderRadius: 'var(--radius-sm)' }}>
                  Preview nicht verfügbar: {yamlPreviewError}
                </div>
              )}
              {yamlPreview && (
                <pre style={{ fontSize: 11, fontFamily: 'var(--font-mono)', background: 'rgba(var(--text-rgb), 0.04)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 12, overflowX: 'auto', maxHeight: 300, overflowY: 'auto', margin: 0 }}>
                  {yamlPreview}
                </pre>
              )}
            </div>
          </details>
          {saveError && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--radius-md)' }}>
              <AlertTriangle size={13} style={{ color: '#f87171' }} />
              <span style={{ fontSize: 12, color: '#f87171' }}>{saveError}</span>
            </div>
          )}
        </div>
      )

      default: return null
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 300, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '32px 16px' }}>
      <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 28, width: '100%', maxWidth: 800 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <h3 style={{ fontSize: 17, fontWeight: 600, margin: 0, flex: 1 }}>Recyclarr Setup-Assistent</h3>
          <button onClick={handleClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
            <X size={16} />
          </button>
        </div>

        {/* Progress bar */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
            {Array.from({ length: TOTAL_STEPS }, (_, i) => (
              <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i < step ? 'var(--accent)' : 'rgba(var(--text-rgb), 0.15)', transition: 'background 200ms ease' }} />
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {['Instanz', 'Profile', 'Einstellungen', 'User CFs', 'Zeitplan'][step - 1]}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Schritt {step} / {TOTAL_STEPS}</span>
          </div>
        </div>

        {/* Step content */}
        <div style={{ minHeight: 200, marginBottom: 24 }}>
          {renderStep()}
        </div>

        {/* Navigation */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          <button
            onClick={() => step > 1 ? setStep(s => s - 1) : handleClose()}
            className="btn btn-ghost btn-sm"
            style={{ fontSize: 13 }}
          >
            {step === 1 ? 'Abbrechen' : '← Zurück'}
          </button>
          {step < TOTAL_STEPS ? (
            <button
              onClick={() => { if (canAdvance()) setStep(s => s + 1) }}
              disabled={!canAdvance()}
              className="btn btn-primary btn-sm"
              style={{ fontSize: 13 }}
            >
              Weiter →
            </button>
          ) : (
            <button
              onClick={handleFinish}
              disabled={saving}
              className="btn btn-primary btn-sm"
              style={{ fontSize: 13, gap: 6 }}
            >
              {saving ? <div className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> : <Check size={13} />}
              {saving ? 'Speichern…' : 'Konfiguration erstellen'}
            </button>
          )}
        </div>
      </div>

      {/* Confirm close dialog */}
      {confirmClose && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 24, maxWidth: 360, width: '90%' }}>
            <p style={{ fontSize: 14, marginBottom: 16 }}>Wizard wirklich schließen? Alle Eingaben gehen verloren.</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmClose(false)} className="btn btn-ghost btn-sm" style={{ fontSize: 13 }}>Weitermachen</button>
              <button onClick={onClose} className="btn btn-danger btn-sm" style={{ fontSize: 13 }}>Schließen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Recyclarr tab ─────────────────────────────────────────────────────────────

type ScheduleMode = 'manual' | 'daily' | 'weekly' | 'custom'

function parseCronExpression(expr: string): { mode: ScheduleMode; time: string; weekday: string; custom: string } {
  if (!expr || expr === 'manual') return { mode: 'manual', time: '04:00', weekday: '1', custom: '' }
  const parts = expr.trim().split(/\s+/)
  if (parts.length === 5) {
    const [m, h, dom, mon, dow] = parts
    if (dom === '*' && mon === '*' && m !== undefined && h !== undefined) {
      const time = `${h.padStart(2, '0')}:${m.padStart(2, '0')}`
      if (dow === '*') return { mode: 'daily', time, weekday: '1', custom: '' }
      if (/^[0-6]$/.test(dow ?? '')) return { mode: 'weekly', time, weekday: dow ?? '1', custom: '' }
    }
  }
  return { mode: 'custom', time: '04:00', weekday: '1', custom: expr }
}

function buildCronExpression(mode: ScheduleMode, time: string, weekday: string, custom: string): string {
  if (mode === 'manual') return 'manual'
  if (mode === 'custom') return custom.trim()
  const colonIdx = time.indexOf(':')
  const h = colonIdx >= 0 ? time.slice(0, colonIdx) : '4'
  const m = colonIdx >= 0 ? time.slice(colonIdx + 1) : '0'
  const hNum = parseInt(h, 10) || 0
  const mNum = parseInt(m, 10) || 0
  if (mode === 'daily') return `${mNum} ${hNum} * * *`
  return `${mNum} ${hNum} * * ${weekday}`
}

function formatRelativeTime(isoStr: string | null): string {
  if (!isoStr) return ''
  const ms = Date.now() - new Date(isoStr).getTime()
  const mins = Math.floor(ms / 60_000)
  if (mins < 1) return 'gerade eben'
  if (mins < 60) return `vor ${mins}min`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `vor ${hrs}h`
  return `vor ${Math.floor(hrs / 24)}d`
}

function RecyclarrTab() {
  const { isAdmin } = useStore()
  const { instances } = useArrStore()
  const {
    profiles, cfs, profilesWarning, cfsWarning,
    configs, syncLines, syncDone, syncing, loading,
    loadProfiles, loadCfs, loadConfigs, saveConfig, sync, adoptCfs, clearCache, resetConfig,
  } = useRecyclarrStore()
  const syncExitCode = syncDone ? (syncLines.some(l => l.type === 'error') ? 1 : 0) : null

  const radarrSonarrInstances = instances.filter(i => (i.type === 'radarr' || i.type === 'sonarr') && i.enabled)

  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(
    radarrSonarrInstances[0]?.id ?? null
  )
  const [resetting, setResetting] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [clearingCache, setClearingCache] = useState(false)
  const [showWizard, setShowWizard] = useState(false)

  // Per-instance local config state
  const [localEnabled, setLocalEnabled] = useState(true)
  const [localSelectedProfiles, setLocalSelectedProfiles] = useState<string[]>([])
  const [localScoreOverrides, setLocalScoreOverrides] = useState<import('../types/recyclarr').RecyclarrScoreOverride[]>([])
  const [localUserCfs, setLocalUserCfs] = useState<import('../types/recyclarr').RecyclarrUserCf[]>([])
  const [localPreferredRatio, setLocalPreferredRatio] = useState(0.0)
  const [localProfilesConfig, setLocalProfilesConfig] = useState<import('../types/recyclarr').RecyclarrProfileConfig[]>([])
  const [localDeleteOldCfs, setLocalDeleteOldCfs] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  // UI state for expandable profile settings
  const [expandedProfiles, setExpandedProfiles] = useState<Set<string>>(new Set())
  const [newExceptInputs, setNewExceptInputs] = useState<Record<string, string>>({})

  // Score overrides UI
  const [scoreSearch, setScoreSearch] = useState('')
  const [showOnlyOverridden, setShowOnlyOverridden] = useState(false)

  // Active profile tab for score overrides
  const [activeScoreProfileId, setActiveScoreProfileId] = useState('')

  // Profile Management section state
  const [activePmProfileId, setActivePmProfileId] = useState('')
  const [userCfsFromFs, setUserCfsFromFs] = useState<import('../types/recyclarr').UserCfFile[]>([])
  const [userCfsFromFsLoading, setUserCfsFromFsLoading] = useState(false)
  const [pmScoreSearch, setPmScoreSearch] = useState('')

  // User CFs add form
  const [newCfName, setNewCfName] = useState('')
  const [newCfScore, setNewCfScore] = useState('0')
  const [newCfProfileTrashId, setNewCfProfileTrashId] = useState('')

  // Schedule state
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>('manual')
  const [scheduleTime, setScheduleTime] = useState('04:00')
  const [scheduleWeekday, setScheduleWeekday] = useState('1')
  const [scheduleCustom, setScheduleCustom] = useState('')

  // Adopt state
  const [adopting, setAdopting] = useState(false)
  const [adoptResult, setAdoptResult] = useState<{ ok: boolean; output: string } | null>(null)

  // Sync output scroll ref
  const syncOutputRef = useRef<HTMLPreElement>(null)

  const instanceId = selectedInstanceId
  const selectedInstance = radarrSonarrInstances.find(i => i.id === instanceId)
  const instType = selectedInstance?.type as 'radarr' | 'sonarr' | undefined

  const instProfiles = instType ? (profiles[instType] ?? []) : []
  const instCfs = instType ? (cfs[instType] ?? []) : []

  useEffect(() => {
    loadConfigs().catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-load profiles + CFs when instance type is known; also load user CFs from filesystem
  useEffect(() => {
    if (!instType) return
    if ((profiles[instType] ?? []).length === 0) loadProfiles(instType).catch(() => {})
    if ((cfs[instType] ?? []).length === 0) loadCfs(instType).catch(() => {})
    setUserCfsFromFsLoading(true)
    import('../api').then(({ api }) => api.recyclarr.listUserCfs(instType!))
      .then(res => setUserCfsFromFs(res.cfs))
      .catch(() => {})
      .finally(() => setUserCfsFromFsLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instType])

  // Auto-scroll sync output
  useEffect(() => {
    if (syncOutputRef.current) {
      syncOutputRef.current.scrollTop = syncOutputRef.current.scrollHeight
    }
  }, [syncLines])

  // Sync local state from configs when instanceId or configs change
  useEffect(() => {
    if (!instanceId) return
    const cfg = configs.find(c => c.instanceId === instanceId)
    if (cfg) {
      setLocalEnabled(cfg.enabled)
      setLocalSelectedProfiles(cfg.selectedProfiles ?? [])
      setLocalScoreOverrides(cfg.scoreOverrides)
      setLocalUserCfs(cfg.userCfNames)
      setLocalPreferredRatio(cfg.preferredRatio ?? 0.0)
      setLocalProfilesConfig(cfg.profilesConfig ?? [])
      setLocalDeleteOldCfs(cfg.deleteOldCfs ?? false)
      const { mode, time, weekday, custom } = parseCronExpression(cfg.syncSchedule ?? 'manual')
      setScheduleMode(mode)
      setScheduleTime(time)
      setScheduleWeekday(weekday)
      setScheduleCustom(custom)
    } else {
      setLocalEnabled(true)
      setLocalSelectedProfiles([])
      setLocalScoreOverrides([])
      setLocalUserCfs([])
      setLocalPreferredRatio(0.0)
      setLocalProfilesConfig([])
      setLocalDeleteOldCfs(false)
      setScheduleMode('manual')
      setScheduleTime('04:00')
      setScheduleWeekday('1')
      setScheduleCustom('')
    }
    setExpandedProfiles(new Set())
    setNewExceptInputs({})
    setScoreSearch('')
    setShowOnlyOverridden(false)
    setPmScoreSearch('')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instanceId, configs])

  // Sync active score profile tab and PM profile tab when selected profiles change
  useEffect(() => {
    if (localSelectedProfiles.length > 0 && (!activeScoreProfileId || !localSelectedProfiles.includes(activeScoreProfileId))) {
      setActiveScoreProfileId(localSelectedProfiles[0] ?? '')
    }
    if (localSelectedProfiles.length > 0 && (!activePmProfileId || !localSelectedProfiles.includes(activePmProfileId))) {
      setActivePmProfileId(localSelectedProfiles[0] ?? '')
    }
  }, [localSelectedProfiles]) // eslint-disable-line react-hooks/exhaustive-deps

  const selectedProfileObjs = instProfiles.filter(p => localSelectedProfiles.includes(p.trash_id))

  // Unsaved indicator for Profile Management section
  const pmUnsaved = useMemo(() => {
    const cfg = configs.find(c => c.instanceId === instanceId)
    if (!cfg) return false
    return JSON.stringify(cfg.userCfNames ?? []) !== JSON.stringify(localUserCfs) ||
      JSON.stringify(cfg.scoreOverrides ?? []) !== JSON.stringify(localScoreOverrides)
  }, [configs, instanceId, localUserCfs, localScoreOverrides])

  // Profile config helpers (keyed by trash_id)
  const getProfileConfig = (trashId: string): import('../types/recyclarr').RecyclarrProfileConfig =>
    localProfilesConfig.find(pc => pc.trash_id === trashId) ?? {
      trash_id: trashId,
      name: instProfiles.find(p => p.trash_id === trashId)?.name ?? trashId,
      reset_unmatched_scores_enabled: true,
      reset_unmatched_scores_except: [],
    }

  const updateProfileConfig = (trashId: string, updates: Partial<import('../types/recyclarr').RecyclarrProfileConfig>) => {
    setLocalProfilesConfig(prev => {
      const existing = prev.find(pc => pc.trash_id === trashId)
      const name = instProfiles.find(p => p.trash_id === trashId)?.name ?? trashId
      if (existing) return prev.map(pc => pc.trash_id === trashId ? { ...pc, ...updates } : pc)
      return [...prev, { trash_id: trashId, name, reset_unmatched_scores_enabled: true, reset_unmatched_scores_except: [], ...updates }]
    })
  }

  const handleSave = async () => {
    if (!instanceId) return
    setSaving(true)
    setSaveError('')
    try {
      const syncSchedule = buildCronExpression(scheduleMode, scheduleTime, scheduleWeekday, scheduleCustom)
      await saveConfig(instanceId, {
        enabled: localEnabled,
        selectedProfiles: localSelectedProfiles,
        scoreOverrides: localScoreOverrides,
        userCfNames: localUserCfs,
        preferredRatio: localPreferredRatio,
        profilesConfig: localProfilesConfig.filter(pc => localSelectedProfiles.includes(pc.trash_id)),
        syncSchedule,
        deleteOldCfs: localDeleteOldCfs,
      })
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    setResetting(true)
    try {
      await resetConfig()
      await loadConfigs()
    } catch { /* ignore */ } finally {
      setResetting(false)
      setShowResetConfirm(false)
    }
  }

  const handleClearCache = async () => {
    if (!instType) return
    setClearingCache(true)
    try {
      await clearCache(instType)
      await Promise.all([loadProfiles(instType, true), loadCfs(instType, true)])
    } catch { /* ignore */ } finally {
      setClearingCache(false)
    }
  }

  const handleAddUserCf = () => {
    if (!newCfName.trim()) return
    const cfNameTrimmed = newCfName.trim()
    const cfTrashId = 'user-' + cfNameTrimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const profName = instProfiles.find(p => p.trash_id === newCfProfileTrashId)?.name ?? ''
    setLocalUserCfs(prev => [...prev, { trash_id: cfTrashId, name: cfNameTrimmed, score: parseInt(newCfScore, 10) || 0, profileTrashId: newCfProfileTrashId, profileName: profName }])
    // Auto-protect: add CF trash_id to all selected profiles' except list
    setLocalProfilesConfig(prev => {
      const existingTrashIds = new Set(prev.map(pc => pc.trash_id))
      const updated = prev.map(pc => {
        if (!pc.reset_unmatched_scores_except.includes(cfTrashId)) {
          return { ...pc, reset_unmatched_scores_except: [...pc.reset_unmatched_scores_except, cfTrashId] }
        }
        return pc
      })
      for (const tid of localSelectedProfiles) {
        if (!existingTrashIds.has(tid)) {
          const name = instProfiles.find(p => p.trash_id === tid)?.name ?? tid
          updated.push({ trash_id: tid, name, reset_unmatched_scores_enabled: true, reset_unmatched_scores_except: [cfTrashId] })
        }
      }
      return updated
    })
    setNewCfName('')
    setNewCfScore('0')
    setNewCfProfileTrashId('')
  }

  const handleRemoveUserCf = (idx: number) => {
    setLocalUserCfs(prev => {
      const ucf = prev[idx]
      const remaining = prev.filter((_, i) => i !== idx)
      if (ucf && !remaining.some(u => u.name === ucf.name)) {
        setLocalProfilesConfig(pcs => pcs.map(pc => ({
          ...pc,
          reset_unmatched_scores_except: pc.reset_unmatched_scores_except.filter(n => n !== ucf.name),
        })))
      }
      return remaining
    })
  }

  const currentConfig = configs.find(c => c.instanceId === instanceId)

  const profileGroups = instProfiles.reduce<Record<string, typeof instProfiles>>((acc, p) => {
    const g = p.group ?? 'Standard'
    if (!acc[g]) acc[g] = []
    acc[g].push(p)
    return acc
  }, {})
  const profileGroupOrder = ['Standard', 'Anime', 'Deutsch (German)', 'French', 'Dutch']
  const sortedProfileGroups = [...new Set([...profileGroupOrder, ...Object.keys(profileGroups)])].filter(g => profileGroups[g]?.length)

  const cronValid = (expr: string): boolean => {
    if (!expr || expr === 'manual') return true
    const p = expr.trim().split(/\s+/)
    if (p.length !== 5) return false
    const ranges = [[0,59],[0,23],[1,31],[1,12],[0,7]]
    return p.every((part, i) => {
      if (part === '*') return true
      const n = parseInt(part, 10)
      const range = ranges[i]
      return !isNaN(n) && range !== undefined && n >= range[0] && n <= range[1]
    })
  }

  const sStyle = {
    background: 'rgba(var(--text-rgb), 0.06)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    padding: '4px 8px',
    fontSize: 12,
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-sans)',
  }

  // Filtered CFs for score override table (sorted A→Z)
  const filteredCfs = useMemo(() => {
    let list = instCfs
    if (scoreSearch) list = list.filter(cf => cf.name.toLowerCase().includes(scoreSearch.toLowerCase()))
    if (showOnlyOverridden) list = list.filter(cf => localScoreOverrides.some(o => o.trash_id === cf.trash_id))
    return [...list].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
  }, [instCfs, scoreSearch, showOnlyOverridden, localScoreOverrides])

  if (radarrSonarrInstances.length === 0) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No Radarr or Sonarr instances configured.</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Top bar */}
      {isAdmin && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" onClick={handleClearCache} disabled={clearingCache || !instType} style={{ fontSize: 12, gap: 6 }}>
            {clearingCache ? <div className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> : <RefreshCw size={12} />}
            Cache leeren
          </button>
          {(profilesWarning || cfsWarning) && (
            <span className="badge badge-warning" style={{ fontSize: 10 }}>Cache-Daten — Container nicht erreichbar</span>
          )}
          <div style={{ flex: 1 }} />
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setShowResetConfirm(true)}
            disabled={resetting}
            style={{ fontSize: 12, gap: 6, color: '#f87171', borderColor: 'rgba(248,113,113,0.3)' }}
            title="Alle Recyclarr-Einstellungen löschen"
          >
            {resetting ? <div className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> : <X size={12} />}
            Config zurücksetzen
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => setShowWizard(true)}
            style={{ fontSize: 12, gap: 6 }}
          >
            <Plus size={12} />
            {configs.some(c => c.instanceId === selectedInstanceId) ? 'Neu einrichten' : 'Konfiguration einrichten'}
          </button>
        </div>
      )}

      {/* ─ Global Sync Section ─ */}
      {isAdmin && (
        <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h4 style={{ fontSize: 14, fontWeight: 600, margin: 0, flex: 1 }}>Synchronisation</h4>
            <span className="badge-neutral" style={{ fontSize: 10 }}>Synchronisiert alle konfigurierten Instanzen gleichzeitig</span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="btn btn-primary btn-sm" onClick={() => { setAdoptResult(null); sync(undefined) }} disabled={syncing || adopting} style={{ fontSize: 12, gap: 4 }}>
              {syncing ? <div className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> : <Check size={12} />}
              {syncing ? 'Syncing…' : 'Global Sync'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={async () => {
              setAdopting(true)
              setAdoptResult(null)
              try { setAdoptResult(await adoptCfs()) } catch { setAdoptResult({ ok: false, output: 'Request failed' }) }
              setAdopting(false)
            }} disabled={syncing || adopting} style={{ fontSize: 12, gap: 4 }}>
              {adopting ? <div className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> : <Check size={12} />}
              {adopting ? 'Adopting…' : 'Adopt CFs'}
            </button>
            {adoptResult && (
              adoptResult.ok
                ? <span className="badge-success" style={{ fontSize: 11 }}>Adoption erfolgreich</span>
                : <span className="badge-error" style={{ fontSize: 11 }}>Adoption fehlgeschlagen</span>
            )}
            {syncDone && syncExitCode !== null && (
              syncExitCode === 0
                ? <span className="badge-success" style={{ fontSize: 11 }}>Sync abgeschlossen</span>
                : <span className="badge-error" style={{ fontSize: 11 }}>Sync fehlgeschlagen (exit {syncExitCode})</span>
            )}
          </div>
          {(syncLines.length > 0 || syncing) && (
            <pre ref={syncOutputRef} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 12, overflowY: 'auto', whiteSpace: 'pre-wrap', maxHeight: 240, margin: 0 }}>
              {syncLines.map((sl, i) => (
                <span key={i} style={{ display: 'block', color: sl.type === 'stderr' ? 'var(--status-offline)' : 'var(--text-primary)' }}>{sl.line}</span>
              ))}
              {syncing && <span style={{ color: 'var(--text-muted)', display: 'block' }}>…</span>}
            </pre>
          )}
        </div>
      )}

      {/* Instance selector */}
      {radarrSonarrInstances.length > 1 && (
        <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: '6px 8px', display: 'flex', gap: 2, alignSelf: 'flex-start' }}>
          {radarrSonarrInstances.map(i => (
            <button key={i.id} onClick={() => setSelectedInstanceId(i.id)} style={{
              padding: '7px 14px', borderRadius: 'var(--radius-md)', fontSize: 13,
              fontWeight: selectedInstanceId === i.id ? 600 : 400,
              background: selectedInstanceId === i.id ? 'rgba(var(--accent-rgb), 0.12)' : 'transparent',
              color: selectedInstanceId === i.id ? 'var(--accent)' : 'var(--text-secondary)',
              border: selectedInstanceId === i.id ? '1px solid rgba(var(--accent-rgb), 0.25)' : '1px solid transparent',
              cursor: 'pointer', transition: 'all 150ms ease', fontFamily: 'var(--font-sans)',
            }}>{i.name}</button>
          ))}
        </div>
      )}

      {instanceId && (
        <>
          {/* ─ Section A: Profile Selection ─ */}
          <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h4 style={{ fontSize: 14, fontWeight: 600, margin: 0, flex: 1 }}>Quality Profiles</h4>
              {isAdmin && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={localEnabled} onChange={e => setLocalEnabled(e.target.checked)} />
                  Enabled
                </label>
              )}
              {isAdmin && (
                <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving} style={{ fontSize: 12, gap: 4 }}>
                  <Check size={12} />
                  {saving ? 'Saving…' : 'Save'}
                </button>
              )}
            </div>

            {saveError && (
              <div style={{ fontSize: 12, color: 'var(--status-offline)', padding: '8px 12px', background: 'rgba(239,68,68,0.1)', borderRadius: 'var(--radius-md)' }}>
                {saveError}
              </div>
            )}

            {/* Delete old CFs toggle */}
            {isAdmin && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={localDeleteOldCfs} onChange={e => setLocalDeleteOldCfs(e.target.checked)} />
                  Nicht mehr verwendete Custom Formats löschen
                </label>
                {localDeleteOldCfs
                  ? <span className="badge badge-error" style={{ fontSize: 10, alignSelf: 'flex-start' }}>
                      Löscht CFs die Recyclarr erstellt hat wenn sie aus der Config entfernt werden. Eigene CFs (z.B. Tdarr) sind nur geschützt wenn ihre Namen in "Reset Scores Ausnahmen" eingetragen sind.
                    </span>
                  : <span className="badge badge-success" style={{ fontSize: 10, alignSelf: 'flex-start' }}>
                      Sicher — keine CFs werden automatisch gelöscht.
                    </span>
                }
              </div>
            )}

            {/* Preferred Ratio */}
            {isAdmin && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)', minWidth: 130 }}>Preferred Ratio</label>
                <input type="number" min={0} max={1} step={0.1} value={localPreferredRatio}
                  onChange={e => setLocalPreferredRatio(parseFloat(e.target.value) || 0)}
                  style={{ ...sStyle, width: 80 }} />
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>0.0 = Qualität, 1.0 = Dateigröße</span>
              </div>
            )}

            {loading ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading…</span>
              </div>
            ) : instProfiles.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                Keine Profile gefunden. Stelle sicher dass der Recyclarr-Container läuft und der Container-Name korrekt konfiguriert ist.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {sortedProfileGroups.map(group => (
                  <div key={group}>
                    {sortedProfileGroups.length > 1 && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, fontStyle: 'italic' }}>{group}</div>
                    )}
                    {(profileGroups[group] ?? []).map(p => {
                      const isSelected = localSelectedProfiles.includes(p.trash_id)
                      const isExpanded = expandedProfiles.has(p.trash_id)
                      const pc = getProfileConfig(p.trash_id)
                      const exceptInput = newExceptInputs[p.trash_id] ?? ''
                      return (
                        <div key={p.trash_id} style={{ marginBottom: 6 }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: isAdmin ? 'pointer' : 'default', userSelect: 'none' }}>
                            <input type="checkbox" checked={isSelected}
                              onChange={e => {
                                if (!isAdmin) return
                                setLocalSelectedProfiles(prev => e.target.checked ? [...prev, p.trash_id] : prev.filter(id => id !== p.trash_id))
                              }} disabled={!isAdmin} />
                            {p.name}
                            <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{p.trash_id.slice(0, 8)}</span>
                          </label>

                          {isAdmin && isSelected && (
                            <div style={{ marginLeft: 20, marginTop: 4 }}>
                              <button onClick={() => setExpandedProfiles(prev => {
                                const next = new Set(prev)
                                if (next.has(p.trash_id)) next.delete(p.trash_id); else next.add(p.trash_id)
                                return next
                              })} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0' }}>
                                {isExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                                Erweiterte Einstellungen
                              </button>
                              {isExpanded && (
                                <div style={{ marginTop: 6, padding: '10px 12px', background: 'rgba(var(--text-rgb), 0.04)', borderRadius: 'var(--radius-sm)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Min Format Score</label>
                                    <input type="number" value={pc.min_format_score ?? ''} placeholder="Kein Minimum"
                                      onChange={e => {
                                        const v = e.target.value
                                        updateProfileConfig(p.trash_id, { min_format_score: v === '' ? undefined : parseInt(v, 10) || 0 })
                                      }} style={{ ...sStyle, width: 150 }} />
                                    <span className="badge badge-neutral" style={{ fontSize: 10, alignSelf: 'flex-start' }}>
                                      10000 = Englische Releases überspringen (nur Deutsch)
                                    </span>
                                  </div>

                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                                      <input type="checkbox" checked={pc.reset_unmatched_scores_enabled}
                                        onChange={e => updateProfileConfig(p.trash_id, { reset_unmatched_scores_enabled: e.target.checked })} />
                                      Reset unmatched scores
                                    </label>
                                    {pc.reset_unmatched_scores_enabled && (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Ausnahmen (werden NICHT zurückgesetzt):</div>
                                        {pc.reset_unmatched_scores_except.length > 0 && (
                                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                            {pc.reset_unmatched_scores_except.map((ex, idx) => (
                                              <span key={idx} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', background: 'rgba(var(--accent-rgb), 0.1)', border: '1px solid rgba(var(--accent-rgb), 0.25)', borderRadius: 'var(--radius-sm)', fontSize: 11, color: 'var(--accent)' }}>
                                                {ex}
                                                <button onClick={() => updateProfileConfig(p.trash_id, {
                                                  reset_unmatched_scores_except: pc.reset_unmatched_scores_except.filter((_, i) => i !== idx)
                                                })} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'inherit', lineHeight: 1 }}>
                                                  <X size={9} />
                                                </button>
                                              </span>
                                            ))}
                                          </div>
                                        )}
                                        <div style={{ display: 'flex', gap: 6 }}>
                                          <input style={{ ...sStyle, flex: 1 }} placeholder='z.B. "TDARR"' value={exceptInput}
                                            onChange={e => setNewExceptInputs(prev => ({ ...prev, [p.trash_id]: e.target.value }))}
                                            onKeyDown={e => {
                                              if (e.key === 'Enter' && exceptInput.trim()) {
                                                if (!pc.reset_unmatched_scores_except.includes(exceptInput.trim())) {
                                                  updateProfileConfig(p.trash_id, { reset_unmatched_scores_except: [...pc.reset_unmatched_scores_except, exceptInput.trim()] })
                                                }
                                                setNewExceptInputs(prev => ({ ...prev, [p.trash_id]: '' }))
                                              }
                                            }} />
                                          <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, padding: '4px 8px' }}
                                            onClick={() => {
                                              if (exceptInput.trim() && !pc.reset_unmatched_scores_except.includes(exceptInput.trim())) {
                                                updateProfileConfig(p.trash_id, { reset_unmatched_scores_except: [...pc.reset_unmatched_scores_except, exceptInput.trim()] })
                                              }
                                              setNewExceptInputs(prev => ({ ...prev, [p.trash_id]: '' }))
                                            }}>
                                            <Plus size={11} />
                                          </button>
                                        </div>
                                        <span className="badge badge-warning" style={{ fontSize: 10, alignSelf: 'flex-start' }}>
                                          Formate in dieser Liste werden NICHT zurückgesetzt — wichtig für eigene CFs wie Tdarr
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ─ Profile Management section ─ */}
          {isAdmin && localSelectedProfiles.length > 0 && (
            <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h4 style={{ fontSize: 14, fontWeight: 600, margin: 0, flex: 1 }}>Profile Management</h4>
                {pmUnsaved && <span className="badge badge-warning" style={{ fontSize: 10 }}>Unsaved changes</span>}
                <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving} style={{ fontSize: 12, gap: 4 }}>
                  <Check size={12} />
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>

              {/* Profile tabs */}
              {selectedProfileObjs.length > 1 && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {selectedProfileObjs.map(p => (
                    <button
                      key={p.trash_id}
                      onClick={() => setActivePmProfileId(p.trash_id)}
                      style={{
                        padding: '5px 14px', borderRadius: 'var(--radius-md)', fontSize: 12, cursor: 'pointer',
                        background: activePmProfileId === p.trash_id ? 'rgba(var(--accent-rgb), 0.12)' : 'transparent',
                        color: activePmProfileId === p.trash_id ? 'var(--accent)' : 'var(--text-secondary)',
                        border: activePmProfileId === p.trash_id ? '1px solid rgba(var(--accent-rgb), 0.25)' : '1px solid rgba(var(--border-rgb), 0.2)',
                        transition: 'all 150ms ease',
                      }}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              )}

              {activePmProfileId && (
                <>
                  {/* User CFs subsection */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>User CFs</div>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
                      Eigene CFs aus dem Filesystem — Checkbox = aktiv für dieses Profil.
                    </p>
                    {userCfsFromFsLoading ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Lade User CFs…</span>
                      </div>
                    ) : userCfsFromFs.length === 0 ? (
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                        Keine User CFs gefunden. Erstelle sie im CF Manager Tab.
                      </p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {(() => {
                          const activePmProfileName = selectedProfileObjs.find(p => p.trash_id === activePmProfileId)?.name ?? ''
                          return [...userCfsFromFs]
                            .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
                            .map(cf => {
                              const entry = localUserCfs.find(u => u.trash_id === cf.trash_id && u.profileTrashId === activePmProfileId)
                              const checked = !!entry
                              return (
                                <div key={cf.trash_id} style={{
                                  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                                  background: checked ? 'rgba(var(--accent-rgb), 0.06)' : 'rgba(var(--text-rgb), 0.03)',
                                  borderRadius: 'var(--radius-sm)',
                                  border: checked ? '1px solid rgba(var(--accent-rgb), 0.2)' : '1px solid transparent',
                                }}>
                                  <input type="checkbox" checked={checked} onChange={e => {
                                    if (e.target.checked) {
                                      setLocalUserCfs(prev => [...prev, {
                                        trash_id: cf.trash_id,
                                        name: cf.name,
                                        score: 0,
                                        profileTrashId: activePmProfileId,
                                        profileName: activePmProfileName,
                                      }])
                                    } else {
                                      setLocalUserCfs(prev => prev.filter(u => !(u.trash_id === cf.trash_id && u.profileTrashId === activePmProfileId)))
                                    }
                                  }} />
                                  <span style={{ flex: 1, fontSize: 13 }}>{cf.name}</span>
                                  <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{cf.trash_id}</span>
                                  {checked && (
                                    <input
                                      type="number"
                                      value={entry.score}
                                      onChange={e => setLocalUserCfs(prev => prev.map(u =>
                                        u.trash_id === cf.trash_id && u.profileTrashId === activePmProfileId
                                          ? { ...u, score: parseInt(e.target.value, 10) || 0 }
                                          : u
                                      ))}
                                      style={{ width: 70, textAlign: 'right', background: 'rgba(var(--text-rgb), 0.06)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '2px 6px', fontSize: 12, color: 'var(--text-primary)' }}
                                    />
                                  )}
                                </div>
                              )
                            })
                        })()}
                      </div>
                    )}
                  </div>

                  {/* Score Overrides subsection */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>Score Overrides</div>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
                      TRaSH Custom Format Scores für dieses Profil überschreiben. Leer = TRaSH-Standard.
                    </p>
                    {instCfs.length === 0 ? (
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                        {loading ? 'Lade CFs…' : 'Keine TRaSH CFs verfügbar.'}
                      </p>
                    ) : (
                      <>
                        <input
                          value={pmScoreSearch}
                          onChange={e => setPmScoreSearch(e.target.value)}
                          placeholder="Suchen…"
                          style={{ ...sStyle, maxWidth: 280 }}
                        />
                        <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                <th style={{ textAlign: 'left', padding: '5px 8px', color: 'var(--text-muted)', fontWeight: 500 }}>Name</th>
                                <th style={{ textAlign: 'right', padding: '5px 8px', color: 'var(--text-muted)', fontWeight: 500, width: 110 }}>Override Score</th>
                              </tr>
                            </thead>
                            <tbody>
                              {[...instCfs]
                                .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
                                .filter(cf => !pmScoreSearch || cf.name.toLowerCase().includes(pmScoreSearch.toLowerCase()))
                                .map(cf => {
                                  const override = localScoreOverrides.find(o => o.trash_id === cf.trash_id && o.profileTrashId === activePmProfileId)
                                  return (
                                    <tr key={cf.trash_id} style={{ borderBottom: '1px solid rgba(var(--text-rgb), 0.05)', background: override ? 'rgba(var(--accent-rgb), 0.04)' : 'transparent' }}>
                                      <td style={{ padding: '5px 8px', color: 'var(--text-primary)' }}>{cf.name}</td>
                                      <td style={{ padding: '5px 8px', textAlign: 'right' }}>
                                        <input
                                          type="number"
                                          value={override?.score ?? ''}
                                          placeholder="—"
                                          onChange={e => {
                                            const val = e.target.value
                                            setLocalScoreOverrides(prev => {
                                              const filtered = prev.filter(o => !(o.trash_id === cf.trash_id && o.profileTrashId === activePmProfileId))
                                              if (val === '') return filtered
                                              return [...filtered, { trash_id: cf.trash_id, name: cf.name, score: parseInt(val, 10) || 0, profileTrashId: activePmProfileId }]
                                            })
                                          }}
                                          style={{ width: 70, textAlign: 'right', background: 'rgba(var(--text-rgb), 0.06)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '3px 6px', fontSize: 12, color: 'var(--text-primary)' }}
                                        />
                                      </td>
                                    </tr>
                                  )
                                })}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ─ Section B: Score Overrides ─ */}
          <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h4 style={{ fontSize: 14, fontWeight: 600, margin: 0, flex: 1 }}>Score Overrides</h4>
              <span className="badge-neutral" style={{ fontSize: 11 }}>{localScoreOverrides.length} Overrides</span>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
              Überschreibe TRaSH-Standard-Scores für bestimmte Custom Formats. Leer lassen = TRaSH-Standard-Score verwenden.
            </p>

            {/* Profile tabs */}
            {selectedProfileObjs.length > 1 && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {selectedProfileObjs.map(p => (
                  <button
                    key={p.trash_id}
                    onClick={() => setActiveScoreProfileId(p.trash_id)}
                    style={{
                      padding: '4px 12px', borderRadius: 'var(--radius-md)', fontSize: 12, cursor: 'pointer',
                      background: activeScoreProfileId === p.trash_id ? 'rgba(var(--accent-rgb), 0.12)' : 'transparent',
                      color: activeScoreProfileId === p.trash_id ? 'var(--accent)' : 'var(--text-secondary)',
                      border: activeScoreProfileId === p.trash_id ? '1px solid rgba(var(--accent-rgb), 0.25)' : '1px solid rgba(var(--border-rgb), 0.2)',
                      transition: 'all 150ms ease',
                    }}
                  >
                    {p.name}
                    {localScoreOverrides.filter(o => o.profileTrashId === p.trash_id).length > 0 && (
                      <span style={{ marginLeft: 6, fontSize: 10, opacity: 0.7 }}>
                        {localScoreOverrides.filter(o => o.profileTrashId === p.trash_id).length}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {instCfs.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                {loading ? 'Lade CFs…' : 'Keine TRaSH Custom Formats verfügbar. Cache leeren und erneut versuchen.'}
              </p>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <input value={scoreSearch} onChange={e => setScoreSearch(e.target.value)} placeholder="Suchen…" style={{ ...sStyle, flex: 1, minWidth: 120 }} />
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    <input type="checkbox" checked={showOnlyOverridden} onChange={e => setShowOnlyOverridden(e.target.checked)} />
                    Nur Overrides anzeigen
                  </label>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 500 }}>Name</th>
                        <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 500 }}>Override Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCfs.map(cf => {
                        const tabId = activeScoreProfileId || (selectedProfileObjs[0]?.trash_id ?? '')
                        const override = localScoreOverrides.find(o => o.trash_id === cf.trash_id && o.profileTrashId === tabId)
                        return (
                          <tr key={cf.trash_id} style={{ borderBottom: '1px solid rgba(var(--text-rgb), 0.06)', background: override ? 'rgba(var(--accent-rgb), 0.04)' : 'transparent' }}>
                            <td style={{ padding: '6px 8px', color: 'var(--text-primary)' }}>{cf.name}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                              {isAdmin ? (
                                <input type="number" value={override?.score ?? ''} placeholder="—"
                                  onChange={e => {
                                    const val = e.target.value
                                    const ptid = tabId
                                    setLocalScoreOverrides(prev => {
                                      const filtered = prev.filter(o => !(o.trash_id === cf.trash_id && o.profileTrashId === ptid))
                                      if (val === '') return filtered
                                      return [...filtered, { trash_id: cf.trash_id, name: cf.name, score: parseInt(val, 10) || 0, profileTrashId: ptid }]
                                    })
                                  }}
                                  style={{ width: 70, textAlign: 'right', background: 'rgba(var(--text-rgb), 0.06)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '3px 6px', fontSize: 12, color: 'var(--text-primary)' }} />
                              ) : (
                                <span style={{ color: 'var(--text-secondary)' }}>{override?.score ?? '—'}</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          {/* ─ Section C: User Custom Formats ─ */}
          <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h4 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>User Custom Formats</h4>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
              Eigene CFs die bereits in der Arr-Instanz existieren — werden mit einem Score einem Profil zugewiesen.
            </p>
            {localUserCfs.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {localUserCfs.map((ucf, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '6px 8px', background: 'rgba(var(--text-rgb), 0.04)', borderRadius: 'var(--radius-sm)' }}>
                    <span style={{ flex: 1 }}>{ucf.name}</span>
                    <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                      {selectedProfileObjs.find(p => p.trash_id === ucf.profileTrashId)?.name ?? ucf.profileName ?? '—'}
                    </span>
                    <span style={{ color: 'var(--accent)', fontSize: 12, minWidth: 40, textAlign: 'right' }}>{ucf.score}</span>
                    {isAdmin && (
                      <button className="btn btn-danger btn-icon btn-sm" onClick={() => handleRemoveUserCf(idx)} style={{ width: 22, height: 22, padding: 3 }}>
                        <X size={10} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {isAdmin && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <input className="form-input" placeholder="CF name" value={newCfName} onChange={e => setNewCfName(e.target.value)} style={{ flex: 2, minWidth: 120, fontSize: 12 }} />
                <select value={newCfProfileTrashId} onChange={e => setNewCfProfileTrashId(e.target.value)} style={{ ...sStyle, flex: 2, minWidth: 120 }}>
                  <option value="">Profil wählen…</option>
                  {selectedProfileObjs.map(p => (
                    <option key={p.trash_id} value={p.trash_id}>{p.name}</option>
                  ))}
                </select>
                <input className="form-input" type="number" placeholder="Score" value={newCfScore} onChange={e => setNewCfScore(e.target.value)} style={{ flex: 1, minWidth: 70, fontSize: 12 }} />
                <button className="btn btn-ghost btn-sm" onClick={handleAddUserCf} style={{ fontSize: 12, gap: 4 }}>
                  <Plus size={12} />Add
                </button>
              </div>
            )}
          </div>

          {/* ─ Section D: Sync-Zeitplan (admin only) ─ */}
          {isAdmin && (
            <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 600 }}>
                <Clock size={14} style={{ color: 'var(--text-muted)' }} />
                Sync-Zeitplan
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                Automatischer Zeitplan für diese Instanz. CRON_SCHEDULE im Recyclarr-Container muss deaktiviert sein.
              </p>
              {currentConfig?.lastSyncedAt && (
                <div style={{ fontSize: 12 }}>
                  {currentConfig.lastSyncSuccess === true
                    ? <span className="badge-success" style={{ fontSize: 11 }}>Letzter Sync: {formatRelativeTime(currentConfig.lastSyncedAt)}</span>
                    : currentConfig.lastSyncSuccess === false
                    ? <span className="badge-error" style={{ fontSize: 11 }}>Letzter Sync fehlgeschlagen: {formatRelativeTime(currentConfig.lastSyncedAt)}</span>
                    : <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Noch kein Sync durchgeführt</span>
                  }
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input type="radio" name={`sched-${instanceId}`} checked={scheduleMode === 'manual'} onChange={() => setScheduleMode('manual')} />
                  Manuell (Standard)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', flexWrap: 'wrap' }}>
                  <input type="radio" name={`sched-${instanceId}`} checked={scheduleMode === 'daily'} onChange={() => setScheduleMode('daily')} />
                  Täglich um
                  <input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} disabled={scheduleMode !== 'daily'}
                    style={{ ...sStyle, width: 100, opacity: scheduleMode !== 'daily' ? 0.4 : 1 }} />
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', flexWrap: 'wrap' }}>
                  <input type="radio" name={`sched-${instanceId}`} checked={scheduleMode === 'weekly'} onChange={() => setScheduleMode('weekly')} />
                  Wöchentlich
                  <select value={scheduleWeekday} onChange={e => setScheduleWeekday(e.target.value)} disabled={scheduleMode !== 'weekly'}
                    style={{ ...sStyle, opacity: scheduleMode !== 'weekly' ? 0.4 : 1 }}>
                    <option value="1">Montag</option>
                    <option value="2">Dienstag</option>
                    <option value="3">Mittwoch</option>
                    <option value="4">Donnerstag</option>
                    <option value="5">Freitag</option>
                    <option value="6">Samstag</option>
                    <option value="0">Sonntag</option>
                  </select>
                  um
                  <input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} disabled={scheduleMode !== 'weekly'}
                    style={{ ...sStyle, width: 100, opacity: scheduleMode !== 'weekly' ? 0.4 : 1 }} />
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                    <input type="radio" name={`sched-${instanceId}`} checked={scheduleMode === 'custom'} onChange={() => setScheduleMode('custom')} />
                    Benutzerdefiniert
                  </label>
                  <input value={scheduleCustom} onChange={e => setScheduleCustom(e.target.value)} disabled={scheduleMode !== 'custom'}
                    placeholder="0 4 * * *" style={{ ...sStyle, width: 130, fontFamily: 'var(--font-mono)', opacity: scheduleMode !== 'custom' ? 0.4 : 1 }} />
                  {scheduleMode === 'custom' && scheduleCustom && (
                    cronValid(scheduleCustom)
                      ? <span className="badge-success" style={{ fontSize: 10 }}>Gültig</span>
                      : <span className="badge-error" style={{ fontSize: 10 }}>Ungültig</span>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Setup Wizard */}
      {showWizard && (
        <RecyclarrWizard
          onClose={() => setShowWizard(false)}
          instances={radarrSonarrInstances}
        />
      )}

      {/* Reset confirm modal */}
      {showResetConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 24, maxWidth: 380, width: '90%' }}>
            <p style={{ fontSize: 14, marginBottom: 8 }}>Alle Recyclarr-Einstellungen werden gelöscht.</p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>Die recyclarr.yml wird beim nächsten Sync neu generiert. Fortfahren?</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowResetConfirm(false)} className="btn btn-ghost btn-sm" style={{ fontSize: 13 }}>Abbrechen</button>
              <button onClick={handleReset} disabled={resetting} className="btn btn-danger btn-sm" style={{ fontSize: 13 }}>
                {resetting ? 'Zurücksetzen…' : 'Zurücksetzen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── CF Manager helpers ─────────────────────────────────────────────────────────

const SPEC_TYPE_NAMES: Record<string, string> = {
  ReleaseTitleSpecification: 'Release Titel',
  LanguageSpecification: 'Sprache',
  QualityModifierSpecification: 'Qualitäts-Modifier',
  SizeSpecification: 'Dateigröße',
  IndexerFlagSpecification: 'Indexer Flag',
  SourceSpecification: 'Quelle',
  ResolutionSpecification: 'Auflösung',
  ReleaseGroupSpecification: 'Release-Gruppe',
}

const KNOWN_SPEC_IMPLS = new Set(Object.keys(SPEC_TYPE_NAMES))

interface DraftSpec {
  name: string
  implementation: string
  negate: boolean
  required: boolean
  value: string
  isUnknown: boolean
  rawJson: string
  originalFields: { name: string; value: unknown }[]
}

function initDraftSpec(): DraftSpec {
  return {
    name: '',
    implementation: 'ReleaseTitleSpecification',
    negate: false,
    required: false,
    value: '',
    isUnknown: false,
    rawJson: '[]',
    originalFields: [],
  }
}

const RESOLUTION_REVERSE_MAP: Record<number, string> = {
  360: 'R360p', 480: 'R480p', 540: 'R540p', 576: 'R576p',
  720: 'R720p', 1080: 'R1080p', 2160: 'R2160p',
}

function toDraftSpec(spec: ArrCFSpecification): DraftSpec {
  const isUnknown = !KNOWN_SPEC_IMPLS.has(spec.implementation)
  // fields may be array (Radarr API / old format) or object (new file format)
  const fields = spec.fields as unknown
  let value = ''
  if (Array.isArray(fields)) {
    const valueField = (fields as { name: string; value: unknown }[]).find(f => f.name === 'value')
    value = valueField == null ? '' : typeof valueField.value === 'string' ? valueField.value : String(valueField.value)
  } else if (fields && typeof fields === 'object') {
    const v = (fields as Record<string, unknown>).value
    value = v == null ? '' : typeof v === 'string' ? v : String(v)
  }
  if (spec.implementation === 'ResolutionSpecification') {
    value = RESOLUTION_REVERSE_MAP[Number(value)] ?? value
  }
  return {
    name: spec.name,
    implementation: spec.implementation,
    negate: spec.negate,
    required: spec.required,
    value,
    isUnknown,
    rawJson: isUnknown ? JSON.stringify(spec.fields, null, 2) : '[]',
    originalFields: Array.isArray(fields) ? (fields as { name: string; value: unknown }[]) : [],
  }
}

const RESOLUTION_MAP: Record<string, number> = {
  R360p: 360, R480p: 480, R540p: 540, R576p: 576,
  R720p: 720, R1080p: 1080, R2160p: 2160,
}

function buildSpecPayload(ds: DraftSpec): ArrCFSpecification {
  if (ds.isUnknown) {
    let fields: Record<string, unknown> = {}
    try {
      const arr = JSON.parse(ds.rawJson) as { name: string; value: unknown }[]
      fields = Object.fromEntries(arr.map(f => [f.name, f.value]))
    } catch { fields = {} }
    return { name: ds.name, implementation: ds.implementation, implementationName: ds.implementation, negate: ds.negate, required: ds.required, fields: fields as unknown as { name: string; value: unknown }[] }
  }
  let specValue: unknown = ds.value
  if (ds.implementation === 'ResolutionSpecification') {
    specValue = RESOLUTION_MAP[ds.value] ?? (parseInt(ds.value, 10) || 0)
  }
  return {
    name: ds.name,
    implementation: ds.implementation,
    implementationName: SPEC_TYPE_NAMES[ds.implementation] ?? ds.implementation,
    negate: ds.negate,
    required: ds.required,
    fields: { value: specValue } as unknown as { name: string; value: unknown }[],
  }
}

// ── User CF Row ────────────────────────────────────────────────────────────────

function UserCfRow({
  cf,
  isAdmin,
  onEdit,
  onDelete,
}: {
  cf: import('../types/recyclarr').UserCfFile
  isAdmin: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: '0 12px',
        padding: '8px 12px', borderRadius: 'var(--radius-sm)', alignItems: 'center',
        background: hovered ? 'rgba(var(--text-rgb), 0.04)' : 'transparent',
        transition: 'background 100ms ease',
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 500 }}>{cf.name}</span>
      <span className="badge-neutral" style={{ fontSize: 11, textAlign: 'center' }}>{cf.specifications.length}</span>
      <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{cf.trash_id}</span>
      <div style={{ display: 'flex', gap: 4, opacity: hovered && isAdmin ? 1 : 0, transition: 'opacity 150ms ease' }}>
        {isAdmin && (
          <>
            <button onClick={onEdit} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
              <Pencil size={12} />
            </button>
            <button onClick={onDelete} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#f87171', padding: 4 }}>
              <Trash2 size={12} />
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── User CF Edit Modal ─────────────────────────────────────────────────────────

function UserCfEditModal({
  initial,
  onClose,
  onSave,
}: {
  initial: import('../types/recyclarr').UserCfFile | null
  onClose: () => void
  onSave: (data: { name: string; specifications: ArrCFSpecification[] }) => Promise<void>
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [specs, setSpecs] = useState<DraftSpec[]>(
    initial ? initial.specifications.map(s => toDraftSpec(s as unknown as ArrCFSpecification)) : []
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const previewTrashId = name.trim()
    ? 'user-' + name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    : ''

  function updateSpec(idx: number, updater: (s: DraftSpec) => DraftSpec) {
    setSpecs(prev => prev.map((s, i) => i === idx ? updater(s) : s))
  }

  async function handleSave() {
    if (!name.trim()) { setError('Name ist erforderlich'); return }
    setSaving(true)
    setError(null)
    try {
      await onSave({ name: name.trim(), specifications: specs.map(buildSpecPayload) })
    } catch (e: unknown) {
      setError((e as Error).message)
      setSaving(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '40px 16px' }}>
      <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 24, width: '100%', maxWidth: 580 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>
          {initial ? 'User CF bearbeiten' : 'User CF erstellen'}
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Name *</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--radius-md)', fontSize: 13, border: '1px solid rgba(var(--border-rgb), 0.2)', background: 'rgba(var(--bg-secondary-rgb), 0.5)', color: 'var(--text)', boxSizing: 'border-box' }}
            />
          </div>

          {previewTrashId && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>trash_id:</span>
              <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--accent)', padding: '2px 8px', background: 'rgba(var(--accent-rgb), 0.08)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(var(--accent-rgb), 0.2)' }}>
                {previewTrashId}
              </span>
              {initial && initial.trash_id !== previewTrashId && (
                <span style={{ fontSize: 11, color: '#f59e0b' }}>⚠ trash_id locked to: {initial.trash_id}</span>
              )}
            </div>
          )}

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 500 }}>Conditions</span>
              <button
                onClick={() => setSpecs(prev => [...prev, initDraftSpec()])}
                style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, background: 'transparent', border: '1px solid rgba(var(--accent-rgb), 0.3)', color: 'var(--accent)', borderRadius: 'var(--radius-sm)', padding: '3px 8px', cursor: 'pointer' }}
              >
                <Plus size={11} /> Condition hinzufügen
              </button>
            </div>

            {specs.length === 0 && (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: '4px 0 8px' }}>Keine Conditions definiert</p>
            )}

            {specs.map((spec, idx) => (
              <div key={idx} style={{ background: 'rgba(var(--bg-secondary-rgb), 0.4)', borderRadius: 'var(--radius-md)', padding: '10px 12px', marginBottom: 8, border: '1px solid rgba(var(--border-rgb), 0.1)' }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                  <select
                    value={spec.implementation}
                    onChange={e => {
                      const newImpl = e.target.value
                      updateSpec(idx, s => ({ ...s, implementation: newImpl, isUnknown: !KNOWN_SPEC_IMPLS.has(newImpl), originalFields: [] }))
                    }}
                    style={{ flex: 1, minWidth: 140, padding: '4px 6px', borderRadius: 'var(--radius-sm)', fontSize: 12, background: 'rgba(var(--bg-secondary-rgb), 0.8)', color: 'var(--text)', border: '1px solid rgba(var(--border-rgb), 0.2)' }}
                  >
                    {Object.entries(SPEC_TYPE_NAMES).map(([impl, label]) => (
                      <option key={impl} value={impl}>{label}</option>
                    ))}
                    {spec.isUnknown && <option value={spec.implementation}>{spec.implementation}</option>}
                  </select>
                  <input
                    value={spec.name}
                    onChange={e => updateSpec(idx, s => ({ ...s, name: e.target.value }))}
                    placeholder="Name"
                    style={{ flex: 1, minWidth: 100, padding: '4px 6px', borderRadius: 'var(--radius-sm)', fontSize: 12, background: 'rgba(var(--bg-secondary-rgb), 0.8)', color: 'var(--text)', border: '1px solid rgba(var(--border-rgb), 0.2)' }}
                  />
                  <button
                    onClick={() => setSpecs(prev => prev.filter((_, i) => i !== idx))}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#f87171', padding: '4px' }}
                  >
                    <X size={13} />
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                    <input type="checkbox" checked={spec.negate} onChange={e => updateSpec(idx, s => ({ ...s, negate: e.target.checked }))} />
                    Nicht
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                    <input type="checkbox" checked={spec.required} onChange={e => updateSpec(idx, s => ({ ...s, required: e.target.checked }))} />
                    Pflicht
                  </label>
                </div>
                {spec.isUnknown ? (
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Fields (JSON)</label>
                    <textarea
                      value={spec.rawJson}
                      onChange={e => updateSpec(idx, s => ({ ...s, rawJson: e.target.value }))}
                      rows={3}
                      style={{ width: '100%', padding: '4px 6px', borderRadius: 'var(--radius-sm)', fontSize: 11, fontFamily: 'var(--font-mono)', background: 'rgba(var(--bg-secondary-rgb), 0.8)', color: 'var(--text)', border: '1px solid rgba(var(--border-rgb), 0.2)', resize: 'vertical', boxSizing: 'border-box' }}
                    />
                  </div>
                ) : (
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                      {spec.implementation === 'ReleaseTitleSpecification' || spec.implementation === 'ReleaseGroupSpecification' ? 'Regex' : 'Wert'}
                    </label>
                    {spec.implementation === 'ResolutionSpecification' ? (
                      <select
                        value={spec.value}
                        onChange={e => updateSpec(idx, s => ({ ...s, value: e.target.value }))}
                        style={{ width: '100%', padding: '4px 6px', borderRadius: 'var(--radius-sm)', fontSize: 12, background: 'rgba(var(--bg-secondary-rgb), 0.8)', color: 'var(--text)', border: '1px solid rgba(var(--border-rgb), 0.2)', boxSizing: 'border-box' }}
                      >
                        <option value="R360p">360p</option>
                        <option value="R480p">480p</option>
                        <option value="R540p">540p</option>
                        <option value="R576p">576p</option>
                        <option value="R720p">720p</option>
                        <option value="R1080p">1080p</option>
                        <option value="R2160p">2160p</option>
                      </select>
                    ) : (
                      <input
                        value={spec.value}
                        onChange={e => updateSpec(idx, s => ({ ...s, value: e.target.value }))}
                        style={{ width: '100%', padding: '4px 6px', borderRadius: 'var(--radius-sm)', fontSize: 12, background: 'rgba(var(--bg-secondary-rgb), 0.8)', color: 'var(--text)', border: '1px solid rgba(var(--border-rgb), 0.2)', boxSizing: 'border-box' }}
                      />
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {error && <p style={{ color: '#f87171', fontSize: 13, margin: 0 }}>{error}</p>}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button onClick={onClose} className="btn btn-ghost">Abbrechen</button>
            <button onClick={handleSave} disabled={saving} className="btn btn-primary">
              {saving ? 'Speichern…' : 'Speichern'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── CF Manager Tab ─────────────────────────────────────────────────────────────

function CfManagerTab() {
  const { isAdmin } = useStore()
  const [service, setService] = useState<'radarr' | 'sonarr'>('radarr')
  const [userCfs, setUserCfs] = useState<import('../types/recyclarr').UserCfFile[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [cfSearch, setCfSearch] = useState('')
  const [editingCf, setEditingCf] = useState<import('../types/recyclarr').UserCfFile | 'new' | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const loadUserCfs = async (svc: 'radarr' | 'sonarr') => {
    setLoading(true)
    setLoadError(null)
    try {
      const { api } = await import('../api')
      const res = await api.recyclarr.listUserCfs(svc)
      setUserCfs(res.cfs)
    } catch (e: unknown) {
      setLoadError((e as Error).message ?? 'Failed to load user CFs')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUserCfs(service)
  }, [service]) // eslint-disable-line react-hooks/exhaustive-deps

  const filteredCfs = userCfs
    .filter(cf => cf.name.toLowerCase().includes(cfSearch.toLowerCase()))
    .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Service tabs */}
      <div style={{ display: 'flex', gap: 8 }}>
        {(['radarr', 'sonarr'] as const).map(svc => (
          <button
            key={svc}
            onClick={() => { setService(svc); setCfSearch('') }}
            className={`btn btn-sm ${service === svc ? 'btn-primary' : 'btn-ghost'}`}
          >
            {svc.charAt(0).toUpperCase() + svc.slice(1)}
          </button>
        ))}
      </div>

      <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 20 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, fontSize: 15 }}>User Custom Formats</span>
          <span className="badge-neutral" style={{ fontSize: 11 }}>{userCfs.length}</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Scores werden im Wizard (Step 4) oder im Recyclarr-Tab vergeben.
          </span>
          <div style={{ flex: 1 }} />
          {isAdmin && (
            <button onClick={() => setEditingCf('new')} className="btn btn-primary btn-sm">
              <Plus size={12} /> Create
            </button>
          )}
        </div>

        {/* Search */}
        <div style={{ marginBottom: 12 }}>
          <input
            value={cfSearch}
            onChange={e => setCfSearch(e.target.value)}
            placeholder="Search…"
            style={{ width: '100%', borderRadius: 'var(--radius-md)', padding: '6px 10px', fontSize: 13, border: '1px solid rgba(var(--border-rgb), 0.2)', background: 'rgba(var(--bg-secondary-rgb), 0.5)', color: 'var(--text)', boxSizing: 'border-box' }}
          />
        </div>

        {loadError && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'rgba(248,113,113,0.08)', borderRadius: 'var(--radius-sm)', marginBottom: 10 }}>
            <AlertTriangle size={13} style={{ color: '#f87171', flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: '#f87171', flex: 1 }}>{loadError}</span>
            <button onClick={() => loadUserCfs(service)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#f87171', textDecoration: 'underline', fontSize: 12 }}>Retry</button>
          </div>
        )}

        {loading ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 24 }}>Loading…</p>
        ) : filteredCfs.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 24 }}>
            {cfSearch ? 'No user CFs match your search' : `No user CFs for ${service}. Click Create to add one.`}
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {/* Table header */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: '0 12px', padding: '4px 12px', marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>Name</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, textAlign: 'center' }}>Specs</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>trash_id</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>Actions</span>
            </div>
            {filteredCfs.map(cf => (
              <UserCfRow
                key={cf.trash_id}
                cf={cf}
                isAdmin={isAdmin}
                onEdit={() => setEditingCf(cf)}
                onDelete={() => setConfirmDeleteId(cf.trash_id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create/edit modal */}
      {editingCf != null && (
        <UserCfEditModal
          initial={editingCf === 'new' ? null : editingCf as import('../types/recyclarr').UserCfFile}
          onClose={() => setEditingCf(null)}
          onSave={async data => {
            const { api } = await import('../api')
            if (editingCf === 'new') {
              await api.recyclarr.createUserCf(service, data)
            } else {
              await api.recyclarr.updateUserCf(service, (editingCf as import('../types/recyclarr').UserCfFile).trash_id, data)
            }
            setEditingCf(null)
            await loadUserCfs(service)
          }}
        />
      )}

      {/* Delete confirm */}
      {confirmDeleteId != null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 24, maxWidth: 380, width: '90%' }}>
            <p style={{ fontSize: 14, marginBottom: 16 }}>User CF "{userCfs.find(c => c.trash_id === confirmDeleteId)?.name}" wirklich löschen?</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmDeleteId(null)} className="btn btn-ghost">Abbrechen</button>
              <button
                onClick={async () => {
                  const { api } = await import('../api')
                  await api.recyclarr.deleteUserCf(service, confirmDeleteId)
                  setConfirmDeleteId(null)
                  await loadUserCfs(service)
                }}
                style={{ padding: '6px 14px', borderRadius: 'var(--radius-md)', background: 'rgba(248,113,113,0.15)', color: '#f87171', border: '1px solid rgba(248,113,113,0.3)', cursor: 'pointer', fontSize: 13 }}
              >
                Löschen
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
      {activeTab === 'recyclarr' && <RecyclarrTab />}
      {activeTab === 'cf-manager' && <CfManagerTab />}
    </div>
  )
}
