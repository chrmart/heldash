import { useState, useEffect, useRef } from 'react'
import type { Service } from '../types'
import { useStore } from '../store/useStore'
import { useDashboardStore } from '../store/useDashboardStore'
import { Pencil, Trash2, Plus, GripVertical, Download, Upload, LayoutDashboard, Shield, ShieldOff } from 'lucide-react'
import { api } from '../api'
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
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface Props {
  onEdit: (service: Service) => void
}

// Sortable group header component
function SortableGroupSection({
  section,
  onEdit,
  editMode,
  isDragging,
  isAdmin,
}: {
  section: { label: string; icon: string | null; services: Service[]; id?: string }
  onEdit: (service: Service) => void
  editMode: boolean
  isDragging: boolean
  isAdmin: boolean
}) {
  const { addService, removeItem, isOnDashboard } = useDashboardStore()
  const { updateService } = useStore()
  const { items: dashboardItems } = useDashboardStore()
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: section.id || section.label,
    disabled: !editMode,
  })

  const handleDelete = (service: Service) => {
    if (confirm(`Delete "${service.name}"?`)) {
      const { deleteService } = useStore()
      deleteService(service.id)
    }
  }

  // Sort services A-Z
  const sortedServices = [...section.services].sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        {editMode && (
          <div
            {...attributes}
            {...listeners}
            style={{
              cursor: 'grab',
              opacity: 0.5,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <GripVertical size={14} />
          </div>
        )}
        {section.icon && <span style={{ fontSize: 16 }}>{section.icon}</span>}
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
          }}
        >
          {section.label}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', opacity: 0.6 }}>({section.services.length})</span>
      </div>
      <div className="glass" style={{ borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '24%' }} />
            <col style={{ width: isAdmin ? '30%' : '35%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '10%' }} />
            {isAdmin && <col style={{ width: '14%' }} />}
          </colgroup>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
              <th style={thStyle}>App</th>
              <th style={thStyle}>URL</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Check</th>
              <th style={thStyle}>Dashboard</th>
              {isAdmin && <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {sortedServices.map((s, i) => (
              <tr
                key={s.id}
                style={{
                  borderBottom: i < sortedServices.length - 1 ? '1px solid var(--glass-border)' : 'none',
                  transition: 'background var(--transition-fast)',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--glass-bg)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <td style={tdStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 20, lineHeight: 1 }}>
                      {s.icon_url ? (
                        <img src={s.icon_url} alt="" style={{ width: 22, height: 22, objectFit: 'contain', borderRadius: 4 }} />
                      ) : (
                        s.icon ?? '🔗'
                      )}
                    </span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{s.name}</div>
                      {s.description && (
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{s.description}</div>
                      )}
                    </div>
                  </div>
                </td>
                <td style={{ ...tdStyle, overflow: 'hidden' }}>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: 12,
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--accent)',
                      opacity: 0.8,
                      textDecoration: 'none',
                      display: 'block',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {s.url}
                  </a>
                </td>
                <td style={tdStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className={`service-status ${s.check_enabled ? (s.last_status ?? 'unknown') : 'unknown'}`} style={{ flexShrink: 0 }} />
                    {s.check_enabled && s.last_status && s.last_status !== 'unknown' && (
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)', textTransform: 'capitalize' }}>
                        {s.last_status}
                      </span>
                    )}
                  </div>
                </td>
                <td style={tdStyle}>
                  <button
                    onClick={async () => {
                      await updateService(s.id, { check_enabled: !s.check_enabled })
                    }}
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '3px 8px',
                      borderRadius: 'var(--radius-sm)',
                      background: s.check_enabled ? 'rgba(34,197,94,0.12)' : 'var(--glass-bg)',
                      color: s.check_enabled ? 'var(--status-online)' : 'var(--text-muted)',
                      border: `1px solid ${s.check_enabled ? 'rgba(34,197,94,0.25)' : 'var(--glass-border)'}`,
                      cursor: 'pointer',
                      transition: 'all var(--transition-fast)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'scale(1.05)'
                      e.currentTarget.style.boxShadow = `0 2px 8px ${s.check_enabled ? 'rgba(16,185,129,0.2)' : 'rgba(0,0,0,0.1)'}`
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'scale(1)'
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                  >
                    {s.check_enabled ? <Shield size={10} /> : <ShieldOff size={10} />}
                    {s.check_enabled ? 'On' : 'Off'}
                  </button>
                </td>
                <td style={tdStyle}>
                  <button
                    onClick={async () => {
                      if (isOnDashboard('service', s.id)) {
                        const dashItem = dashboardItems.find(di => di.type === 'service' && di.ref_id === s.id)
                        if (dashItem) await removeItem(dashItem.id)
                      } else {
                        await addService(s.id)
                      }
                    }}
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '3px 8px',
                      borderRadius: 'var(--radius-sm)',
                      background: isOnDashboard('service', s.id) ? 'rgba(var(--accent-rgb), 0.12)' : 'var(--glass-bg)',
                      color: isOnDashboard('service', s.id) ? 'var(--accent)' : 'var(--text-muted)',
                      border: `1px solid ${isOnDashboard('service', s.id) ? 'rgba(var(--accent-rgb), 0.25)' : 'var(--glass-border)'}`,
                      cursor: 'pointer',
                      transition: 'all var(--transition-fast)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'scale(1.05)'
                      e.currentTarget.style.boxShadow = `0 2px 8px rgba(var(--accent-rgb), 0.2)`
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'scale(1)'
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                  >
                    <LayoutDashboard size={10} />
                    {isOnDashboard('service', s.id) ? 'Yes' : 'No'}
                  </button>
                </td>
                {isAdmin && (
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                      {/* Old Plus button removed - now a toggle in Dashboard column */}
                      <button
                        className="btn btn-ghost btn-icon btn-sm"
                        onClick={() => onEdit(s)}
                        data-tooltip="Edit"
                        style={{ padding: '4px', width: 28, height: 28 }}
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        className="btn btn-danger btn-icon btn-sm"
                        onClick={() => handleDelete(s)}
                        data-tooltip="Delete"
                        style={{ padding: '4px', width: 28, height: 28 }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function ServicesPage({ onEdit }: Props) {
  const { services, groups, isAdmin } = useStore()
  const [editMode, setEditMode] = useState(false)
  const [groupOrder, setGroupOrder] = useState<string[]>([])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      distance: 8,
    })
  )

  const { reorderGroups } = useStore()

  useEffect(() => {
    const sortedGroups = [...groups].sort((a, b) => a.position - b.position)
    const ids = sortedGroups.map(g => g.id)
    const ungroupedId = services.some(s => !s.group_id) ? 'ungrouped' : null
    setGroupOrder([...ids, ...(ungroupedId ? [ungroupedId] : [])])
  }, [groups, services])

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = groupOrder.indexOf(String(active.id))
    const newIndex = groupOrder.indexOf(String(over.id))
    if (oldIndex === -1 || newIndex === -1) return

    const newOrder = arrayMove(groupOrder, oldIndex, newIndex)
    setGroupOrder(newOrder)

    // Persist group ordering
    const orderedGroupIds = newOrder.filter(id => id !== 'ungrouped')
    await reorderGroups(orderedGroupIds)
  }

  if (services.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">⬡</div>
        <div className="empty-state-text">
          No apps yet.
          <br />
          Add your first app with the button above.
        </div>
      </div>
    )
  }

  // Build sections: one per group (ordered by position), then ungrouped at end
  const sortedGroups = [...groups].sort((a, b) => a.position - b.position)
  const sections: { label: string; icon: string | null; services: Service[]; id: string }[] = []

  for (const group of sortedGroups) {
    const groupServices = services.filter(s => s.group_id === group.id)
    if (groupServices.length > 0) {
      sections.push({ label: group.name, icon: group.icon, services: groupServices, id: group.id })
    }
  }

  const ungrouped = services.filter(s => !s.group_id)
  if (ungrouped.length > 0) {
    sections.push({ label: 'Ohne Gruppe', icon: null, services: ungrouped, id: 'ungrouped' })
  }

  // Export/Import handlers
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const showNotification = (message: string, type: 'success' | 'error') => {
    setNotification({ message, type })
    setTimeout(() => setNotification(null), 4000)
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const response = await fetch('/api/services/export')
      if (!response.ok) throw new Error('Export failed')
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = response.headers.get('content-disposition')?.split('filename=')[1]?.replace(/"/g, '') || 'heldash-services.json'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      showNotification(`Export error: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error')
    } finally {
      setExporting(false)
    }
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImporting(true)
    try {
      const text = await file.text()
      const data = JSON.parse(text)

      if (!data.services || !Array.isArray(data.services)) {
        throw new Error('Invalid file format: expected { services: [...] }')
      }

      const result = await api.services.import(data.services)
      showNotification(
        `Imported: ${result.imported}, Skipped: ${result.skipped}${result.errors?.length ? `, Errors: ${result.errors.length}` : ''}`,
        'success'
      )
      await loadServices()
    } catch (err) {
      showNotification(`Import error: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error')
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {notification && (
        <div style={{
          padding: '10px 16px',
          borderRadius: 'var(--radius-md)',
          background: notification.type === 'success' ? 'var(--status-online)' : 'var(--status-offline)',
          color: '#fff',
          fontSize: 13,
          fontWeight: 500,
        }}>
          {notification.message}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          onClick={() => setEditMode(!editMode)}
          className="btn btn-primary btn-sm"
        >
          {editMode ? 'Done' : 'Edit Groups'}
        </button>
        {isAdmin && (
          <>
            <button
              onClick={handleExport}
              disabled={exporting}
              className="btn btn-ghost btn-sm"
              title="Export all services as JSON"
            >
              <Download size={14} />
              Export
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              className="btn btn-ghost btn-sm"
              title="Import services from JSON file"
            >
              <Upload size={14} />
              Import
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleImport}
              style={{ display: 'none' }}
            />
          </>
        )}
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={groupOrder} strategy={verticalListSortingStrategy}>
          {sections.map((section, idx) => (
            <SortableGroupSection
              key={section.id}
              section={section}
              onEdit={onEdit}
              editMode={editMode}
              isDragging={false}
              isAdmin={isAdmin}
            />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  )
}

const thStyle: React.CSSProperties = {
  padding: '14px 16px',
  textAlign: 'left',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.5px',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
}

const tdStyle: React.CSSProperties = {
  padding: '12px 16px',
  fontSize: 14,
  color: 'var(--text-primary)',
  verticalAlign: 'middle',
}
