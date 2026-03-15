import React, { useEffect, useRef, useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  GripVertical, Pencil, Trash2, Loader, ToggleLeft, ToggleRight,
  Thermometer, Droplets, Zap, Wind, Eye, Activity, Gauge,
  SkipBack, Play, Pause, SkipForward, ChevronUp, ChevronDown,
} from 'lucide-react'
import { useHaStore } from '../store/useHaStore'
import type { HaPanel, HaEntityFull } from '../types'

// ── Relative time ──────────────────────────────────────────────────────────────

export function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return 'just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min} min ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  return new Date(iso).toLocaleDateString()
}

function RelativeTime({ iso }: { iso: string }) {
  const [label, setLabel] = useState(() => formatRelativeTime(iso))
  useEffect(() => {
    setLabel(formatRelativeTime(iso))
    const id = setInterval(() => setLabel(formatRelativeTime(iso)), 60_000)
    return () => clearInterval(id)
  }, [iso])
  return <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Updated {label}</span>
}

// ── Domain helpers ─────────────────────────────────────────────────────────────

function getDomain(entityId: string): string {
  return entityId.split('.')[0] ?? ''
}

function stateColor(state: string): string {
  if (['on', 'open', 'unlocked', 'playing', 'home', 'active'].includes(state)) return 'var(--status-online)'
  if (['off', 'closed', 'locked', 'paused', 'idle', 'standby', 'unavailable', 'unknown'].includes(state)) return 'var(--text-muted)'
  return 'var(--text-primary)'
}

function domainLabel(domain: string): string {
  const labels: Record<string, string> = {
    light: 'Light', switch: 'Switch', sensor: 'Sensor', binary_sensor: 'Binary Sensor',
    climate: 'Climate', cover: 'Cover', media_player: 'Media Player', input_boolean: 'Input Boolean',
    automation: 'Automation', fan: 'Fan', lock: 'Lock', scene: 'Scene', script: 'Script',
  }
  return labels[domain] ?? domain.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// ── Shared card shell ──────────────────────────────────────────────────────────

interface ShellProps {
  panel: HaPanel
  entity: HaEntityFull | undefined
  onEdit: () => void
  onRemove: () => void
  dragHandleProps: { attributes: object; listeners: object | undefined }
  children: React.ReactNode
}

function PanelCardShell({ panel, entity, onEdit, onRemove, dragHandleProps, children }: ShellProps) {
  const domain = getDomain(panel.entity_id)
  const label = panel.label || entity?.attributes.friendly_name || panel.entity_id

  return (
    <div className="widget-card glass">
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
        <div
          {...(dragHandleProps.attributes as React.HTMLAttributes<HTMLDivElement>)}
          {...(dragHandleProps.listeners as React.HTMLAttributes<HTMLDivElement>)}
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

      {/* Domain content */}
      {children}

      {/* Footer timestamp */}
      {entity && (
        <div style={{ marginTop: 8, textAlign: 'right' }}>
          <RelativeTime iso={entity.last_updated} />
        </div>
      )}
    </div>
  )
}

// ── Toggle button helper ───────────────────────────────────────────────────────

function ToggleBtn({ isOn, busy, onToggle }: { isOn: boolean; busy: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={busy ? undefined : onToggle}
      style={{ background: 'none', border: 'none', cursor: busy ? 'wait' : 'pointer', color: isOn ? 'var(--status-online)' : 'var(--text-muted)', flexShrink: 0 }}
      data-tooltip={isOn ? 'Turn off' : 'Turn on'}
    >
      {busy
        ? <Loader size={22} className="spin" />
        : isOn ? <ToggleRight size={28} /> : <ToggleLeft size={28} />
      }
    </button>
  )
}

// ── Light card ─────────────────────────────────────────────────────────────────

function LightCard({ panel, entity, instanceId }: { panel: HaPanel; entity: HaEntityFull; instanceId: string }) {
  const { callService } = useHaStore()
  const [busy, setBusy] = useState(false)
  const [localBrightness, setLocalBrightness] = useState<number | null>(null)
  const [localColorTemp, setLocalColorTemp] = useState<number | null>(null)
  const brightRef = useRef<ReturnType<typeof setTimeout>>()
  const tempRef = useRef<ReturnType<typeof setTimeout>>()

  const isOn = entity.state === 'on'
  const brightness = entity.attributes.brightness
  const colorTemp = entity.attributes.color_temp
  const minK = entity.attributes.min_color_temp_kelvin ?? 2700
  const maxK = entity.attributes.max_color_temp_kelvin ?? 6500

  const toggle = async () => {
    setBusy(true)
    try { await callService(instanceId, 'light', isOn ? 'turn_off' : 'turn_on', panel.entity_id) }
    finally { setBusy(false) }
  }

  const handleBrightness = (val: number) => {
    setLocalBrightness(val)
    clearTimeout(brightRef.current)
    brightRef.current = setTimeout(() => {
      callService(instanceId, 'light', 'turn_on', panel.entity_id, { brightness: val }).catch(() => {})
      setLocalBrightness(null)
    }, 300)
  }

  const handleColorTemp = (val: number) => {
    setLocalColorTemp(val)
    clearTimeout(tempRef.current)
    tempRef.current = setTimeout(() => {
      callService(instanceId, 'light', 'turn_on', panel.entity_id, { color_temp_kelvin: val }).catch(() => {})
      setLocalColorTemp(null)
    }, 300)
  }

  const displayBrightness = localBrightness ?? brightness
  const colorTempK = colorTemp !== undefined ? Math.round(1_000_000 / colorTemp) : undefined
  const displayColorTempK = localColorTemp ?? colorTempK

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-mono)', color: stateColor(entity.state) }}>
          {entity.state}
        </span>
        <ToggleBtn isOn={isOn} busy={busy} onToggle={toggle} />
      </div>
      {isOn && displayBrightness !== undefined && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
            Brightness {Math.round((displayBrightness / 255) * 100)}%
          </div>
          <input
            type="range" className="ha-slider" min={0} max={255}
            value={displayBrightness}
            onChange={e => handleBrightness(Number(e.target.value))}
          />
        </div>
      )}
      {isOn && displayColorTempK !== undefined && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Color Temp</div>
          <input
            type="range" className="ha-slider" min={minK} max={maxK}
            value={displayColorTempK}
            onChange={e => handleColorTemp(Number(e.target.value))}
          />
        </div>
      )}
    </div>
  )
}

