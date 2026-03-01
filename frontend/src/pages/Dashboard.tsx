import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore'
import { useArrStore } from '../store/useArrStore'
import { useDashboardStore } from '../store/useDashboardStore'
import { ServiceCard } from '../components/ServiceCard'
import { ArrCardContent, SabnzbdCardContent } from '../components/MediaCard'
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
import { GripVertical, X } from 'lucide-react'

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

// ── Placeholder card ──────────────────────────────────────────────────────────
function DashboardPlaceholderCard({ item }: { item: DashboardPlaceholderItem }) {
  const { removeItem } = useDashboardStore()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  const [showHandle, setShowHandle] = useState(false)

  const isInstance = item.type === 'placeholder_instance'

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        position: 'relative',
        gridColumn: isInstance ? 'span 2' : undefined,
      }}
      onMouseEnter={() => setShowHandle(true)}
      onMouseLeave={() => setShowHandle(false)}
    >
      <div
        style={{
          border: '1.5px dashed var(--glass-border)',
          borderRadius: isInstance ? 'var(--radius-xl)' : 'var(--radius-lg)',
          background: 'transparent',
          opacity: 0.4,
          minHeight: isInstance ? 100 : 80,
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
  const { instances, loadInstances, loadAllStats } = useArrStore()
  const { items, editMode, loading, reorder } = useDashboardStore()

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  // Load arr stats when dashboard has arr instances
  useEffect(() => {
    if (items.some(i => i.type === 'arr_instance')) {
      if (instances.length === 0) {
        loadInstances().then(() => loadAllStats()).catch(() => {})
      } else {
        loadAllStats().catch(() => {})
      }
    }
  }, [items.filter(i => i.type === 'arr_instance').length])

  const isPlaceholder = (type: string) =>
    type === 'placeholder' || type === 'placeholder_app' || type === 'placeholder_instance'

  // In view mode: hide placeholders
  const visibleItems = editMode ? items : items.filter(i => !isPlaceholder(i.type))

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

  if (!loading && visibleItems.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">⬡</div>
        <div className="empty-state-text">
          {isAdmin
            ? 'Dashboard is empty.\nEnable "Show on Dashboard" in app or instance settings.'
            : 'No items on the dashboard yet.'}
        </div>
      </div>
    )
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={visibleItems.map(i => i.id)} strategy={rectSortingStrategy}>
        <div
          className="services-grid"
          style={{ gridAutoFlow: 'dense' }}
        >
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
            if (isPlaceholder(item.type)) {
              return <DashboardPlaceholderCard key={item.id} item={item as DashboardPlaceholderItem} />
            }
            return null
          })}
        </div>
      </SortableContext>
    </DndContext>
  )
}
