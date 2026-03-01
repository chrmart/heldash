import { useState } from 'react'
import { useStore } from '../store/useStore'
import { useDashboardStore } from '../store/useDashboardStore'
import { ServiceCard } from '../components/ServiceCard'
import type { Service, DashboardItem, DashboardServiceItem, DashboardArrItem, DashboardPlaceholderItem } from '../types'
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
import { GripVertical, X, Plus, Pencil, ExternalLink } from 'lucide-react'

// Accent colors for arr instance type badges
const TYPE_COLORS: Record<string, string> = {
  radarr: '#f59e0b',
  sonarr: '#6366f1',
  prowlarr: '#8b5cf6',
  sabnzbd: '#22c55e',
}

// ── Shared drag/remove overlay ────────────────────────────────────────────────
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

// ── Service card wrapper ──────────────────────────────────────────────────────
function DashboardServiceCard({ item, onEdit, editMode }: {
  item: DashboardServiceItem
  onEdit: (s: Service) => void
  editMode: boolean
}) {
  const { removeItem } = useDashboardStore()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: !editMode,
  })
  const [showHandle, setShowHandle] = useState(false)

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1, position: 'relative' }}
      onMouseEnter={() => setShowHandle(true)}
      onMouseLeave={() => setShowHandle(false)}
    >
      <ServiceCard service={item.service} onEdit={onEdit} hideAdminActions={editMode} />
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

// ── Arr instance card ─────────────────────────────────────────────────────────
function DashboardArrCard({ item, editMode }: {
  item: DashboardArrItem
  editMode: boolean
}) {
  const { removeItem } = useDashboardStore()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: !editMode,
  })
  const [showHandle, setShowHandle] = useState(false)
  const color = TYPE_COLORS[item.instance.type] ?? 'var(--accent)'

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1, position: 'relative' }}
      onMouseEnter={() => setShowHandle(true)}
      onMouseLeave={() => setShowHandle(false)}
    >
      <a
        href={item.instance.url}
        target="_blank"
        rel="noopener noreferrer"
        className="service-card glass"
      >
        <div className="service-card-header">
          <span style={{
            display: 'inline-block',
            padding: '2px 7px',
            borderRadius: 4,
            background: `${color}22`,
            color,
            fontSize: 10,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}>
            {item.instance.type}
          </span>
          <ExternalLink size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        </div>
        <div>
          <div className="service-name">{item.instance.name}</div>
          <div className="service-url">{item.instance.url.replace(/^https?:\/\//, '')}</div>
        </div>
      </a>
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

// ── Placeholder card ──────────────────────────────────────────────────────────
function DashboardPlaceholderCard({ item }: { item: DashboardPlaceholderItem }) {
  const { removeItem } = useDashboardStore()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  const [showHandle, setShowHandle] = useState(false)

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1, position: 'relative' }}
      onMouseEnter={() => setShowHandle(true)}
      onMouseLeave={() => setShowHandle(false)}
    >
      <div
        className="service-card"
        style={{
          border: '1.5px dashed var(--glass-border)',
          background: 'transparent',
          backdropFilter: 'none',
          boxShadow: 'none',
          cursor: 'default',
          opacity: 0.45,
          minHeight: 80,
        }}
      />
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
  const { items, editMode, loading, setEditMode, addPlaceholder, reorder } = useDashboardStore()

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  // In display mode: hide placeholders
  const visibleItems = editMode ? items : items.filter(i => i.type !== 'placeholder')

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

  return (
    <div>
      {/* Edit mode toolbar (admin only) */}
      {isAdmin && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <button
            className={editMode ? 'btn btn-primary' : 'btn btn-ghost'}
            style={{ gap: 6, fontSize: 12 }}
            onClick={() => setEditMode(!editMode)}
          >
            <Pencil size={13} />
            {editMode ? 'Done' : 'Edit Dashboard'}
          </button>
          {editMode && (
            <button
              className="btn btn-ghost"
              style={{ gap: 6, fontSize: 12 }}
              onClick={addPlaceholder}
            >
              <Plus size={13} />
              Add Placeholder
            </button>
          )}
        </div>
      )}

      {visibleItems.length === 0 && !loading && (
        <div className="empty-state">
          <div className="empty-state-icon">⬡</div>
          <div className="empty-state-text">
            {isAdmin
              ? 'Dashboard is empty.\nEnable "Show on Dashboard" in app or instance settings.'
              : 'No items on the dashboard yet.'}
          </div>
        </div>
      )}

      {/* Sortable flat grid */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={visibleItems.map(i => i.id)} strategy={rectSortingStrategy}>
          <div className="services-grid">
            {visibleItems.map(item => {
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
              if (item.type === 'placeholder') {
                return <DashboardPlaceholderCard key={item.id} item={item as DashboardPlaceholderItem} />
              }
              return null
            })}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  )
}