// ── Climate card ───────────────────────────────────────────────────────────────

function ClimateCard({ panel, entity, instanceId }: { panel: HaPanel; entity: HaEntityFull; instanceId: string }) {
  const { callService } = useHaStore()
  const attrs = entity.attributes
  const current = attrs.current_temperature
  const target = attrs.temperature
  const unit = attrs.unit_of_measurement ?? '°C'
  const hvacMode = attrs.hvac_mode ?? entity.state
  const hvacModes = attrs.hvac_modes ?? []
  const minTemp = attrs.min_temp ?? 7
  const maxTemp = attrs.max_temp ?? 35

  const setTemp = (delta: number) => {
    const newTemp = Math.min(maxTemp, Math.max(minTemp, (target ?? current ?? 20) + delta))
    callService(instanceId, 'climate', 'set_temperature', panel.entity_id, { temperature: newTemp }).catch(() => {})
  }

  const setMode = (mode: string) => {
    callService(instanceId, 'climate', 'set_hvac_mode', panel.entity_id, { hvac_mode: mode }).catch(() => {})
  }

  return (
    <div>
      {current !== undefined && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
          Current: <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{current}{unit}</span>
        </div>
      )}
      {target !== undefined && (
        <div className="ha-climate-temp">
          <button className="btn btn-ghost btn-icon" style={{ width: 28, height: 28 }} onClick={() => setTemp(-0.5)}>
            <ChevronDown size={14} />
          </button>
          <span style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
            {target}{unit}
          </span>
          <button className="btn btn-ghost btn-icon" style={{ width: 28, height: 28 }} onClick={() => setTemp(0.5)}>
            <ChevronUp size={14} />
          </button>
        </div>
      )}
      {hvacModes.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
          {hvacModes.map(mode => (
            <button
              key={mode}
              className="ha-tab-btn"
              style={{ fontSize: 10, padding: '2px 8px', ...(mode === hvacMode ? { background: 'var(--accent)', color: 'var(--bg-primary)', borderColor: 'var(--accent)' } : {}) }}
              onClick={() => setMode(mode)}
            >
              {mode}
            </button>
          ))}
        </div>
      )}
      {hvacModes.length === 0 && (
        <div style={{ fontSize: 13, color: stateColor(entity.state), marginTop: 4 }}>{hvacMode}</div>
      )}
    </div>
  )
}

// ── Media player card ──────────────────────────────────────────────────────────

