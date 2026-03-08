import React, { useEffect, useState, useCallback } from 'react'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, rectSortingStrategy, useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Plus, Trash2, Pencil, GripVertical, X, Check, Loader, TestTube2,
  ToggleLeft, ToggleRight, Search, ChevronDown, ChevronRight, Home,
} from 'lucide-react'
import { useHaStore } from '../store/useHaStore'
import { useStore } from '../store/useStore'
import { api } from '../api'
import type { HaEntityFull, HaPanel, HaInstance } from '../types'

// ── Domain helpers ────────────────────────────────────────────────────────────

const TOGGLE_DOMAINS = new Set(['light', 'switch', 'input_boolean', 'automation', 'fan', 'media_player'])
const TOGGLE_SERVICE_MAP: Record<string, [string, string]> = {
  cover: ['cover', 'toggle'],
  lock: ['lock', 'toggle'],
}

function getDomain(entityId: string): string {
  return entityId.split('.')[0] ?? ''
}

function isToggleable(entityId: string): boolean {
  const domain = getDomain(entityId)
  return TOGGLE_DOMAINS.has(domain) || domain in TOGGLE_SERVICE_MAP
}

function getToggleService(entityId: string, currentState: string): [string, string] {
  const domain = getDomain(entityId)
  if (domain in TOGGLE_SERVICE_MAP) return TOGGLE_SERVICE_MAP[domain]
  const isOn = ['on', 'open', 'unlocked', 'playing', 'home', 'active'].includes(currentState)
  return [domain, isOn ? 'turn_off' : 'turn_on']
}

function stateColor(state: string): string {
  if (['on', 'open', 'unlocked', 'playing', 'home', 'active'].includes(state)) return 'var(--status-online)'
  if (['off', 'closed', 'locked', 'paused', 'idle', 'standby', 'unavailable', 'unknown'].includes(state)) return 'var(--text-muted)'
  return 'var(--text-primary)'
}

