import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore'
import { useArrStore } from '../store/useArrStore'
import { useDashboardStore } from '../store/useDashboardStore'
import { useWidgetStore } from '../store/useWidgetStore'
import { ServiceCard } from '../components/ServiceCard'
import { ArrCardContent, SabnzbdCardContent } from '../components/MediaCard'
import { AdGuardStatsView, DockerOverviewContent } from './WidgetsPage'
import type { Service, DashboardItem, DashboardServiceItem, DashboardArrItem, DashboardPlaceholderItem, DashboardWidgetItem, ServerStats, AdGuardStats, AdGuardHomeConfig } from '../types'
import { normalizeUrl } from '../utils'

function DashboardWidgetIcon({ widget }: { widget: DashboardWidgetItem['widget'] }) {
  const { services } = useStore()

  if (widget.type === 'docker_overview') {
    return <Container size={20} style={{ color: 'var(--accent)', flexShrink: 0 }} />
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

  if (iconUrl) return <img src={iconUrl} alt="" style={{ width: 24, height: 24, objectFit: 'contain', borderRadius: 4, flexShrink: 0 }} />
  if (iconEmoji) return <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>{iconEmoji}</span>
  return null
}
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, X, Container } from 'lucide-react'

// ── Shared edit-mode overlay (drag handle + remove button) ────────────────────
function EditOverlay({
  dragProps,
  showHandle,
  isDragging,
  onRemove,
}: {
  dragProps: object
  showHandle: boolean
  isDragging: boolean
  onRemove: () => void
}) {
  return (
    <>
      <div
        {...dragProps}
        style={{
          position: 'absolute', left: 6, top: 6,
          opacity: showHandle && !isDragging ? 0.8 : 0,
          transition: 'opacity 150ms ease',
          cursor: isDragging ? 'grabbing' : 'grab',
          color: 'var(--text-muted)',
          zIndex: 10,
          width: 20, height: 20,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 4,
          background: 'var(--glass-bg)',
          backdropFilter: 'blur(8px)',
        }}
      >
        <GripVertical size={12} />
      </div>
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove() }}
        title="Remove from dashboard"
        style={{
          position: 'absolute', right: 6, top: 6,
          opacity: showHandle ? 0.8 : 0,
          transition: 'opacity 150ms ease',
          cursor: 'pointer',
          color: 'var(--text-muted)',
          zIndex: 10,
          width: 20, height: 20,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 4,
          background: 'var(--glass-bg)',
          backdropFilter: 'blur(8px)',
          border: 'none',
          padding: 0,
        }}
      >
        <X size={11} />
      </button>
    </>
  )
}

// ── Service card ──────────────────────────────────────────────────────────────
function DashboardServiceCard({ item, onEdit, editMode }: {
  item: DashboardServiceItem
  onEdit: (s: Service) => void
  editMode: boolean
}) {
  const { removeItem } = useDashboardStore()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id, disabled: !editMode,
  })
  const [showHandle, setShowHandle] = useState(false)

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1, position: 'relative' }}
      onMouseEnter={() => setShowHandle(true)}
      onMouseLeave={() => setShowHandle(false)}
    >
      <ServiceCard service={item.service} onEdit={onEdit} hideAdminActions={true} />
      {editMode && (
        <EditOverlay
          dragProps={{ ...attributes, ...listeners }}
          showHandle={showHandle}
          isDragging={isDragging}
          onRemove={() => removeItem(item.id)}
        />
      )}
    </div>
  )
}

// ── Arr instance card (full media-style) ──────────────────────────────────────
function DashboardArrCard({ item, editMode }: {
  item: DashboardArrItem
  editMode: boolean
}) {
  const { removeItem } = useDashboardStore()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id, disabled: !editMode,
  })
  const [showHandle, setShowHandle] = useState(false)

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        position: 'relative',
        gridColumn: 'span 2',
      }}
      onMouseEnter={() => setShowHandle(true)}
      onMouseLeave={() => setShowHandle(false)}
    >
      <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {item.instance.type === 'sabnzbd'
          ? <SabnzbdCardContent instance={item.instance} />
          : <ArrCardContent instance={item.instance} />
        }
      </div>
      {editMode && (
        <EditOverlay
          dragProps={{ ...attributes, ...listeners }}
          showHandle={showHandle}
          isDragging={isDragging}
          onRemove={() => removeItem(item.id)}
        />
      )}
    </div>
  )
}