function MediaPlayerCard({ panel, entity, instanceId }: { panel: HaPanel; entity: HaEntityFull; instanceId: string }) {
  const { callService } = useHaStore()
  const attrs = entity.attributes
  const volRef = useRef<ReturnType<typeof setTimeout>>()

  const isPlaying = entity.state === 'playing'
  const volume = attrs.volume_level

  const call = (svc: string, data?: Record<string, unknown>) => {
    callService(instanceId, 'media_player', svc, panel.entity_id, data).catch(() => {})
  }

  const handleVolume = (val: number) => {
    clearTimeout(volRef.current)
    volRef.current = setTimeout(() => call('volume_set', { volume_level: val }), 300)
  }

  const pictureSrc = attrs.entity_picture?.startsWith('http') ? attrs.entity_picture : undefined

  return (
    <div>
      {pictureSrc && (
        <img src={pictureSrc} alt="album art" style={{ width: '100%', height: 80, objectFit: 'cover', borderRadius: 'var(--radius-sm)', marginBottom: 8 }} />
      )}
      {(attrs.media_title || attrs.media_artist) && (
        <div style={{ marginBottom: 8 }}>
          {attrs.media_title && (
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {attrs.media_title}
            </div>
          )}
          {attrs.media_artist && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {attrs.media_artist}
            </div>
          )}
        </div>
      )}
      {!attrs.media_title && !attrs.media_artist && (
        <div style={{ fontSize: 13, color: stateColor(entity.state), marginBottom: 8 }}>{entity.state}</div>
      )}
      <div className="ha-media-controls">
        <button className="btn btn-ghost btn-icon" style={{ width: 28, height: 28 }} onClick={() => call('media_previous_track')}>
          <SkipBack size={13} />
        </button>
        <button className="btn btn-ghost btn-icon" style={{ width: 28, height: 28 }} onClick={() => call('media_play_pause')}>
          {isPlaying ? <Pause size={13} /> : <Play size={13} />}
        </button>
        <button className="btn btn-ghost btn-icon" style={{ width: 28, height: 28 }} onClick={() => call('media_next_track')}>
          <SkipForward size={13} />
        </button>
      </div>
      {volume !== undefined && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
            Volume {Math.round(volume * 100)}%
          </div>
          <input
            type="range" className="ha-slider" min={0} max={1} step={0.01}
            defaultValue={volume}
            onChange={e => handleVolume(Number(e.target.value))}
          />
        </div>
      )}
      {attrs.source_list && attrs.source_list.length > 0 && (
        <select
          className="form-input"
          style={{ fontSize: 11, padding: '4px 8px', marginTop: 8 }}
          value={attrs.source ?? ''}
          onChange={e => call('select_source', { source: e.target.value })}
        >
          <option value="" disabled>Source</option>
          {attrs.source_list.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      )}
    </div>
  )
}

// ── Cover card ─────────────────────────────────────────────────────────────────

function CoverCard({ panel, entity, instanceId }: { panel: HaPanel; entity: HaEntityFull; instanceId: string }) {
  const { callService } = useHaStore()
  const posRef = useRef<ReturnType<typeof setTimeout>>()
  const isOpen = entity.state === 'open'
  const isClosed = entity.state === 'closed'
  const pos = entity.attributes.current_position

  const call = (svc: string, data?: Record<string, unknown>) => {
    callService(instanceId, 'cover', svc, panel.entity_id, data).catch(() => {})
  }

  const handlePosition = (val: number) => {
    clearTimeout(posRef.current)
    posRef.current = setTimeout(() => call('set_cover_position', { position: val }), 300)
  }

  return (
    <div>
      <div style={{ fontSize: 13, color: stateColor(entity.state), marginBottom: 8 }}>{entity.state}</div>
      <div className="ha-cover-buttons">
        <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 8px' }} disabled={isOpen} onClick={() => call('open_cover')}>Open</button>
        <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => call('stop_cover')}>Stop</button>
        <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 8px' }} disabled={isClosed} onClick={() => call('close_cover')}>Close</button>
      </div>
      {pos !== undefined && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Position {pos}%</div>
          <input
            type="range" className="ha-slider" min={0} max={100}
            defaultValue={pos}
            onChange={e => handlePosition(Number(e.target.value))}
          />
        </div>
      )}
    </div>
  )
}

// ── Sensor card ────────────────────────────────────────────────────────────────

function SensorIcon({ deviceClass }: { deviceClass: string | undefined }) {
  const icons: Record<string, React.ReactNode> = {
    temperature: <Thermometer size={18} />,
    humidity: <Droplets size={18} />,
    power: <Zap size={18} />,
    wind_speed: <Wind size={18} />,
    illuminance: <Eye size={18} />,
    signal_strength: <Activity size={18} />,
    pressure: <Gauge size={18} />,
  }
  return <span style={{ color: 'var(--accent)', flexShrink: 0 }}>{icons[deviceClass ?? ''] ?? <Activity size={18} />}</span>
}

