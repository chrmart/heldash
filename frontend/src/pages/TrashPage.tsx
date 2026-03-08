import React, { useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import {
  RefreshCw, Settings2, ChevronDown, ChevronRight, Check, X, Loader,
  AlertTriangle, Trash2, Download, GitCommit, Clock, CheckCircle,
  XCircle, Info, Eye, Play, RotateCcw,
} from 'lucide-react'
import { useTrashStore } from '../store/useTrashStore'
import { useArrStore } from '../store/useArrStore'
import type { TrashFormatRow, TrashPreview, TrashSyncLogEntry, TrashDeprecatedFormat, TrashImportableFormat, TrashInstanceConfig } from '../types/trash'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
}

function fmtDuration(ms: number | null): string {
  if (ms === null) return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function syncStatusBadge(status: string) {
  const map: Record<string, { color: string; label: string }> = {
    success: { color: '#10b981', label: 'Success' },
    partial: { color: '#f59e0b', label: 'Partial' },
    error: { color: '#f87171', label: 'Error' },
    no_op: { color: 'var(--text-muted)', label: 'No-op' },
  }
  const { color, label } = map[status] ?? { color: 'var(--text-muted)', label: status }
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 4,
      fontSize: 11, fontWeight: 600, background: `${color}22`, color,
    }}>
      {label}
    </span>
  )
}

// ── Configure Modal ───────────────────────────────────────────────────────────

interface ConfigureModalProps {
  config: TrashInstanceConfig
  profiles: { slug: string; name: string; formatCount: number }[]
  onClose: () => void
}