// ── Widget card ───────────────────────────────────────────────────────────────
function DashboardWidgetCard({ item, editMode }: {
  item: DashboardWidgetItem
  editMode: boolean
}) {
  const { isAdmin } = useStore()
  const { removeItem } = useDashboardStore()
  const { stats, loadStats, setAdGuardProtection } = useWidgetStore()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id, disabled: !editMode,
  })
  const [showHandle, setShowHandle] = useState(false)
  const [toggling, setToggling] = useState(false)
  const s = stats[item.widget.id]

  useEffect(() => {
    if (item.widget.type === 'docker_overview') return  // DockerOverviewContent handles its own loading
    loadStats(item.widget.id).catch(() => {})
    const interval = setInterval(() => loadStats(item.widget.id).catch(() => {}), 30_000)
    return () => clearInterval(interval)
  }, [item.widget.id])

  const handleProtectionToggle = async () => {
    if (!isAdmin || item.widget.type !== 'adguard_home' || !s) return
    const ag = s as AdGuardStats
    setToggling(true)
    try {
      await setAdGuardProtection(item.widget.id, !ag.protection_enabled)
    } finally {
      setToggling(false)
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        position: 'relative',
        gridColumn: 'span 2',
      }}
      onMouseEnter={() => setShowHandle(true)}
      onMouseLeave={() => setShowHandle(false)}
    >
      <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <DashboardWidgetIcon widget={item.widget} />
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{item.widget.name}</div>
        </div>

        {item.widget.type === 'docker_overview' ? (
          <DockerOverviewContent isAdmin={isAdmin} />
        ) : item.widget.type === 'adguard_home' ? (
          s ? (
            <AdGuardStatsView
              stats={s as AdGuardStats}
              isAdmin={isAdmin}
              toggling={toggling}
              onToggle={handleProtectionToggle}
            />
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading…</div>
          )
        ) : (
          // server_status
          s ? (
            (() => {
              const ss = s as ServerStats
              const ramUsedGb = (ss.ram.used / 1024).toFixed(1)
              const ramTotalGb = (ss.ram.total / 1024).toFixed(1)
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <DashStatBar label="CPU" value={ss.cpu.load >= 0 ? ss.cpu.load : null} extra={ss.cpu.load >= 0 ? `${ss.cpu.load}%` : '—'} />
                  <DashStatBar label="RAM" value={ss.ram.total > 0 ? Math.round((ss.ram.used / ss.ram.total) * 100) : null} extra={ss.ram.total > 0 ? `${ramUsedGb}/${ramTotalGb} GB` : '—'} />
                  {ss.disks.map(d => (
                    <DashStatBar key={d.path} label={d.name} value={d.total > 0 ? Math.round((d.used / d.total) * 100) : null} extra={d.total > 0 ? `${Math.round(d.used / 1024)}/${Math.round(d.total / 1024)} GB` : '—'} />
                  ))}
                </div>
              )
            })()
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading…</div>
          )
        )}
      </div>
      {editMode && (
        <EditOverlay
          dragProps={{ ...attributes, ...listeners }}
          showHandle={showHandle}
          isDragging={isDragging}
          onRemove={() => removeItem(item.id)}
        />
      )}
    </div>
  )
}