function SensorCard({ entity }: { entity: HaEntityFull }) {
  const unit = entity.attributes.unit_of_measurement
  const isBinary = getDomain(entity.entity_id) === 'binary_sensor'
  const isOn = entity.state === 'on'

  if (isBinary) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
        <span style={{
          fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 'var(--radius-sm)',
          background: isOn ? 'rgba(var(--accent-rgb),0.15)' : 'var(--surface-2)',
          color: isOn ? 'var(--status-online)' : 'var(--text-muted)',
        }}>
          {entity.state}
        </span>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
      <SensorIcon deviceClass={entity.attributes.device_class} />
      <div>
        <span style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
          {entity.state}
        </span>
        {unit && <span style={{ fontSize: 13, color: 'var(--text-muted)', marginLeft: 3 }}>{unit}</span>}
      </div>
    </div>
  )
}

// ── Script / Scene card ────────────────────────────────────────────────────────

function ScriptSceneCard({ panel, entity, instanceId }: { panel: HaPanel; entity: HaEntityFull; instanceId: string }) {
  const { callService } = useHaStore()
  const [busy, setBusy] = useState(false)
  const domain = getDomain(panel.entity_id)
  const isScript = domain === 'script'

  const run = async () => {
    setBusy(true)
    try { await callService(instanceId, domain, 'turn_on', panel.entity_id) }
    finally { setBusy(false) }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
      <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{entity.state}</span>
      <button className="btn btn-primary" style={{ fontSize: 11, padding: '4px 12px', gap: 4 }} onClick={run} disabled={busy}>
        {busy ? <Loader size={12} className="spin" /> : null}
        {isScript ? 'Run' : 'Activate'}
      </button>
    </div>
  )
}

// ── Generic card (switch / input_boolean / automation / fan / lock / fallback) ─

function GenericCard({ panel, entity, instanceId }: { panel: HaPanel; entity: HaEntityFull; instanceId: string }) {
  const { callService } = useHaStore()
  const [busy, setBusy] = useState(false)

  const TOGGLE_DOMAINS = new Set(['switch', 'input_boolean', 'automation', 'fan', 'light', 'media_player'])
  const TOGGLE_MAP: Record<string, [string, string]> = { cover: ['cover', 'toggle'], lock: ['lock', 'toggle'] }
  const domain = getDomain(panel.entity_id)
  const isOn = ['on', 'open', 'unlocked', 'playing', 'home', 'active'].includes(entity.state)
  const toggleable = TOGGLE_DOMAINS.has(domain) || domain in TOGGLE_MAP

  const getToggle = (): [string, string] => {
    if (domain in TOGGLE_MAP) return TOGGLE_MAP[domain]
    return [domain, isOn ? 'turn_off' : 'turn_on']
  }

  const toggle = async () => {
    const [d, svc] = getToggle()
    setBusy(true)
    try { await callService(instanceId, d, svc, panel.entity_id) }
    finally { setBusy(false) }
  }

  const unit = entity.attributes.unit_of_measurement

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <div>
        <span style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--font-mono)', color: stateColor(entity.state) }}>
          {entity.state}
        </span>
        {unit && <span style={{ fontSize: 13, color: 'var(--text-muted)', marginLeft: 3 }}>{unit}</span>}
      </div>
      {toggleable && <ToggleBtn isOn={isOn} busy={busy} onToggle={toggle} />}
    </div>
  )
}

// ── Public export: HaPanelCard ─────────────────────────────────────────────────

export interface HaPanelCardProps {
  panel: HaPanel
  entity: HaEntityFull | undefined
  instanceId: string
  onEdit: () => void
  onRemove: () => void
}

export function HaPanelCard({ panel, entity, instanceId, onEdit, onRemove }: HaPanelCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: panel.id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  const domain = getDomain(panel.entity_id)

  const renderContent = () => {
    if (!entity) {
      return <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>—</div>
    }
    switch (domain) {
      case 'light':
        return <LightCard panel={panel} entity={entity} instanceId={instanceId} />
      case 'climate':
        return <ClimateCard panel={panel} entity={entity} instanceId={instanceId} />
      case 'media_player':
        return <MediaPlayerCard panel={panel} entity={entity} instanceId={instanceId} />
      case 'cover':
        return <CoverCard panel={panel} entity={entity} instanceId={instanceId} />
      case 'sensor':
      case 'binary_sensor':
        return <SensorCard entity={entity} />
      case 'script':
      case 'scene':
        return <ScriptSceneCard panel={panel} entity={entity} instanceId={instanceId} />
      default:
        return <GenericCard panel={panel} entity={entity} instanceId={instanceId} />
    }
  }

  return (
    <div ref={setNodeRef} style={style}>
      <PanelCardShell
        panel={panel}
        entity={entity}
        onEdit={onEdit}
        onRemove={onRemove}
        dragHandleProps={{ attributes, listeners }}
      >
        {renderContent()}
      </PanelCardShell>
    </div>
  )
}