function domainLabel(domain: string): string {
  const labels: Record<string, string> = {
    light: 'Lights', switch: 'Switches', sensor: 'Sensors', binary_sensor: 'Binary Sensors',
    climate: 'Climate', cover: 'Covers', media_player: 'Media Players', input_boolean: 'Input Booleans',
    automation: 'Automations', person: 'Persons', device_tracker: 'Device Trackers',
    fan: 'Fans', lock: 'Locks', scene: 'Scenes', script: 'Scripts', camera: 'Cameras',
    alarm_control_panel: 'Alarms', input_select: 'Input Selects', counter: 'Counters',
    timer: 'Timers', weather: 'Weather',
  }
  return labels[domain] ?? domain.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function formatState(entity: HaEntityFull): string {
  const unit = entity.attributes.unit_of_measurement
  return entity.state + (unit ? ` ${unit}` : '')
}

// ── Instance Form Modal ───────────────────────────────────────────────────────

interface InstanceFormProps {
  instance?: HaInstance | null
  onClose: () => void
  onSaved: () => void
}

function InstanceFormModal({ instance, onClose, onSaved }: InstanceFormProps) {
  const { createInstance, updateInstance } = useHaStore()
  const [name, setName] = useState(instance?.name ?? '')
  const [url, setUrl] = useState(instance?.url ?? '')
  const [token, setToken] = useState('')
  const [enabled, setEnabled] = useState(instance?.enabled ?? true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null)
  const [testing, setTesting] = useState(false)
  const isEdit = !!instance

  const handleTest = async () => {
    if (!instance) return
    setTesting(true)
    setTestResult(null)
    try {
      const res = await api.ha.instances.test(instance.id)
      setTestResult(res)
    } catch {
      setTestResult({ ok: false, error: 'Request failed' })
    } finally {
      setTesting(false)
    }
  }

  const handleSave = async () => {
    if (!name.trim()) return setError('Name is required')
    if (!url.trim()) return setError('URL is required')
    if (!isEdit && !token.trim()) return setError('Token is required')
    setSaving(true)
    setError('')
    try {
      if (isEdit) {
        const data: Record<string, unknown> = { name, url, enabled }
        if (token.trim()) data.token = token.trim()
        await updateInstance(instance.id, data as Parameters<typeof updateInstance>[1])
      } else {
        await createInstance({ name, url, token, enabled })
      }
      onSaved()
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="glass"
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 480,
          borderRadius: 'var(--radius-xl)',
          padding: '40px 40px 36px',
          animation: 'slide-up var(--transition-base)',
          position: 'relative',
        }}
      >
        <button className="btn btn-ghost btn-icon" onClick={onClose} style={{ position: 'absolute', top: 16, right: 16 }}>
          <X size={16} />
        </button>

        <h2 style={{ fontSize: 22, fontWeight: 600, marginBottom: 6, color: 'var(--text-primary)' }}>
          {isEdit ? 'Edit Instance' : 'Add HA Instance'}
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 28 }}>
          {isEdit ? 'Update your Home Assistant instance settings.' : 'Connect a Home Assistant instance to your dashboard.'}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Name</label>
            <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="Home Assistant" style={{ fontSize: 14, padding: '10px 12px' }} />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">URL</label>
            <input className="form-input" value={url} onChange={e => setUrl(e.target.value)} placeholder="http://homeassistant.local:8123" style={{ fontSize: 14, padding: '10px 12px' }} />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">
              Long-Lived Access Token{' '}
              {isEdit && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(leave blank to keep existing)</span>}
            </label>
            <input
              className="form-input"
              type="password"
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder={isEdit ? '••••••••••••• (unchanged)' : 'HA long-lived access token'}
              style={{ fontSize: 14, padding: '10px 12px' }}
            />
          </div>

          <label className="form-toggle" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
            <span className="form-label" style={{ marginBottom: 0, cursor: 'pointer' }}>Enabled</span>
          </label>

          {isEdit && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button className="btn btn-ghost" onClick={handleTest} disabled={testing} style={{ gap: 6 }}>
                <TestTube2 size={14} />
                {testing ? 'Testing…' : 'Test Connection'}
              </button>
              {testResult && (
                <span style={{ fontSize: 12, color: testResult.ok ? 'var(--status-online)' : 'var(--status-offline)' }}>
                  {testResult.ok ? '● Connected' : `● ${testResult.error ?? 'Failed'}`}
                </span>
              )}
            </div>
          )}

          {error && <div className="setup-error">{error}</div>}

          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="btn btn-ghost" onClick={onClose} style={{ flex: 1, justifyContent: 'center', padding: '11px 20px', fontSize: 14 }}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ flex: 1, gap: 8, justifyContent: 'center', padding: '11px 20px', fontSize: 14 }}>
              {saving
                ? <><div className="spinner" style={{ width: 15, height: 15, borderWidth: 2 }} /> Saving…</>
                : <><Check size={15} /> {isEdit ? 'Save Changes' : 'Add Instance'}</>
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Edit Panel Label Modal ────────────────────────────────────────────────────

function EditPanelModal({ panel, onClose }: { panel: HaPanel; onClose: () => void }) {
  const { updatePanel } = useHaStore()
  const [label, setLabel] = useState(panel.label ?? '')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await updatePanel(panel.id, { label: label.trim() || undefined })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="glass"
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 400,
          borderRadius: 'var(--radius-xl)',
          padding: '40px 40px 36px',
          animation: 'slide-up var(--transition-base)',
          position: 'relative',
        }}
      >
        <button className="btn btn-ghost btn-icon" onClick={onClose} style={{ position: 'absolute', top: 16, right: 16 }}>
          <X size={16} />
        </button>

        <h2 style={{ fontSize: 22, fontWeight: 600, marginBottom: 6, color: 'var(--text-primary)' }}>
          Edit Panel Label
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 28, fontFamily: 'var(--font-mono)' }}>
          {panel.entity_id}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Custom Label</label>
            <input
              className="form-input"
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="Leave blank to use friendly_name"
              autoFocus
              style={{ fontSize: 14, padding: '10px 12px' }}
            />
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="btn btn-ghost" onClick={onClose} style={{ flex: 1, justifyContent: 'center', padding: '11px 20px', fontSize: 14 }}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ flex: 1, gap: 8, justifyContent: 'center', padding: '11px 20px', fontSize: 14 }}>
              <Check size={15} /> Save
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Entity Browser Modal ──────────────────────────────────────────────────────

