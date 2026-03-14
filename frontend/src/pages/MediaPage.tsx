import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store/useStore'
import { useArrStore } from '../store/useArrStore'
import { useDashboardStore } from '../store/useDashboardStore'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { SortableContext, rectSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Pencil, Trash2, Check, X, RefreshCw, GripVertical, LayoutGrid, CalendarDays, Search, Compass, Database, AlertTriangle } from 'lucide-react'
import type { ArrInstance, ArrCalendarItem, RadarrCalendarItem, SonarrCalendarItem, ProwlarrStats } from '../types/arr'
import type { SeerrSearchResult, SeerrTvDetail, DiscoverFilters, DiscoverServerFilters } from '../types/seerr'
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

// ── Discover tab (Seerr) ───────────────────────────────────────────────────────

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

const DEFAULT_FILTERS: DiscoverFilters = {
  mediaType: 'all',
  language: '',
  genreIds: [],
  watchProviderIds: [],
  voteAverageGte: 0,
  releaseYearFrom: '',
  releaseYearTo: '',
  sortBy: 'popularity.desc',
}

function getSeasonStatus(seasonNumber: number, tvDetail: SeerrTvDetail): number {
  return tvDetail.mediaInfo?.seasons?.find(s => s.seasonNumber === seasonNumber)?.status ?? 0
}