function ConfigureModal({ config, profiles, onClose }: ConfigureModalProps) {
  const { configure, loadProfiles } = useTrashStore()
  const [profileSlug, setProfileSlug] = useState<string>(config.profile_slug ?? '')
  const [syncMode, setSyncMode] = useState<'auto' | 'manual' | 'notify'>(config.sync_mode)
  const [intervalHours, setIntervalHours] = useState(config.sync_interval_hours)
  const [enabled, setEnabled] = useState(config.enabled)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { loadProfiles(config.instance_id).catch(() => {}) }, [config.instance_id])

  async function save() {
    setSaving(true); setError(null)
    try {
      await configure(config.instance_id, {
        profile_slug: profileSlug || null,
        sync_mode: syncMode,
        sync_interval_hours: intervalHours,
        enabled,
      })
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
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

        <h2 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4, color: 'var(--text-primary)' }}>
          Configure Sync
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 28, fontFamily: 'var(--font-mono)' }}>
          {config.instance_id}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <label className="form-toggle" style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
            <span className="form-label" style={{ marginBottom: 0, cursor: 'pointer' }}>TRaSH sync enabled</span>
          </label>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Quality Profile</label>
            <select className="form-input" value={profileSlug} onChange={e => setProfileSlug(e.target.value)} style={{ fontSize: 14, padding: '10px 12px' }}>
              <option value="">— No profile selected —</option>
              {profiles.map(p => (
                <option key={p.slug} value={p.slug}>{p.name} ({p.formatCount} formats)</option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Sync Mode</label>
            <select className="form-input" value={syncMode} onChange={e => setSyncMode(e.target.value as 'auto' | 'manual' | 'notify')} style={{ fontSize: 14, padding: '10px 12px' }}>
              <option value="notify">Notify — show diff, require confirmation</option>
              <option value="auto">Auto — apply changes automatically</option>
              <option value="manual">Manual — only sync when triggered</option>
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Sync interval (hours)</label>
            <input type="number" className="form-input" min={1} max={168} value={intervalHours} onChange={e => setIntervalHours(Number(e.target.value))} style={{ fontSize: 14, padding: '10px 12px' }} />
          </div>

          {error && <div className="setup-error">{error}</div>}

          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="btn btn-ghost" onClick={onClose} style={{ flex: 1, justifyContent: 'center', padding: '11px 20px', fontSize: 14 }}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={save} disabled={saving} style={{ flex: 1, gap: 8, justifyContent: 'center', padding: '11px 20px', fontSize: 14 }}>
              {saving
                ? <><div className="spinner" style={{ width: 15, height: 15, borderWidth: 2 }} /> Saving…</>
                : <><Check size={15} /> Save</>
              }
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ── Preview Modal ─────────────────────────────────────────────────────────────

interface PreviewModalProps {
  instanceId: string
  preview: TrashPreview
  onApply: () => void
  onClose: () => void
}

function PreviewModal({ instanceId, preview, onApply, onClose }: PreviewModalProps) {
  const { applyPreview } = useTrashStore()
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function apply() {
    setApplying(true); setError(null)
    try {
      await applyPreview(instanceId, preview.id)
      onApply()
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Apply failed')
    } finally {
      setApplying(false)
    }
  }

  const typeLabels: Record<string, string> = {
    add: 'Add',
    update_conditions: 'Update conditions',
    deprecate: 'Deprecate',
    update_score: 'Update score',
    repair: 'Repair',
  }

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="glass"
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 620, maxHeight: '82vh',
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
          <h2 style={{ fontSize: 22, fontWeight: 600, marginBottom: 8, color: 'var(--text-primary)' }}>
            Pending Changes
          </h2>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            {preview.summary.formatsAdded > 0 && (
              <span style={{ color: '#10b981', fontSize: 13 }}>+{preview.summary.formatsAdded} formats</span>
            )}
            {preview.summary.conditionsUpdated > 0 && (
              <span style={{ color: 'var(--accent)', fontSize: 13 }}>{preview.summary.conditionsUpdated} condition updates</span>
            )}
            {preview.summary.profilesUpdated > 0 && (
              <span style={{ color: 'var(--accent)', fontSize: 13 }}>{preview.summary.profilesUpdated} profile updates</span>
            )}
            {preview.summary.formatsDeprecated > 0 && (
              <span style={{ color: '#f59e0b', fontSize: 13 }}>{preview.summary.formatsDeprecated} deprecated</span>
            )}
            {preview.summary.repairItems > 0 && (
              <span style={{ color: '#f59e0b', fontSize: 13 }}>{preview.summary.repairItems} repairs</span>
            )}
          </div>
        </div>

        {preview.stale && (
          <div style={{
            background: '#f59e0b22', border: '1px solid #f59e0b44',
            borderRadius: 'var(--radius-md)', padding: '10px 14px',
            color: '#f59e0b', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <AlertTriangle size={14} />
            Preview is stale — a newer GitHub commit exists. Re-trigger sync to refresh.
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, minHeight: 0 }}>
          {preview.changes.map((ch, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'flex-start', gap: 12,
              padding: '8px 12px', borderRadius: 'var(--radius-sm)',
              background: 'var(--glass-bg)', border: '1px solid var(--border)',
            }}>
              <span style={{
                minWidth: 120, fontSize: 11, fontWeight: 600, padding: '2px 6px',
                borderRadius: 4, background: 'rgba(var(--accent-rgb),0.12)', color: 'var(--accent)',
                whiteSpace: 'nowrap',
              }}>
                {typeLabels[ch.type] ?? ch.type}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{ch.name}</div>
                {ch.detail && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{ch.detail}</div>}
              </div>
            </div>
          ))}
          {preview.changes.length === 0 && (
            <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 24 }}>
              No changes in preview.
            </div>
          )}
        </div>

        {error && <div className="setup-error">{error}</div>}

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" onClick={onClose} style={{ flex: 1, justifyContent: 'center', padding: '11px 20px', fontSize: 14 }}>
            Close
          </button>
          <button className="btn btn-primary" onClick={apply} disabled={applying || preview.stale} style={{ flex: 1, gap: 8, justifyContent: 'center', padding: '11px 20px', fontSize: 14 }}>
            {applying
              ? <><div className="spinner" style={{ width: 15, height: 15, borderWidth: 2 }} /> Applying…</>
              : <><Play size={15} /> Apply Changes</>
            }
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ── Import Formats Modal ──────────────────────────────────────────────────────

interface ImportModalProps {
  instanceId: string
  formats: TrashImportableFormat[]
  onClose: () => void
}

function ImportModal({ instanceId, formats, onClose }: ImportModalProps) {
  const { importFormats } = useTrashStore()
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{ imported: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const filtered = formats.filter(f => f.name.toLowerCase().includes(search.toLowerCase()))

  function toggleAll() {
    if (selected.size === filtered.length) setSelected(new Set())
    else setSelected(new Set(filtered.map(f => f.id)))
  }

  async function doImport() {
    if (selected.size === 0) return
    setImporting(true); setError(null)
    try {
      const res = await importFormats(instanceId, Array.from(selected))
      setResult(res)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="glass"
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 540, maxHeight: '82vh',
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

        {result ? (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <CheckCircle size={48} style={{ color: '#10b981', marginBottom: 16 }} />
            <h2 style={{ fontSize: 22, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
              Import complete
            </h2>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
              {result.imported} format{result.imported !== 1 ? 's' : ''} imported successfully.
            </p>
            <button className="btn btn-primary" onClick={onClose} style={{ marginTop: 24, padding: '11px 32px', fontSize: 14, justifyContent: 'center' }}>
              Done
            </button>
          </div>
        ) : (
          <>
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4, color: 'var(--text-primary)' }}>
                Import Formats from Arr
              </h2>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Select existing custom formats to import into TRaSH tracking.
              </p>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="form-input"
                placeholder="Search formats…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ flex: 1, fontSize: 14, padding: '10px 12px' }}
                autoFocus
              />
              <button className="btn btn-ghost" onClick={toggleAll} style={{ whiteSpace: 'nowrap', fontSize: 13 }}>
                {selected.size === filtered.length ? 'Deselect all' : 'Select all'}
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, minHeight: 0 }}>
              {filtered.map(f => (
                <label key={f.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                  background: selected.has(f.id) ? 'rgba(var(--accent-rgb),0.08)' : 'var(--glass-bg)',
                  border: `1px solid ${selected.has(f.id) ? 'rgba(var(--accent-rgb),0.3)' : 'var(--border)'}`,
                  cursor: 'pointer', transition: 'all 150ms ease',
                }}>
                  <input
                    type="checkbox"
                    checked={selected.has(f.id)}
                    onChange={() => {
                      const next = new Set(selected)
                      if (next.has(f.id)) next.delete(f.id); else next.add(f.id)
                      setSelected(next)
                    }}
                  />
                  <span style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)' }}>{f.name}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{f.specsCount} specs</span>
                </label>
              ))}
              {filtered.length === 0 && (
                <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 32 }}>
                  No matching formats.
                </div>
              )}
            </div>

            {error && <div className="setup-error">{error}</div>}

            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost" onClick={onClose} style={{ flex: 1, justifyContent: 'center', padding: '11px 20px', fontSize: 14 }}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={doImport} disabled={importing || selected.size === 0} style={{ flex: 1, gap: 8, justifyContent: 'center', padding: '11px 20px', fontSize: 14 }}>
                {importing
                  ? <><div className="spinner" style={{ width: 15, height: 15, borderWidth: 2 }} /> Importing…</>
                  : <><Download size={15} /> Import{selected.size > 0 ? ` (${selected.size})` : ''}</>
                }
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  )
}