interface EntityBrowserProps {
  instances: HaInstance[]
  panels: HaPanel[]
  onClose: () => void
  onAdd: (instanceId: string, entityId: string) => Promise<void>
}

function EntityBrowserModal({ instances, panels, onClose, onAdd }: EntityBrowserProps) {
  const [selectedInstance, setSelectedInstance] = useState<string>(instances[0]?.id ?? '')
  const [entities, setEntities] = useState<HaEntityFull[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [adding, setAdding] = useState<string | null>(null)

  const loadEntities = useCallback(async (instanceId: string) => {
    if (!instanceId) return
    setLoading(true)
    setError('')
    try {
      const data = await api.ha.instances.states(instanceId)
      const sorted = [...data].sort((a, b) => a.entity_id.localeCompare(b.entity_id))
      setEntities(sorted)
      // Auto-expand first few domains
      const domains = new Set(sorted.map(e => getDomain(e.entity_id)))
      setExpanded(new Set([...domains].slice(0, 3)))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load entities')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (selectedInstance) loadEntities(selectedInstance)
  }, [selectedInstance, loadEntities])

  const existingSet = new Set(panels.filter(p => p.instance_id === selectedInstance).map(p => p.entity_id))

  const filtered = entities.filter(e =>
    !search || e.entity_id.toLowerCase().includes(search.toLowerCase())
      || (e.attributes.friendly_name ?? '').toLowerCase().includes(search.toLowerCase())
  )

  const byDomain = filtered.reduce<Record<string, HaEntityFull[]>>((acc, e) => {
    const d = getDomain(e.entity_id)
    if (!acc[d]) acc[d] = []
    acc[d].push(e)
    return acc
  }, {})

  const handleAdd = async (e: HaEntityFull) => {
    setAdding(e.entity_id)
    try {
      await onAdd(selectedInstance, e.entity_id)
    } finally {
      setAdding(null)
    }
  }

  const toggleDomain = (domain: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(domain)) next.delete(domain)
      else next.add(domain)
      return next
    })
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="glass"
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 560, maxHeight: '82vh',
          borderRadius: 'var(--radius-xl)',
          padding: '32px',
          animation: 'slide-up var(--transition-base)',
          position: 'relative',
          display: 'flex', flexDirection: 'column', gap: 16,
        }}
      >
        <button className="btn btn-ghost btn-icon" onClick={onClose} style={{ position: 'absolute', top: 16, right: 16 }}>
          <X size={16} />
        </button>

        <div>
          <h2 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4, color: 'var(--text-primary)' }}>
            Add Entity Panel
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Select entities to pin as panels on your dashboard.
          </p>
        </div>

        {instances.length > 1 && (
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Instance</label>
            <select className="form-input" value={selectedInstance} onChange={e => setSelectedInstance(e.target.value)} style={{ fontSize: 14, padding: '10px 12px' }}>
              {instances.filter(i => i.enabled).map(i => (
                <option key={i.id} value={i.id}>{i.name}</option>
              ))}
            </select>
          </div>
        )}

        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            className="form-input"
            style={{ paddingLeft: 34, fontSize: 14, padding: '10px 12px 10px 34px' }}
            placeholder="Search entities…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
        </div>

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, minHeight: 0 }}>
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
              <div className="spinner" style={{ width: 24, height: 24, borderWidth: 2 }} />
            </div>
          )}
          {error && <p style={{ color: 'var(--status-offline)', fontSize: 13 }}>{error}</p>}
          {!loading && !error && Object.entries(byDomain).sort(([a], [b]) => a.localeCompare(b)).map(([domain, domainEntities]) => (
            <div key={domain}>
              <button
                onClick={() => toggleDomain(domain)}
                style={{
                  width: '100%', textAlign: 'left', background: 'none', border: 'none',
                  color: 'var(--text-secondary)', fontSize: 11, fontWeight: 600, letterSpacing: '0.8px',
                  textTransform: 'uppercase', padding: '6px 4px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                {expanded.has(domain) ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                {domainLabel(domain)} ({domainEntities.length})
              </button>
              {expanded.has(domain) && domainEntities.map(entity => {
                const isAdded = existingSet.has(entity.entity_id)
                const isLoading = adding === entity.entity_id
                return (
                  <div
                    key={entity.entity_id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
                      borderRadius: 'var(--radius-sm)', opacity: isAdded ? 0.5 : 1,
                      background: isAdded ? 'rgba(var(--accent-rgb),0.04)' : undefined,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {entity.attributes.friendly_name ?? entity.entity_id}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {entity.entity_id}
                      </div>
                    </div>
                    <span style={{ fontSize: 11, color: stateColor(entity.state), fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                      {formatState(entity)}
                    </span>
                    <button
                      className="btn btn-ghost btn-icon"
                      style={{ flexShrink: 0, width: 24, height: 24 }}
                      disabled={isAdded || isLoading}
                      onClick={() => handleAdd(entity)}
                      data-tooltip={isAdded ? 'Already added' : 'Add panel'}
                    >
                      {isLoading ? <Loader size={12} /> : <Plus size={12} />}
                    </button>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Panel Card ────────────────────────────────────────────────────────────────

interface PanelCardProps {
  panel: HaPanel
  entity: HaEntityFull | undefined
  onRemove: () => void
  onEdit: () => void
  onToggle: () => void
  toggling: boolean
}

function PanelCard({ panel, entity, onRemove, onEdit, onToggle, toggling }: PanelCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: panel.id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  const label = panel.label || entity?.attributes.friendly_name || panel.entity_id
  const domain = getDomain(panel.entity_id)
  const state = entity?.state ?? '…'
  const toggleable = isToggleable(panel.entity_id)
  const isOn = entity ? ['on', 'open', 'unlocked', 'playing', 'home', 'active'].includes(entity.state) : false

  return (
    <div ref={setNodeRef} style={style} className="widget-card glass">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
        <div
          {...attributes}
          {...listeners}
          style={{ cursor: 'grab', color: 'var(--text-muted)', opacity: 0, transition: 'opacity var(--transition-fast)', flexShrink: 0, marginTop: 2 }}
          className="drag-handle"
        >
          <GripVertical size={14} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {domainLabel(domain)}
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {label}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0, opacity: 0, transition: 'opacity var(--transition-fast)' }} className="card-actions">
          <button className="btn btn-ghost btn-icon" style={{ width: 22, height: 22 }} onClick={onEdit} data-tooltip="Edit label">
            <Pencil size={11} />
          </button>
          <button className="btn btn-ghost btn-icon" style={{ width: 22, height: 22, color: 'var(--status-offline)' }} onClick={onRemove} data-tooltip="Remove panel">
            <Trash2 size={11} />
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div>
          {entity ? (
            <>
              <span style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-mono)', color: stateColor(entity.state) }}>
                {entity.attributes.unit_of_measurement
                  ? `${entity.state}`
                  : entity.state}
              </span>
              {entity.attributes.unit_of_measurement && (
                <span style={{ fontSize: 13, color: 'var(--text-muted)', marginLeft: 3 }}>
                  {entity.attributes.unit_of_measurement}
                </span>
              )}
            </>
          ) : (
            <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>—</span>
          )}
          {entity && !entity.attributes.unit_of_measurement && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
              {panel.entity_id}
            </div>
          )}
          {entity && entity.attributes.unit_of_measurement && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
              {panel.entity_id}
            </div>
          )}
        </div>

        {toggleable && entity && (
          <button
            onClick={toggling ? undefined : onToggle}
            style={{ background: 'none', border: 'none', cursor: toggling ? 'wait' : 'pointer', color: isOn ? 'var(--status-online)' : 'var(--text-muted)', flexShrink: 0 }}
            data-tooltip={isOn ? 'Turn off' : 'Turn on'}
          >
            {toggling
              ? <Loader size={22} style={{ animation: 'spin 1s linear infinite' }} />
              : isOn ? <ToggleRight size={28} /> : <ToggleLeft size={28} />
            }
          </button>
        )}
      </div>

      {entity && (
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6, textAlign: 'right' }}>
          {new Date(entity.last_updated).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
        </div>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function HaPage() {
  const {
    instances, panels, stateMap,
    loadInstances, loadPanels, loadStates, updateEntityState,
    addPanel, removePanel, reorderPanels, callService,
    deleteInstance,
  } = useHaStore()
  const { isAdmin } = useStore()

  const [showInstanceForm, setShowInstanceForm] = useState(false)
  const [editInstance, setEditInstance] = useState<HaInstance | null>(null)
  const [showBrowser, setShowBrowser] = useState(false)
  const [editPanel, setEditPanel] = useState<HaPanel | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)

  // Load initial data
  useEffect(() => {
    loadInstances().catch(() => {})
    loadPanels().catch(() => {})
  }, [])

  // Subscribe to real-time state updates for all instances referenced in panels.
  // On mount: fetch initial bulk state snapshot, then open SSE stream from the
  // backend HA WebSocket bridge. Cleans up EventSources on unmount / panel change.
  const instanceIds = [...new Set(panels.map(p => p.instance_id))]
  const instanceIdsKey = instanceIds.join(',')

  useEffect(() => {
    if (!instanceIdsKey) return
    const ids = instanceIdsKey.split(',')
    const sources: EventSource[] = []

    // Initial bulk load so cards aren't empty while WS connects
    ids.forEach(id => loadStates(id).catch(() => {}))

    // Open SSE stream per instance (backend bridges HA WebSocket → SSE)
    for (const instanceId of ids) {
      const es = new EventSource(`/api/ha/instances/${instanceId}/stream`)
      es.onmessage = (e: MessageEvent) => {
        try {
          const { entity_id, state } = JSON.parse(e.data as string) as {
            entity_id: string
            state: HaEntityFull
          }
          updateEntityState(instanceId, entity_id, state)
        } catch { /* ignore malformed event */ }
      }
      sources.push(es)
    }

    return () => sources.forEach(es => es.close())
  }, [instanceIdsKey])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = panels.findIndex(p => p.id === active.id)
    const newIdx = panels.findIndex(p => p.id === over.id)
    if (oldIdx === -1 || newIdx === -1) return
    const reordered = [...panels]
    const [moved] = reordered.splice(oldIdx, 1)
    reordered.splice(newIdx, 0, moved)
    reorderPanels(reordered.map(p => p.id)).catch(() => {})
  }

  const handleToggle = async (panel: HaPanel) => {
    const entity = stateMap[panel.instance_id]?.[panel.entity_id]
    if (!entity) return
    const [domain, service] = getToggleService(panel.entity_id, entity.state)
    setToggling(panel.id)
    try {
      await callService(panel.instance_id, domain, service, panel.entity_id)
    } finally {
      setToggling(null)
    }
  }

  const handleAddPanel = async (instanceId: string, entityId: string) => {
    await addPanel(instanceId, entityId)
  }

  const enabledInstances = instances.filter(i => i.enabled)

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Home size={20} style={{ color: 'var(--accent)' }} />
          <h1 style={{ margin: 0, fontSize: 20, fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
            Home Assistant
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {enabledInstances.length > 0 && (
            <button className="btn btn-ghost" onClick={() => setShowBrowser(true)} style={{ gap: 6 }}>
              <Plus size={15} />
              Add Panel
            </button>
          )}
          {isAdmin && (
            <button className="btn btn-primary" onClick={() => { setEditInstance(null); setShowInstanceForm(true) }} style={{ gap: 6 }}>
              <Plus size={15} />
              Add Instance
            </button>
          )}
        </div>
      </div>

      {/* Instances management (admin only) */}
      {isAdmin && instances.length > 0 && (
        <div className="glass" style={{ borderRadius: 'var(--radius-lg)', padding: '16px 20px', marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 12 }}>
            Instances
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {instances.map(inst => (
              <div key={inst.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>{inst.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 10, fontFamily: 'var(--font-mono)' }}>{inst.url}</span>
                </div>
                <span style={{ fontSize: 11, color: inst.enabled ? 'var(--status-online)' : 'var(--text-muted)', fontWeight: 600 }}>
                  {inst.enabled ? '● Enabled' : '● Disabled'}
                </span>
                <button className="btn btn-ghost btn-icon" style={{ width: 28, height: 28 }} onClick={() => { setEditInstance(inst); setShowInstanceForm(true) }}>
                  <Pencil size={13} />
                </button>
                <button className="btn btn-ghost btn-icon" style={{ width: 28, height: 28, color: 'var(--status-offline)' }} onClick={() => deleteInstance(inst.id)}>
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {instances.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)' }}>
          <Home size={48} style={{ opacity: 0.2, marginBottom: 12 }} />
          {isAdmin ? (
            <>
              <p style={{ fontSize: 14, marginBottom: 12 }}>No Home Assistant instances configured.</p>
              <button className="btn btn-primary" onClick={() => { setEditInstance(null); setShowInstanceForm(true) }} style={{ gap: 6 }}>
                <Plus size={14} />Add Instance
              </button>
            </>
          ) : (
            <p style={{ fontSize: 14 }}>No Home Assistant instances available.</p>
          )}
        </div>
      )}

      {/* Panels grid (empty) */}
      {instances.length > 0 && panels.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px 24px', color: 'var(--text-muted)' }}>
          <p style={{ fontSize: 14, marginBottom: 12 }}>No panels added yet.</p>
          {enabledInstances.length > 0 && (
            <button className="btn btn-ghost" onClick={() => setShowBrowser(true)} style={{ gap: 6 }}>
              <Plus size={14} />Add Panel
            </button>
          )}
        </div>
      )}

      {/* DnD Panel Grid */}
      {panels.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={panels.map(p => p.id)} strategy={rectSortingStrategy}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: 16,
            }}>
              {panels.map(panel => {
                const entity = stateMap[panel.instance_id]?.[panel.entity_id]
                return (
                  <PanelCard
                    key={panel.id}
                    panel={panel}
                    entity={entity}
                    onRemove={() => removePanel(panel.id)}
                    onEdit={() => setEditPanel(panel)}
                    onToggle={() => handleToggle(panel)}
                    toggling={toggling === panel.id}
                  />
                )
              })}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Modals */}
      {showInstanceForm && (
        <InstanceFormModal
          instance={editInstance}
          onClose={() => { setShowInstanceForm(false); setEditInstance(null) }}
          onSaved={() => loadInstances().catch(() => {})}
        />
      )}

      {showBrowser && (
        <EntityBrowserModal
          instances={enabledInstances}
          panels={panels}
          onClose={() => setShowBrowser(false)}
          onAdd={handleAddPanel}
        />
      )}

      {editPanel && (
        <EditPanelModal
          panel={editPanel}
          onClose={() => setEditPanel(null)}
        />
      )}
    </div>
  )
}
