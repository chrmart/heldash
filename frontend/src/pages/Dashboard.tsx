import { useState } from 'react'
import { useStore } from '../store/useStore'
import { ServiceCard } from '../components/ServiceCard'
import type { Service, Group } from '../types'
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
  verticalListSortingStrategy,
  rectSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'

interface Props {
  onEdit: (service: Service) => void
}

// ── Sortable Service Card ────────────────────────────────────────────────────
function SortableServiceCard({ service, onEdit }: { service: Service; onEdit: (s: Service) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: service.id })
  const [showHandle, setShowHandle] = useState(false)

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        position: 'relative',
      }}
      onMouseEnter={() => setShowHandle(true)}
      onMouseLeave={() => setShowHandle(false)}
    >
      <ServiceCard service={service} onEdit={onEdit} />
      {/* Drag handle — positioned inside the wrapper, not clipped by ServiceCard's overflow:hidden */}
      <div
        {...attributes}
        {...listeners}
        style={{
          position: 'absolute',
          left: 6,
          bottom: 6,
          opacity: showHandle && !isDragging ? 0.5 : 0,
          transition: 'opacity 150ms ease',
          cursor: isDragging ? 'grabbing' : 'grab',
          color: 'var(--text-muted)',
          zIndex: 10,
          width: 18,
          height: 18,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 4,
        }}
      >
        <GripVertical size={11} />
      </div>
    </div>
  )
}

// ── Sortable Group Section ───────────────────────────────────────────────────
function SortableGroupSection({
  group,
  services,
  onEdit,
  onReorder,
}: {
  group: Group
  services: Service[]
  onEdit: (s: Service) => void
  onReorder: (groupId: string | null, orderedIds: string[]) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: group.id })
  const [showHandle, setShowHandle] = useState(false)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const handleServiceDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = services.findIndex(s => s.id === active.id)
    const newIndex = services.findIndex(s => s.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const newOrder = arrayMove(services, oldIndex, newIndex)
    onReorder(group.id, newOrder.map(s => s.id))
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        marginBottom: 32,
      }}
      onMouseEnter={() => setShowHandle(true)}
      onMouseLeave={() => setShowHandle(false)}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <div
          {...attributes}
          {...listeners}
          style={{
            cursor: isDragging ? 'grabbing' : 'grab',
            opacity: showHandle ? 0.5 : 0,
            transition: 'opacity 150ms ease',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            flexShrink: 0,
          }}
        >
          <GripVertical size={14} />
        </div>
        {group.icon && <span>{group.icon}</span>}
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
          {group.name}
        </span>
        <div className="accent-strip" style={{ flex: 1 }} />
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleServiceDragEnd}>
        <SortableContext items={services.map(s => s.id)} strategy={rectSortingStrategy}>
          <div className="services-grid">
            {services.map(s => (
              <SortableServiceCard key={s.id} service={s} onEdit={onEdit} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  )
}

// ── Dashboard ────────────────────────────────────────────────────────────────
export function Dashboard({ onEdit }: Props) {
  const { services, groups, reorderGroups, reorderServices } = useStore()
  const [filter, setFilter] = useState('')

  const filtered = services.filter(s =>
    s.name.toLowerCase().includes(filter.toLowerCase()) ||
    s.description?.toLowerCase().includes(filter.toLowerCase())
  )

  const sortedGroups = [...groups].sort((a, b) => a.position - b.position)
  const grouped = sortedGroups.map(g => ({
    group: g,
    services: filtered.filter(s => s.group_id === g.id).sort((a, b) => a.position_x - b.position_x),
  })).filter(g => g.services.length > 0)

  const ungrouped = filtered.filter(s => !s.group_id).sort((a, b) => a.position_x - b.position_x)

  const groupSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
  const ungroupedSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const handleGroupDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const groupIds = sortedGroups.map(g => g.id)
    const oldIndex = groupIds.indexOf(active.id as string)
    const newIndex = groupIds.indexOf(over.id as string)
    if (oldIndex === -1 || newIndex === -1) return
    reorderGroups(arrayMove(groupIds, oldIndex, newIndex))
  }

  const handleUngroupedDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = ungrouped.findIndex(s => s.id === active.id)
    const newIndex = ungrouped.findIndex(s => s.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const newOrder = arrayMove(ungrouped, oldIndex, newIndex)
    reorderServices(null, newOrder.map(s => s.id))
  }

  if (services.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">⬡</div>
        <div className="empty-state-text">No services yet.<br />Add your first service with the button above.</div>
      </div>
    )
  }

  return (
    <div>
      {/* Search */}
      {services.length > 4 && (
        <input
          className="form-input"
          placeholder="Search services..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
          style={{ marginBottom: 24, maxWidth: 320 }}
        />
      )}

      {/* Grouped sections with sortable groups */}
      {grouped.length > 0 && (
        <DndContext sensors={groupSensors} collisionDetection={closestCenter} onDragEnd={handleGroupDragEnd}>
          <SortableContext items={grouped.map(g => g.group.id)} strategy={verticalListSortingStrategy}>
            {grouped.map(({ group, services: gs }) => (
              <SortableGroupSection
                key={group.id}
                group={group}
                services={gs}
                onEdit={onEdit}
                onReorder={reorderServices}
              />
            ))}
          </SortableContext>
        </DndContext>
      )}

      {/* Ungrouped services */}
      {ungrouped.length > 0 && (
        <div>
          {grouped.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                Other
              </span>
              <div className="accent-strip" style={{ flex: 1 }} />
            </div>
          )}
          <DndContext sensors={ungroupedSensors} collisionDetection={closestCenter} onDragEnd={handleUngroupedDragEnd}>
            <SortableContext items={ungrouped.map(s => s.id)} strategy={rectSortingStrategy}>
              <div className="services-grid">
                {ungrouped.map(s => (
                  <SortableServiceCard key={s.id} service={s} onEdit={onEdit} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      )}
    </div>
  )
}