// ── Sync Log Tab ──────────────────────────────────────────────────────────────

function SyncLogTab({ logs }: { logs: TrashSyncLogEntry[] }) {
  if (logs.length === 0) {
    return (
      <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 32 }}>
        No sync history yet.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {logs.map(log => (
        <div key={log.id} style={{
          padding: '12px 16px', borderRadius: 10,
          background: 'var(--glass-bg)', border: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            {syncStatusBadge(log.status)}
            <span style={{ fontSize: 12, color: 'var(--text-muted)', flex: 1 }}>
              {fmtDate(log.started_at)}
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {fmtDuration(log.duration_ms)}
            </span>
            <span style={{
              fontSize: 11, padding: '2px 6px', borderRadius: 4,
              background: 'var(--glass-bg)', border: '1px solid var(--border)',
              color: 'var(--text-muted)',
            }}>
              {log.trigger}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-secondary)' }}>
            {log.formats_created > 0 && <span>+{log.formats_created} created</span>}
            {log.conditions_updated > 0 && <span>{log.conditions_updated} conditions</span>}
            {log.scores_updated > 0 && <span>{log.scores_updated} scores</span>}
            {log.formats_deprecated > 0 && <span>{log.formats_deprecated} deprecated</span>}
            {log.profiles_updated > 0 && <span>{log.profiles_updated} profiles</span>}
            {log.repaired_items > 0 && <span>{log.repaired_items} repaired</span>}
            {log.formats_created === 0 && log.conditions_updated === 0 && log.scores_updated === 0 &&
              log.formats_deprecated === 0 && log.profiles_updated === 0 && log.repaired_items === 0 && (
              <span style={{ color: 'var(--text-muted)' }}>No changes</span>
            )}
          </div>
          {log.error_message && (
            <div style={{ marginTop: 6, fontSize: 12, color: '#f87171', fontFamily: 'var(--font-mono)' }}>
              {log.error_message}
            </div>
          )}
          {log.github_sha && (
            <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              SHA: {log.github_sha.substring(0, 8)}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Formats Tab ───────────────────────────────────────────────────────────────

interface FormatRowEditState {
  score: string
  enabled: boolean
}

interface FormatsTabProps {
  instanceId: string
  formats: TrashFormatRow[]
}

function FormatsTab({ instanceId, formats }: FormatsTabProps) {
  const { saveOverrides } = useTrashStore()
  const [edits, setEdits] = useState<Record<string, FormatRowEditState>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'enabled' | 'overridden'>('all')

  const isDirty = Object.keys(edits).length > 0

  const displayed = formats.filter(f => {
    if (search && !f.name.toLowerCase().includes(search.toLowerCase()) &&
        !f.slug.toLowerCase().includes(search.toLowerCase())) return false
    if (filter === 'enabled') return f.enabled
    if (filter === 'overridden') return (f.score !== f.recommendedScore)
    return true
  })

  function getRow(f: TrashFormatRow): FormatRowEditState {
    return edits[f.slug] ?? { score: String(f.score), enabled: f.enabled }
  }

  function setScore(slug: string, value: string, original: TrashFormatRow) {
    const numVal = parseInt(value)
    const cur = edits[slug] ?? { score: String(original.score), enabled: original.enabled }
    const next = { ...cur, score: value }
    if (next.score === String(original.score) && next.enabled === original.enabled) {
      const e = { ...edits }; delete e[slug]; setEdits(e)
    } else {
      setEdits(e => ({ ...e, [slug]: next }))
    }
  }

  function setEnabled(slug: string, enabled: boolean, original: TrashFormatRow) {
    const cur = edits[slug] ?? { score: String(original.score), enabled: original.enabled }
    const next = { ...cur, enabled }
    if (next.score === String(original.score) && next.enabled === original.enabled) {
      const e = { ...edits }; delete e[slug]; setEdits(e)
    } else {
      setEdits(e => ({ ...e, [slug]: next }))
    }
  }

  async function saveAll() {
    setSaving(true)
    try {
      const overrides = Object.entries(edits).map(([slug, e]) => ({
        slug,
        score: parseInt(e.score) || 0,
        enabled: e.enabled,
      }))
      await saveOverrides(instanceId, overrides)
      setEdits({})
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {
      // keep edits
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <input
          className="form-input"
          placeholder="Search formats…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 180 }}
        />
        <select className="form-input" value={filter} onChange={e => setFilter(e.target.value as typeof filter)} style={{ width: 140 }}>
          <option value="all">All</option>
          <option value="enabled">Enabled</option>
          <option value="overridden">Overridden</option>
        </select>
        {isDirty && (
          <button className="btn-primary" onClick={saveAll} disabled={saving} style={{ whiteSpace: 'nowrap' }}>
            {saving ? <Loader size={14} className="spin" /> : saved ? <Check size={14} /> : <Check size={14} />}
            Save overrides
          </button>
        )}
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
        {displayed.length} of {formats.length} formats
        {isDirty && <span style={{ marginLeft: 8, color: 'var(--accent)' }}>{Object.keys(edits).length} unsaved changes</span>}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {displayed.map(f => {
          const row = getRow(f)
          const isEdited = !!edits[f.slug]
          return (
            <div key={f.slug} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '8px 12px', borderRadius: 8,
              background: isEdited ? 'var(--accent)0a' : 'var(--glass-bg)',
              border: `1px solid ${isEdited ? 'var(--accent)33' : 'var(--border)'}`,
            }}>
              <label className="form-toggle" style={{ flexShrink: 0, transform: 'scale(0.8)', transformOrigin: 'left center' }}>
                <input type="checkbox" checked={row.enabled} onChange={e => setEnabled(f.slug, e.target.checked, f)} />
              </label>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{f.slug}</div>
              </div>
              {f.deprecated && (
                <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: '#f59e0b22', color: '#f59e0b' }}>
                  deprecated
                </span>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>rec: {f.recommendedScore}</span>
                <input
                  type="number"
                  className="form-input"
                  value={row.score}
                  onChange={e => setScore(f.slug, e.target.value, f)}
                  style={{ width: 72, padding: '4px 8px', fontSize: 13, textAlign: 'right' }}
                />
              </div>
            </div>
          )
        })}
        {displayed.length === 0 && (
          <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 32 }}>
            No formats found.
          </div>
        )}
      </div>
    </div>
  )
}

// ── Deprecated Tab ────────────────────────────────────────────────────────────

interface DeprecatedTabProps {
  instanceId: string
  deprecated: TrashDeprecatedFormat[]
}

function DeprecatedTab({ instanceId, deprecated }: DeprecatedTabProps) {
  const { deleteDeprecated } = useTrashStore()
  const [deleting, setDeleting] = useState<string | null>(null)

  async function remove(slug: string) {
    setDeleting(slug)
    try { await deleteDeprecated(instanceId, slug) }
    catch { /* show nothing */ }
    finally { setDeleting(null) }
  }

  if (deprecated.length === 0) {
    return (
      <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 32 }}>
        No deprecated formats.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {deprecated.map(f => (
        <div key={f.slug} style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '10px 14px', borderRadius: 8,
          background: 'var(--glass-bg)', border: '1px solid var(--border)',
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{f.name}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Deprecated {fmtDate(f.deprecated_at)}
              {f.arr_format_id !== null && ` · Arr ID: ${f.arr_format_id}`}
            </div>
          </div>
          <button
            className="btn-secondary"
            style={{ padding: '4px 8px' }}
            onClick={() => remove(f.slug)}
            disabled={deleting === f.slug}
            title="Remove from deprecated list"
          >
            {deleting === f.slug ? <Loader size={12} className="spin" /> : <Trash2 size={12} />}
          </button>
        </div>
      ))}
    </div>
  )
}

// ── Instance Panel ─────────────────────────────────────────────────────────────

interface InstancePanelProps {
  config: TrashInstanceConfig
  instanceName: string
}

type TabId = 'formats' | 'deprecated' | 'log'

function InstancePanel({ config, instanceName }: InstancePanelProps) {
  const {
    profiles, formats, preview, syncLogs, deprecated, importable,
    loadFormats, loadPreview, loadSyncLog, loadDeprecated, loadImportable,
    triggerSync,
  } = useTrashStore()

  const [expanded, setExpanded] = useState(false)
  const [tab, setTab] = useState<TabId>('formats')
  const [showConfigure, setShowConfigure] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)

  const id = config.instance_id
  const myFormats = formats[id] ?? []
  const myPreview = preview[id]
  const myLogs = syncLogs[id] ?? []
  const myDeprecated = deprecated[id] ?? []
  const myImportable = importable[id] ?? []
  const myProfiles = profiles[id] ?? []

  useEffect(() => {
    if (!expanded) return
    Promise.all([
      loadFormats(id),
      loadPreview(id),
      loadSyncLog(id),
      loadDeprecated(id),
    ]).catch(() => {})
  }, [expanded, id])

  async function doSync() {
    setSyncing(true); setSyncError(null)
    try {
      await triggerSync(id)
      await Promise.all([loadPreview(id), loadSyncLog(id)])
    } catch (e: unknown) {
      setSyncError(e instanceof Error ? e.message : 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  async function openImport() {
    await loadImportable(id).catch(() => {})
    setShowImport(true)
  }

  const hasPendingPreview = myPreview !== null && myPreview !== undefined

  return (
    <div className="glass" style={{ borderRadius: 12, overflow: 'hidden' }}>
      {/* Header row */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 16px', cursor: 'pointer',
        }}
        onClick={() => setExpanded(v => !v)}
      >
        {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}

        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
              {instanceName}
            </span>
            <span style={{
              fontSize: 11, padding: '2px 6px', borderRadius: 4,
              background: 'var(--glass-bg)', border: '1px solid var(--border)',
              color: 'var(--text-muted)',
            }}>
              {config.arr_type}
            </span>
            {!config.enabled && (
              <span style={{
                fontSize: 11, padding: '2px 6px', borderRadius: 4,
                background: '#f8717122', color: '#f87171',
              }}>
                disabled
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            {config.profile_slug
              ? `Profile: ${config.profile_slug} · ${config.sync_mode} · every ${config.sync_interval_hours}h`
              : 'No profile configured'}
            {config.last_sync_at && ` · Last sync: ${fmtDate(config.last_sync_at)}`}
          </div>
        </div>

        {hasPendingPreview && (
          <span style={{
            fontSize: 11, padding: '3px 8px', borderRadius: 4,
            background: 'var(--accent)22', color: 'var(--accent)',
            fontWeight: 600,
          }}>
            Changes pending
          </span>
        )}

        <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
          {hasPendingPreview && (
            <button
              className="btn-primary"
              style={{ padding: '6px 10px', fontSize: 12 }}
              onClick={() => setShowPreview(true)}
            >
              <Eye size={12} /> Review
            </button>
          )}
          <button
            className="btn-secondary"
            style={{ padding: '6px 10px', fontSize: 12 }}
            onClick={doSync}
            disabled={syncing || config.isSyncing}
          >
            {syncing || config.isSyncing ? <Loader size={12} className="spin" /> : <RefreshCw size={12} />}
            Sync
          </button>
          <button
            className="btn-secondary"
            style={{ padding: '6px 10px', fontSize: 12 }}
            onClick={() => setShowConfigure(true)}
          >
            <Settings2 size={12} /> Configure
          </button>
        </div>
      </div>

      {syncError && (
        <div style={{ margin: '0 16px 12px', fontSize: 12, color: '#f87171', fontFamily: 'var(--font-mono)' }}>
          {syncError}
        </div>
      )}

      {/* Expanded content */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '16px' }}>
          {/* Tab bar */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 16, alignItems: 'center' }}>
            {(['formats', 'deprecated', 'log'] as TabId[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: '7px 14px', borderRadius: 'var(--radius-md)', fontSize: 13,
                  fontWeight: tab === t ? 600 : 400,
                  background: tab === t ? 'rgba(var(--accent-rgb), 0.12)' : 'transparent',
                  color: tab === t ? 'var(--accent)' : 'var(--text-secondary)',
                  border: tab === t ? '1px solid rgba(var(--accent-rgb), 0.25)' : '1px solid transparent',
                  cursor: 'pointer', transition: 'all 150ms ease',
                  fontFamily: 'var(--font-sans)',
                }}
              >
                {t === 'formats' && `Formats (${myFormats.length})`}
                {t === 'deprecated' && `Deprecated (${myDeprecated.length})`}
                {t === 'log' && 'Sync Log'}
              </button>
            ))}
            <div style={{ flex: 1 }} />
            {tab === 'formats' && (
              <button className="btn-secondary" style={{ padding: '5px 10px', fontSize: 12 }} onClick={openImport}>
                <Download size={12} /> Import from Arr
              </button>
            )}
          </div>

          {tab === 'formats' && <FormatsTab instanceId={id} formats={myFormats} />}
          {tab === 'deprecated' && <DeprecatedTab instanceId={id} deprecated={myDeprecated} />}
          {tab === 'log' && <SyncLogTab logs={myLogs} />}
        </div>
      )}

      {/* Modals */}
      {showConfigure && (
        <ConfigureModal
          config={config}
          profiles={myProfiles}
          onClose={() => setShowConfigure(false)}
        />
      )}
      {showPreview && myPreview && (
        <PreviewModal
          instanceId={id}
          preview={myPreview}
          onApply={() => { loadSyncLog(id).catch(() => {}) }}
          onClose={() => setShowPreview(false)}
        />
      )}
      {showImport && (
        <ImportModal
          instanceId={id}
          formats={myImportable}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function TrashPage({ embedded }: { embedded?: boolean }) {
  const { configs, loadConfigs, forceFetchGithub } = useTrashStore()
  const { instances: arrInstances } = useArrStore()
  const [loading, setLoading] = useState(true)
  const [fetching, setFetching] = useState(false)
  const [fetchResult, setFetchResult] = useState<{ sha: string; filesUpdated: number; formatsUpdated: number } | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)

  useEffect(() => {
    loadConfigs().catch(() => {}).finally(() => setLoading(false))
  }, [])

  // Map instance_id → display name from arr instances
  const nameMap = new Map(arrInstances.map(i => [i.id, i.name]))

  const radarrSonarr = arrInstances.filter(i => i.type === 'radarr' || i.type === 'sonarr')
  const configuredIds = new Set(configs.map(c => c.instance_id))
  const unconfigured = radarrSonarr.filter(i => !configuredIds.has(i.id))

  async function doForceFetch() {
    setFetching(true); setFetchResult(null); setFetchError(null)
    try {
      const res = await forceFetchGithub()
      setFetchResult(res)
    } catch (e: unknown) {
      setFetchError(e instanceof Error ? e.message : 'Fetch failed')
    } finally {
      setFetching(false)
    }
  }

  const inner = (
    <>
      {/* Page header — hidden when embedded as a tab */}
      {!embedded && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', margin: 0, fontFamily: 'var(--font-display)' }}>
              TRaSH Guides Sync
            </h1>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>
              Sync custom formats and quality profiles from the TRaSH Guides.
            </p>
          </div>
          <button
            className="btn-secondary"
            onClick={doForceFetch}
            disabled={fetching}
            title="Force-fetch latest TRaSH Guides data from GitHub"
          >
            {fetching ? <Loader size={14} className="spin" /> : <GitCommit size={14} />}
            Refresh from GitHub
          </button>
        </div>
      )}

      {/* GitHub refresh button row — shown only when embedded */}
      {embedded && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <button
            className="btn-secondary"
            onClick={doForceFetch}
            disabled={fetching}
            title="Force-fetch latest TRaSH Guides data from GitHub"
          >
            {fetching ? <Loader size={14} className="spin" /> : <GitCommit size={14} />}
            Refresh from GitHub
          </button>
        </div>
      )}

      {fetchResult && (
        <div style={{
          background: '#10b98111', border: '1px solid #10b98133',
          borderRadius: 10, padding: '10px 16px', marginBottom: 16,
          fontSize: 13, color: '#10b981', display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <CheckCircle size={14} />
          GitHub updated — SHA: {fetchResult.sha.substring(0, 8)} · {fetchResult.filesUpdated} files · {fetchResult.formatsUpdated} formats
        </div>
      )}
      {fetchError && (
        <div style={{
          background: '#f8717111', border: '1px solid #f8717133',
          borderRadius: 10, padding: '10px 16px', marginBottom: 16,
          fontSize: 13, color: '#f87171', display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <XCircle size={14} />
          {fetchError}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <Loader size={24} className="spin" style={{ color: 'var(--text-muted)' }} />
        </div>
      ) : (
        <>
          {/* Configured instances */}
          {configs.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
              {configs.map(config => (
                <InstancePanel
                  key={config.instance_id}
                  config={config}
                  instanceName={nameMap.get(config.instance_id) ?? config.instance_id}
                />
              ))}
            </div>
          )}

          {/* Unconfigured instances */}
          {unconfigured.length > 0 && (
            <div>
              <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px' }}>
                Not yet configured
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {unconfigured.map(inst => (
                  <UnconfiguredRow key={inst.id} instanceId={inst.id} instanceName={inst.name} arrType={inst.type as 'radarr' | 'sonarr'} />
                ))}
              </div>
            </div>
          )}

          {radarrSonarr.length === 0 && (
            <div style={{
              textAlign: 'center', padding: '48px 24px',
              background: 'var(--glass-bg)', borderRadius: 16, border: '1px solid var(--border)',
            }}>
              <Info size={32} style={{ color: 'var(--text-muted)', marginBottom: 12 }} />
              <div style={{ fontSize: 15, color: 'var(--text-primary)', fontWeight: 500, marginBottom: 8 }}>
                No Radarr or Sonarr instances
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                Add a Radarr or Sonarr instance on the Instances tab to use TRaSH Guides sync.
              </div>
            </div>
          )}
        </>
      )}
    </>
  )

  return embedded ? inner : <div className="content-inner">{inner}</div>
}

// ── Unconfigured Row ──────────────────────────────────────────────────────────

interface UnconfiguredRowProps {
  instanceId: string
  instanceName: string
  arrType: 'radarr' | 'sonarr'
}

function UnconfiguredRow({ instanceId, instanceName, arrType }: UnconfiguredRowProps) {
  const { configure, loadConfigs } = useTrashStore()
  const [enabling, setEnabling] = useState(false)

  async function enable() {
    setEnabling(true)
    try {
      await configure(instanceId, { enabled: true, sync_mode: 'notify' })
      await loadConfigs()
    } catch { /* ignore */ }
    finally { setEnabling(false) }
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 16px', borderRadius: 10,
      background: 'var(--glass-bg)', border: '1px solid var(--border)',
    }}>
      <div style={{ flex: 1 }}>
        <span style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 500 }}>{instanceName}</span>
        <span style={{
          marginLeft: 8, fontSize: 11, padding: '2px 6px', borderRadius: 4,
          background: 'var(--glass-bg)', border: '1px solid var(--border)',
          color: 'var(--text-muted)',
        }}>
          {arrType}
        </span>
      </div>
      <button className="btn-secondary" onClick={enable} disabled={enabling} style={{ fontSize: 12 }}>
        {enabling ? <Loader size={12} className="spin" /> : <Play size={12} />}
        Enable TRaSH sync
      </button>
    </div>
  )
}