function DiscoverTab() {
  const {
    instances, discoverMovies, discoverTv, discoverTrending, discoverSearch,
    seerrRequests, genres, watchProviders, tvDetails,
    loadDiscoverMovies, loadDiscoverTv, loadDiscoverTrending, loadDiscoverSearch,
    loadGenres, loadWatchProviders, loadTvDetail,
    discoverRequest, loadSeerrRequests,
  } = useArrStore()

  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<'trending' | 'movies' | 'tv' | 'search'>('trending')
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [filters, setFilters] = useState<DiscoverFilters>({ ...DEFAULT_FILTERS })
  const [requesting, setRequesting] = useState<string | null>(null)
  const [confirmRequest, setConfirmRequest] = useState<{ item: SeerrSearchResult; mediaType: 'movie' | 'tv'; mediaId: number } | null>(null)
  const [selectedSeasons, setSelectedSeasons] = useState<number[]>([])
  const [tvDetailLoading, setTvDetailLoading] = useState(false)
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const seerrInstances = instances.filter(i => i.type === 'seerr' && i.enabled)
  const selected = seerrInstances[0]

  // Serialize filters to a stable string for use in effect deps
  const filtersJson = JSON.stringify(filters)

  // Build server filters from the current filters state
  const buildServerFilters = (f: DiscoverFilters): DiscoverServerFilters => ({
    language: f.language || undefined,
    genreIds: f.genreIds.length > 0 ? f.genreIds : undefined,
    watchProviderIds: f.watchProviderIds.length > 0 ? f.watchProviderIds : undefined,
    voteAverageGte: f.voteAverageGte > 0 ? f.voteAverageGte : undefined,
    releaseYearFrom: f.releaseYearFrom || undefined,
    releaseYearTo: f.releaseYearTo || undefined,
  })

  // Track whether initial load for the current selected instance has completed
  const hasMounted = useRef(false)

  // Initial load: trending + both discover tabs + requests + genres + providers
  useEffect(() => {
    if (!selected) return
    hasMounted.current = false
    setPage(1)
    const sf = buildServerFilters(DEFAULT_FILTERS)
    const load = async () => {
      setLoading(true)
      await Promise.all([
        loadDiscoverTrending(selected.id),
        loadDiscoverMovies(selected.id, 1, DEFAULT_FILTERS.sortBy, sf),
        loadDiscoverTv(selected.id, 1, DEFAULT_FILTERS.sortBy, sf),
        loadSeerrRequests(selected.id, 'all'),
        loadGenres(selected.id),
        loadWatchProviders(selected.id),
      ])
      setLoading(false)
      hasMounted.current = true
    }
    load()
  }, [selected?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reload movies/tv when filters change (skip on initial mount — covered above)
  useEffect(() => {
    if (!hasMounted.current || !selected) return
    if (tab !== 'movies' && tab !== 'tv') return
    setPage(1)
    const sf = buildServerFilters(filters)
    const load = async () => {
      setLoading(true)
      if (tab === 'movies') await loadDiscoverMovies(selected.id, 1, filters.sortBy, sf)
      else await loadDiscoverTv(selected.id, 1, filters.sortBy, sf)
      setLoading(false)
    }
    load()
  }, [filtersJson]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reload when tab switches to movies/tv (picks up any filter changes made on other tabs)
  useEffect(() => {
    if (!hasMounted.current || !selected) return
    if (tab !== 'movies' && tab !== 'tv') return
    setPage(1)
    const sf = buildServerFilters(filters)
    const load = async () => {
      setLoading(true)
      if (tab === 'movies') await loadDiscoverMovies(selected.id, 1, filters.sortBy, sf)
      else await loadDiscoverTv(selected.id, 1, filters.sortBy, sf)
      setLoading(false)
    }
    load()
  }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

  // Search debounce (also re-fires when language filter changes)
  useEffect(() => {
    if (tab !== 'search' || !selected || !searchQuery.trim()) return
    const timer = setTimeout(async () => {
      setPage(1)
      setLoading(true)
      await loadDiscoverSearch(selected.id, searchQuery, filters.language || undefined)
      setLoading(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [tab, searchQuery, selected?.id, filters.language]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-dismiss notification
  useEffect(() => {
    if (!notification) return
    const timer = setTimeout(() => setNotification(null), 4000)
    return () => clearTimeout(timer)
  }, [notification])

  // Initialize selectedSeasons when TV detail loads in the modal
  useEffect(() => {
    if (!confirmRequest || confirmRequest.mediaType !== 'tv') return
    const tvDetail = tvDetails[`${selected.id}:${confirmRequest.mediaId}`]
    if (!tvDetail) return
    const realSeasons = tvDetail.seasons.filter(s => s.seasonNumber > 0)
    const preSelected = realSeasons
      .filter(s => {
        const status = getSeasonStatus(s.seasonNumber, tvDetail)
        return status !== 5 && status !== 2 && status !== 3
      })
      .map(s => s.seasonNumber)
    setSelectedSeasons(preSelected)
  }, [confirmRequest?.mediaId, tvDetails]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!selected) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No Seerr instances configured.</p>
      </div>
    )
  }

  // Resolve raw results for the active tab
  const rawResults: SeerrSearchResult[] = tab === 'search'
    ? (discoverSearch[selected.id]?.results ?? [])
    : tab === 'trending'
    ? (discoverTrending[selected.id]?.results ?? [])
    : tab === 'movies'
    ? (discoverMovies[selected.id]?.results ?? [])
    : (discoverTv[selected.id]?.results ?? [])

  // Total pages for Load More
  const totalPages = tab === 'movies'
    ? (discoverMovies[selected.id]?.pageInfo?.pages ?? 1)
    : tab === 'tv'
    ? (discoverTv[selected.id]?.pageInfo?.pages ?? 1)
    : tab === 'search'
    ? (discoverSearch[selected.id]?.pageInfo?.pages ?? 1)
    : 1

  // Client-side filtering (mediaType, rating, genre) for trending/search; sort for all client-side tabs
  const allResults: SeerrSearchResult[] = (() => {
    let results = [...rawResults]

    if ((tab === 'trending' || tab === 'search')) {
      if (filters.mediaType !== 'all') {
        results = results.filter(r => r.mediaType === filters.mediaType)
      }
      if (filters.voteAverageGte > 0) {
        results = results.filter(r => (r.voteAverage ?? 0) >= filters.voteAverageGte)
      }
      if (filters.genreIds.length > 0) {
        results = results.filter(r => r.genreIds?.some(g => filters.genreIds.includes(g)))
      }
      // Client-side sort for trending/search
      switch (filters.sortBy) {
        case 'vote_average.desc':
          results.sort((a, b) => (b.voteAverage ?? 0) - (a.voteAverage ?? 0))
          break
        case 'release_date.desc':
          results.sort((a, b) =>
            (b.releaseDate ?? b.firstAirDate ?? '').localeCompare(a.releaseDate ?? a.firstAirDate ?? '')
          )
          break
        case 'original_title.asc':
          results.sort((a, b) =>
            (a.originalTitle ?? a.title ?? a.name ?? '').localeCompare(b.originalTitle ?? b.title ?? b.name ?? '')
          )
          break
      }
    }
    return results
  })()

  // Determine per-item media status
  const getItemStatus = (item: SeerrSearchResult): 'available' | 'partial' | 'processing' | 'pending' | null => {
    const s = item.mediaInfo?.status
    if (s === 5) return 'available'
    if (s === 4) return 'partial'
    if (s === 3) return 'processing'
    if (s === 2) return 'pending'
    const requests = seerrRequests[selected.id]?.results ?? []
    if (requests.some(r => r.media.mediaType === item.mediaType && r.media.tmdbId === item.id)) return 'pending'
    return null
  }

  // Which genres to show in filter panel
  const genreList = tab === 'tv'
    ? (genres[selected.id]?.tv ?? [])
    : (genres[selected.id]?.movie ?? [])

  const providerList = tab === 'tv'
    ? (watchProviders[selected.id]?.tv ?? [])
    : (watchProviders[selected.id]?.movie ?? [])

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
    const sf = buildServerFilters(filters)
    setLoading(true)
    if (tab === 'movies') {
      await loadDiscoverMovies(selected.id, nextPage, filters.sortBy, sf, true)
    } else if (tab === 'tv') {
      await loadDiscoverTv(selected.id, nextPage, filters.sortBy, sf, true)
    } else if (tab === 'search' && searchQuery.trim()) {
      await loadDiscoverSearch(selected.id, searchQuery, filters.language || undefined, nextPage, true)
    }
    setLoading(false)
  }

  const openRequestModal = async (item: SeerrSearchResult) => {
    setConfirmRequest({ item, mediaType: item.mediaType, mediaId: item.id })
    setSelectedSeasons([])
    if (item.mediaType === 'tv') {
      // Fetch TV detail if not cached
      if (!tvDetails[`${selected.id}:${item.id}`]) {
        setTvDetailLoading(true)
        await loadTvDetail(selected.id, item.id)
        setTvDetailLoading(false)
      }
      // selectedSeasons will be initialized by the effect above when tvDetails updates
    }
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
            onChange={e => { setSearchInput(e.target.value); setSearchQuery(e.target.value) }}
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
          const posterUrl = item.posterPath ? `https://image.tmdb.org/t/p/w300${item.posterPath}` : null
          const title = item.title ?? item.name ?? 'Unknown'
          const year = item.releaseDate?.slice(0, 4) ?? item.firstAirDate?.slice(0, 4) ?? ''
          const rating = item.voteAverage ? Math.round(item.voteAverage * 10) / 10 : null
          const overview = item.overview ? item.overview.slice(0, 100) + (item.overview.length > 100 ? '...' : '') : ''
          const itemStatus = getItemStatus(item)
          const canRequest = itemStatus === null || itemStatus === 'partial'

          const btnLabel = requesting === `${item.mediaType}-${item.id}`
            ? 'Requesting…'
            : itemStatus === 'available' ? '✓ Available'
            : itemStatus === 'processing' ? '⟳ Processing'
            : itemStatus === 'pending' ? '⏳ Requested'
            : itemStatus === 'partial' ? '◐ Request missing'
            : '+ Request'

          return (
            <div
              key={`${item.mediaType}-${item.id}`}
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
                {!posterUrl && <span style={{ fontSize: 32 }}>{item.mediaType === 'movie' ? '🎬' : '📺'}</span>}

                {/* Media type badge */}
                <div style={{
                  position: 'absolute', top: 8, left: 8,
                  background: 'rgba(0,0,0,0.7)', color: 'var(--accent)',
                  padding: '3px 7px', borderRadius: 'var(--radius-sm)',
                  fontSize: 10, fontWeight: 600, textTransform: 'uppercase', backdropFilter: 'blur(8px)',
                }}>
                  {item.mediaType === 'movie' ? 'Movie' : 'TV'}
                </div>

                {/* Rating badge */}
                {rating !== null && (
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
                    background: itemStatus === 'available'
                      ? 'rgba(34,197,94,0.9)'
                      : itemStatus === 'partial'
                      ? 'rgba(234,179,8,0.9)'
                      : itemStatus === 'processing'
                      ? 'rgba(59,130,246,0.9)'
                      : 'rgba(234,179,8,0.9)',
                    color: '#fff', padding: '3px 7px', borderRadius: 'var(--radius-sm)',
                    fontSize: 10, fontWeight: 600, textTransform: 'uppercase', backdropFilter: 'blur(8px)',
                  }}>
                    {itemStatus === 'available' ? '✓ Available'
                      : itemStatus === 'partial' ? '◐ Partial'
                      : itemStatus === 'processing' ? '⟳ Processing'
                      : '⏳ Requested'}
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

                <button
                  onClick={e => {
                    e.stopPropagation()
                    if (!canRequest) return
                    openRequestModal(item)
                  }}
                  disabled={!canRequest || requesting === `${item.mediaType}-${item.id}`}
                  className={canRequest ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
                  style={{ fontSize: 12, padding: '6px 12px', marginTop: 'auto', opacity: canRequest ? 1 : 0.6 }}
                >
                  {btnLabel}
                </button>
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
              {confirmRequest.item.posterPath && (
                <img
                  src={`https://image.tmdb.org/t/p/w92${confirmRequest.item.posterPath}`}
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
                  {(confirmRequest.item.releaseDate ?? confirmRequest.item.firstAirDate) &&
                    ` · ${(confirmRequest.item.releaseDate ?? confirmRequest.item.firstAirDate ?? '').slice(0, 4)}`}
                </p>
              </div>
            </div>

            {/* Season selection for TV */}
            {confirmRequest.mediaType === 'tv' && (() => {
              const tvDetail = tvDetails[`${selected.id}:${confirmRequest.mediaId}`]
              if (tvDetailLoading) {
                return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                    <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading seasons…</span>
                  </div>
                )
              }
              if (!tvDetail) {
                return (
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
                    Could not load season list. The request will include all seasons.
                  </p>
                )
              }
              const realSeasons = tvDetail.seasons.filter(s => s.seasonNumber > 0)
              const missingSeasons = realSeasons.filter(s => {
                const status = getSeasonStatus(s.seasonNumber, tvDetail)
                return status !== 5 && status !== 2 && status !== 3
              })
              return (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>Seasons</span>
                    {missingSeasons.length > 0 && (
                      <button
                        onClick={() => setSelectedSeasons(missingSeasons.map(s => s.seasonNumber))}
                        className="btn btn-ghost btn-sm"
                        style={{ fontSize: 11 }}
                      >
                        Select all missing
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {realSeasons.map(s => {
                      const status = getSeasonStatus(s.seasonNumber, tvDetail)
                      const isAvailable = status === 5
                      const isPending = status === 2 || status === 3
                      const isDisabled = isAvailable || isPending
                      const isSelected = selectedSeasons.includes(s.seasonNumber)
                      const statusLabel = isAvailable ? 'Available' : isPending ? 'Pending' : null

                      return (
                        <button
                          key={s.seasonNumber}
                          disabled={isDisabled}
                          onClick={() => {
                            if (isDisabled) return
                            setSelectedSeasons(prev =>
                              prev.includes(s.seasonNumber)
                                ? prev.filter(n => n !== s.seasonNumber)
                                : [...prev, s.seasonNumber]
                            )
                          }}
                          style={{
                            padding: '6px 10px', borderRadius: 'var(--radius-md)', fontSize: 12,
                            background: isDisabled
                              ? 'rgba(var(--text-rgb), 0.05)'
                              : isSelected
                              ? 'rgba(var(--accent-rgb), 0.25)'
                              : 'rgba(var(--text-rgb), 0.1)',
                            color: isDisabled
                              ? 'var(--text-muted)'
                              : isSelected
                              ? 'var(--accent)'
                              : 'var(--text-secondary)',
                            border: isSelected && !isDisabled ? '1px solid var(--accent)' : '1px solid transparent',
                            cursor: isDisabled ? 'default' : 'pointer',
                            opacity: isDisabled ? 0.5 : 1,
                            transition: 'all 150ms ease', fontFamily: 'var(--font-sans)',
                          }}
                        >
                          S{s.seasonNumber}
                          {statusLabel && <span style={{ fontSize: 10, marginLeft: 4, opacity: 0.75 }}>· {statusLabel}</span>}
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
                  const key = `${confirmRequest.mediaType}-${confirmRequest.item.id}`
                  setRequesting(key)
                  try {
                    const seasons = confirmRequest.mediaType === 'tv' && selectedSeasons.length > 0
                      ? selectedSeasons
                      : undefined
                    await discoverRequest(
                      selected.id,
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
                  confirmRequest.mediaType === 'tv' &&
                  !!tvDetails[`${selected.id}:${confirmRequest.mediaId}`] &&
                  selectedSeasons.length === 0
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
  const { isAdmin } = useStore()
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