function DashStatBar({ label, value, extra }: { label: string; value: number | null; extra: string }) {
  const pct = value ?? 0
  const color = pct >= 90 ? 'var(--status-offline)' : pct >= 70 ? '#f59e0b' : 'var(--accent)'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
        <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
        <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{extra}</span>
      </div>
      <div style={{ height: 3, borderRadius: 2, background: 'var(--glass-border)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: color, borderRadius: 2, transition: 'width 0.4s ease' }} />
      </div>
    </div>
  )
}

// ── Placeholder card ──────────────────────────────────────────────────────────
function DashboardPlaceholderCard({ item, editMode }: { item: DashboardPlaceholderItem; editMode: boolean }) {
  const { removeItem } = useDashboardStore()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id, disabled: !editMode,
  })
  const [showHandle, setShowHandle] = useState(false)

  const isInstance = item.type === 'placeholder_instance'
  const isRow = item.type === 'placeholder_row'
  const gridColumn = isRow ? '1 / -1' : isInstance ? 'span 2' : undefined
  const minHeight = isRow ? 28 : isInstance ? 100 : 80

  // Outside edit mode: invisible spacer that still occupies grid space to preserve layout
  if (!editMode) {
    return (
      <div
        ref={setNodeRef}
        style={{ gridColumn, minHeight, visibility: 'hidden', pointerEvents: 'none' }}
      />
    )
  }

  const label = isRow ? 'Row' : isInstance ? 'Instance' : 'App'

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.3 : 1,
        position: 'relative',
        gridColumn,
      }}
      onMouseEnter={() => setShowHandle(true)}
      onMouseLeave={() => setShowHandle(false)}
    >
      <div
        style={{
          border: '1.5px dashed var(--accent)',
          borderRadius: isRow ? 'var(--radius-sm)' : isInstance ? 'var(--radius-xl)' : 'var(--radius-lg)',
          background: 'var(--accent-subtle)',
          minHeight,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1, color: 'var(--accent)', textTransform: 'uppercase', opacity: 0.7 }}>
          {label}
        </span>
      </div>
      <EditOverlay
        dragProps={{ ...attributes, ...listeners }}
        showHandle={showHandle}
        isDragging={isDragging}
        onRemove={() => removeItem(item.id)}
      />
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
interface Props {
  onEdit: (service: Service) => void
}

export function Dashboard({ onEdit }: Props) {
  const { isAdmin } = useStore()
  const { instances, loadInstances, loadAllStats } = useArrStore()
  const { items, editMode, guestMode, loading, reorder } = useDashboardStore()

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const arrItemCount = items.filter(i => i.type === 'arr_instance').length

  // Load arr stats when dashboard has arr instances
  useEffect(() => {
    if (arrItemCount === 0) return
    if (instances.length === 0) {
      loadInstances().then(() => loadAllStats()).catch(() => {})
    } else {
      loadAllStats().catch(() => {})
    }
  }, [arrItemCount])

  const isPlaceholder = (type: string) =>
    type === 'placeholder' || type === 'placeholder_app' || type === 'placeholder_instance' || type === 'placeholder_row'

  // Placeholders always stay in the DOM to preserve grid layout.
  // Outside edit mode they render as invisible spacers (visibility:hidden).
  const realItems = items.filter(i => !isPlaceholder(i.type))

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const ids = items.map(i => i.id)
    const oldIndex = ids.indexOf(active.id as string)
    const newIndex = ids.indexOf(over.id as string)
    if (oldIndex === -1 || newIndex === -1) return
    reorder(arrayMove(ids, oldIndex, newIndex))
  }

  if (loading && items.length === 0) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
        <div className="spinner" style={{ width: 24, height: 24, borderWidth: 2 }} />
      </div>
    )
  }

  if (!loading && realItems.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">⬡</div>
        <div className="empty-state-text">
          {guestMode
            ? 'Guest dashboard is empty.\nUse edit mode to set up the guest view.'
            : 'Dashboard is empty.\nEnable "Show on Dashboard" in app or instance settings, or use edit mode to add items.'}
        </div>
      </div>
    )
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map(i => i.id)} strategy={rectSortingStrategy}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div
            className="services-grid"
            style={{ gridAutoFlow: 'dense' }}
          >
            {items.map(item => {
              if (item.type === 'service') {
                return (
                  <DashboardServiceCard
                    key={item.id}
                    item={item as DashboardServiceItem}
                    onEdit={onEdit}
                    editMode={editMode}
                  />
                )
              }
              if (item.type === 'arr_instance') {
                return (
                  <DashboardArrCard
                    key={item.id}
                    item={item as DashboardArrItem}
                    editMode={editMode}
                  />
                )
              }
              if (item.type === 'widget') {
                return (
                  <DashboardWidgetCard
                    key={item.id}
                    item={item as DashboardWidgetItem}
                    editMode={editMode}
                  />
                )
              }
              if (isPlaceholder(item.type)) {
                return <DashboardPlaceholderCard key={item.id} item={item as DashboardPlaceholderItem} editMode={editMode} />
              }
              return null
            })}
          </div>
        </div>
      </SortableContext>
    </DndContext>
  )
}
