import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  RefreshCw, Settings2, Check, X, Loader,
  AlertTriangle, Trash2, Download, GitCommit, CheckCircle,
  XCircle, Info, Play, Plus, Save, ChevronDown, Search,
} from 'lucide-react'
import { useTrashStore } from '../store/useTrashStore'
import { useArrStore } from '../store/useArrStore'
import type {
  TrashFormatRow, TrashPreview, TrashSyncLogEntry, TrashDeprecatedFormat,
  TrashImportableFormat, TrashInstanceConfig, TrashProfileConfig, TrashProfileSummary,
} from '../types/trash'

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

// ── Add/Edit Profile Modal ────────────────────────────────────────────────────

interface ProfileConfigModalProps {
  instanceId: string
  existing?: TrashProfileConfig
  availableProfiles: TrashProfileSummary[]
  alreadyConfiguredSlugs: Set<string>
  onClose: () => void
}

function ProfileConfigModal({ instanceId, existing, availableProfiles, alreadyConfiguredSlugs, onClose }: ProfileConfigModalProps) {
  const { addProfileConfig, updateProfileConfig, loadProfiles } = useTrashStore()
  const isEdit = !!existing
  const [profileSlug, setProfileSlug] = useState(existing?.profile_slug ?? '')
  const [syncMode, setSyncMode] = useState<'auto' | 'manual' | 'notify'>(existing?.sync_mode ?? 'notify')
  const [intervalHours, setIntervalHours] = useState(existing?.sync_interval_hours ?? 24)
  const [enabled, setEnabled] = useState(existing?.enabled !== false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { loadProfiles(instanceId).catch(() => {}) }, [instanceId])

  async function save() {
    if (!isEdit && !profileSlug) { setError('Please select a profile'); return }
    setSaving(true); setError(null)
    try {
      if (isEdit) {
        await updateProfileConfig(instanceId, existing!.profile_slug, { sync_mode: syncMode, sync_interval_hours: intervalHours, enabled })
      } else {
        await addProfileConfig(instanceId, { profile_slug: profileSlug, sync_mode: syncMode, sync_interval_hours: intervalHours, enabled })
      }
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const selectable = availableProfiles.filter(p => !alreadyConfiguredSlugs.has(p.slug) || p.slug === existing?.profile_slug)

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="glass"
        onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 480, borderRadius: 'var(--radius-xl)', padding: '40px 40px 36px', animation: 'slide-up var(--transition-base)', position: 'relative' }}
      >
        <button className="btn btn-ghost btn-icon" onClick={onClose} style={{ position: 'absolute', top: 16, right: 16 }}><X size={16} /></button>
        <h2 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4, color: 'var(--text-primary)' }}>{isEdit ? 'Edit Profile' : 'Add Profile'}</h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 28, fontFamily: 'var(--font-mono)' }}>{instanceId}</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {!isEdit && (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Quality Profile</label>
              <select className="form-input" value={profileSlug} onChange={e => setProfileSlug(e.target.value)} style={{ fontSize: 14, padding: '10px 12px' }}>
                <option value="">— Select a profile —</option>
                {selectable.map(p => <option key={p.slug} value={p.slug}>{p.name} ({p.formatCount} formats)</option>)}
              </select>
            </div>
          )}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Sync Mode</label>
            <select className="form-input" value={syncMode} onChange={e => setSyncMode(e.target.value as typeof syncMode)} style={{ fontSize: 14, padding: '10px 12px' }}>
              <option value="notify">Notify — preview changes before applying</option>
              <option value="auto">Auto — apply automatically on schedule</option>
              <option value="manual">Manual — only sync when triggered</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Sync Interval (hours)</label>
            <input className="form-input" type="number" min={1} max={168} value={intervalHours} onChange={e => setIntervalHours(Number(e.target.value))} style={{ fontSize: 14, padding: '10px 12px' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <label className="form-toggle"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} /></label>
            <span style={{ fontSize: 14, color: 'var(--text-primary)' }}>Enabled</span>
          </div>
        </div>

        {error && <div className="setup-error" style={{ marginTop: 16 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 8, marginTop: 28 }}>
          <button className="btn btn-ghost" onClick={onClose} style={{ flex: 1, justifyContent: 'center', padding: '11px 20px', fontSize: 14 }}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving} style={{ flex: 1, gap: 8, justifyContent: 'center', padding: '11px 20px', fontSize: 14 }}>
            {saving ? <Loader size={15} className="spin" /> : <Check size={15} />}
            {isEdit ? 'Save changes' : 'Add profile'}
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
  profileSlugs: string[]
  onClose: () => void
}

function ImportModal({ instanceId, formats, profileSlugs, onClose }: ImportModalProps) {
  const { importFormats } = useTrashStore()
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [profileSlug, setProfileSlug] = useState(profileSlugs[0] ?? '')
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
      const res = await importFormats(instanceId, Array.from(selected), profileSlug || undefined)
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
        style={{ width: '100%', maxWidth: 540, maxHeight: '82vh', borderRadius: 'var(--radius-xl)', padding: '32px', animation: 'slide-up var(--transition-base)', position: 'relative', display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        <button className="btn btn-ghost btn-icon" onClick={onClose} style={{ position: 'absolute', top: 16, right: 16 }}><X size={16} /></button>

        {result ? (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <CheckCircle size={48} style={{ color: '#10b981', marginBottom: 16 }} />
            <h2 style={{ fontSize: 22, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>Import complete</h2>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{result.imported} format{result.imported !== 1 ? 's' : ''} imported successfully.</p>
            <button className="btn btn-primary" onClick={onClose} style={{ marginTop: 24, padding: '11px 32px', fontSize: 14, justifyContent: 'center' }}>Done</button>
          </div>
        ) : (
          <>
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4, color: 'var(--text-primary)' }}>Import Formats from Arr</h2>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Select existing custom formats to import and link to a profile.</p>
            </div>
            {profileSlugs.length > 0 && (
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: 12 }}>Link to profile (optional)</label>
                <select className="form-input" value={profileSlug} onChange={e => setProfileSlug(e.target.value)} style={{ fontSize: 13, padding: '8px 10px' }}>
                  <option value="">— No profile (unlinked) —</option>
                  {profileSlugs.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Linked formats are synced with that profile and never overwritten by TRaSH.</p>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="form-input" placeholder="Search formats…" value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 1, fontSize: 14, padding: '10px 12px' }} autoFocus />
              <button className="btn btn-ghost" onClick={toggleAll} style={{ whiteSpace: 'nowrap', fontSize: 13 }}>
                {selected.size === filtered.length ? 'Deselect all' : 'Select all'}
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, minHeight: 0 }}>
              {filtered.map(f => (
                <label key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 'var(--radius-sm)', background: selected.has(f.id) ? 'rgba(var(--accent-rgb),0.08)' : 'var(--glass-bg)', border: `1px solid ${selected.has(f.id) ? 'rgba(var(--accent-rgb),0.3)' : 'var(--border)'}`, cursor: 'pointer' }}>
                  <input type="checkbox" checked={selected.has(f.id)} onChange={() => {
                    const next = new Set(selected)
                    if (next.has(f.id)) next.delete(f.id); else next.add(f.id)
                    setSelected(next)
                  }} />
                  <span style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)' }}>{f.name}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{f.specsCount} specs</span>
                </label>
              ))}
              {filtered.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 32 }}>No matching formats.</div>}
            </div>
            {error && <div className="setup-error">{error}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost" onClick={onClose} style={{ flex: 1, justifyContent: 'center', padding: '11px 20px', fontSize: 14 }}>Cancel</button>
              <button className="btn btn-primary" onClick={doImport} disabled={importing || selected.size === 0} style={{ flex: 1, gap: 8, justifyContent: 'center', padding: '11px 20px', fontSize: 14 }}>
                {importing ? <><div className="spinner" style={{ width: 15, height: 15, borderWidth: 2 }} /> Importing…</> : <><Download size={15} /> Import{selected.size > 0 ? ` (${selected.size})` : ''}</>}
              </button>
            </div>
          </>
        )}
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
      await applyPreview(instanceId, preview.id, preview.profileSlug)
      onApply()
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Apply failed')
    } finally {
      setApplying(false)
    }
  }

  const typeLabels: Record<string, string> = {
    add: 'Add', update_conditions: 'Update conditions', deprecate: 'Deprecate', update_score: 'Update score', repair: 'Repair',
  }

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="glass"
        onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 620, maxHeight: '82vh', borderRadius: 'var(--radius-xl)', padding: '32px', animation: 'slide-up var(--transition-base)', position: 'relative', display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        <button className="btn btn-ghost btn-icon" onClick={onClose} style={{ position: 'absolute', top: 16, right: 16 }}><X size={16} /></button>

        <div>
          <h2 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4, color: 'var(--text-primary)' }}>Pending Changes</h2>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, fontFamily: 'var(--font-mono)' }}>Profile: {preview.profileSlug}</div>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            {preview.summary.formatsAdded > 0 && <span style={{ color: '#10b981', fontSize: 13 }}>+{preview.summary.formatsAdded} formats</span>}
            {preview.summary.conditionsUpdated > 0 && <span style={{ color: 'var(--accent)', fontSize: 13 }}>{preview.summary.conditionsUpdated} condition updates</span>}
            {preview.summary.profilesUpdated > 0 && <span style={{ color: 'var(--accent)', fontSize: 13 }}>{preview.summary.profilesUpdated} profile updates</span>}
            {preview.summary.formatsDeprecated > 0 && <span style={{ color: '#f59e0b', fontSize: 13 }}>{preview.summary.formatsDeprecated} deprecated</span>}
            {preview.summary.repairItems > 0 && <span style={{ color: '#f59e0b', fontSize: 13 }}>{preview.summary.repairItems} repairs</span>}
          </div>
        </div>

        {preview.stale && (
          <div style={{ background: '#f59e0b22', border: '1px solid #f59e0b44', borderRadius: 'var(--radius-md)', padding: '10px 14px', color: '#f59e0b', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={14} />
            Preview is stale — a newer GitHub commit exists. Re-trigger sync to refresh.
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, minHeight: 0 }}>
          {preview.changes.map((ch, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '8px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--glass-bg)', border: '1px solid var(--border)' }}>
              <span style={{ minWidth: 130, fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: 'rgba(var(--accent-rgb),0.12)', color: 'var(--accent)', whiteSpace: 'nowrap' }}>
                {typeLabels[ch.type] ?? ch.type}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{ch.name}</div>
                {ch.detail && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{ch.detail}</div>}
              </div>
            </div>
          ))}
          {preview.changes.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 24 }}>No changes in preview.</div>}
        </div>

        {error && <div className="setup-error">{error}</div>}

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" onClick={onClose} style={{ flex: 1, justifyContent: 'center', padding: '11px 20px', fontSize: 14 }}>Close</button>
          <button className="btn btn-primary" onClick={apply} disabled={applying || preview.stale} style={{ flex: 1, gap: 8, justifyContent: 'center', padding: '11px 20px', fontSize: 14 }}>
            {applying ? <><div className="spinner" style={{ width: 15, height: 15, borderWidth: 2 }} /> Applying…</> : <><Play size={15} /> Apply Changes</>}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ── Sync Log ──────────────────────────────────────────────────────────────────

function SyncLogTab({ logs }: { logs: TrashSyncLogEntry[] }) {
  if (logs.length === 0) return (
    <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 32 }}>No sync history yet.</div>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {logs.map(log => (
        <div key={log.id} style={{ padding: '12px 16px', borderRadius: 10, background: 'var(--glass-bg)', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
            {syncStatusBadge(log.status)}
            {log.profile_slug && (
              <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: 'rgba(var(--accent-rgb),0.1)', color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
                {log.profile_slug}
              </span>
            )}
            <span style={{ fontSize: 12, color: 'var(--text-muted)', flex: 1 }}>{fmtDate(log.started_at)}</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtDuration(log.duration_ms)}</span>
            <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: 'var(--glass-bg)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>{log.trigger}</span>
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-secondary)' }}>
            {log.formats_created > 0 && <span>+{log.formats_created} created</span>}
            {log.conditions_updated > 0 && <span>{log.conditions_updated} conditions</span>}
            {log.scores_updated > 0 && <span>{log.scores_updated} scores</span>}
            {log.formats_deprecated > 0 && <span>{log.formats_deprecated} deprecated</span>}
            {log.profiles_updated > 0 && <span>{log.profiles_updated} profiles</span>}
            {log.repaired_items > 0 && <span>{log.repaired_items} repaired</span>}
            {log.formats_created === 0 && log.conditions_updated === 0 && log.scores_updated === 0 &&
              log.formats_deprecated === 0 && log.profiles_updated === 0 && log.repaired_items === 0 &&
              <span style={{ color: 'var(--text-muted)' }}>No changes</span>
            }
          </div>
          {log.error_message && <div style={{ marginTop: 6, fontSize: 12, color: '#f87171', fontFamily: 'var(--font-mono)' }}>{log.error_message}</div>}
          {log.github_sha && <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>SHA: {log.github_sha.substring(0, 8)}</div>}
        </div>
      ))}
    </div>
  )
}

// ── Deprecated Tab ────────────────────────────────────────────────────────────

function DeprecatedTab({ instanceId, deprecated }: { instanceId: string; deprecated: TrashDeprecatedFormat[] }) {
  const { deleteDeprecated } = useTrashStore()
  const [deleting, setDeleting] = useState<string | null>(null)

  async function remove(slug: string) {
    setDeleting(slug)
    try { await deleteDeprecated(instanceId, slug) } catch { /* ignore */ }
    finally { setDeleting(null) }
  }

  if (deprecated.length === 0) return (
    <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 32 }}>No deprecated formats.</div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {deprecated.map(f => (
        <div key={f.slug} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 8, background: 'var(--glass-bg)', border: '1px solid var(--border)' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{f.name}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Deprecated {fmtDate(f.deprecated_at)}{f.arr_format_id !== null && ` · Arr ID: ${f.arr_format_id}`}
            </div>
          </div>
          <button className="btn btn-danger btn-sm btn-icon" onClick={() => remove(f.slug)} disabled={deleting === f.slug} title="Remove from arr">
            {deleting === f.slug ? <Loader size={12} className="spin" /> : <Trash2 size={12} />}
          </button>
        </div>
      ))}
    </div>
  )
}

// ── Unconfigured Row ──────────────────────────────────────────────────────────

function UnconfiguredRow({ instanceId, instanceName, arrType }: { instanceId: string; instanceName: string; arrType: 'radarr' | 'sonarr' }) {
  const { configure } = useTrashStore()
  const [enabling, setEnabling] = useState(false)

  async function enable() {
    setEnabling(true)
    try { await configure(instanceId, { enabled: true, sync_mode: 'notify' }) } catch { /* ignore */ }
    finally { setEnabling(false) }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 10, background: 'var(--glass-bg)', border: '1px solid var(--border)' }}>
      <div style={{ flex: 1 }}>
        <span style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 500 }}>{instanceName}</span>
        <span style={{ marginLeft: 8, fontSize: 11, padding: '2px 6px', borderRadius: 4, background: 'var(--glass-bg)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>{arrType}</span>
      </div>
      <button className="btn btn-primary btn-sm" onClick={enable} disabled={enabling}>
        {enabling ? <Loader size={13} className="spin" /> : <Play size={13} />}
        Enable TRaSH sync
      </button>
    </div>
  )
}

// ── Profile Editor (inline format table) ─────────────────────────────────────
//
// This is the core editing panel for a single profile.
// Replaces the old FormatsModal approach with inline, always-visible editing.
// Save applies overrides to DB; Sync triggers the backend sync to arr.

type EditRow = { score: string; enabled: boolean; excluded: boolean }
type BottomTab = 'log' | 'deprecated'

interface ProfileEditorProps {
  instanceId: string
  profileCfg: TrashProfileConfig
  profileName: string
  isSyncing: boolean
  isAdmin: boolean
  profileSlugs: string[]  // all configured profile slugs (for import modal)
}

function ProfileEditor({ instanceId, profileCfg, profileName, isSyncing, isAdmin, profileSlugs }: ProfileEditorProps) {
  const {
    formats, preview, syncLogs, deprecated, importable,
    loadFormats, loadPreview, loadSyncLog, loadDeprecated, loadImportable,
    saveOverrides, triggerSync, updateProfileConfig, removeUserFormat, loadAllFormats,
  } = useTrashStore()

  const profileSlug = profileCfg.profile_slug
  const profileKey = `${instanceId}:${profileSlug}`
  const myFormats = formats[profileKey] ?? []
  const myPreview = preview[profileKey]
  const myLogs = syncLogs[instanceId] ?? []
  const lastProfileLog = myLogs.find(l => l.profile_slug === profileSlug) ?? null
  const myDeprecated = deprecated[instanceId] ?? []
  const myImportable = importable[instanceId] ?? []

  const [edits, setEdits] = useState<Record<string, EditRow>>({})
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'enabled' | 'excluded' | 'overridden'>('all')
  const [loadingFormats, setLoadingFormats] = useState(false)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [saveOk, setSaveOk] = useState(false)
  const [bottomTab, setBottomTab] = useState<BottomTab>('log')
  const [showImport, setShowImport] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [editProfileCfg, setEditProfileCfg] = useState(false)

  const isDirty = Object.keys(edits).length > 0
  const hasPendingPreview = myPreview !== null && myPreview !== undefined

  // Load formats + preview when profile is selected
  useEffect(() => {
    setEdits({})
    setSearch('')
    setFilter('all')
    setLoadingFormats(true)
    Promise.all([
      loadFormats(instanceId, profileSlug),
      loadPreview(instanceId, profileSlug),
      loadSyncLog(instanceId),
    ]).catch(() => {}).finally(() => setLoadingFormats(false))
  }, [instanceId, profileSlug])

  // Load bottom tab data lazily
  useEffect(() => {
    if (bottomTab === 'log') loadSyncLog(instanceId).catch(() => {})
    if (bottomTab === 'deprecated') loadDeprecated(instanceId).catch(() => {})
  }, [bottomTab, instanceId])

  function getRow(f: TrashFormatRow): EditRow {
    return edits[f.slug] ?? { score: String(f.score), enabled: f.enabled, excluded: f.excluded }
  }

  function isClean(next: EditRow, original: TrashFormatRow): boolean {
    return next.score === String(original.score) && next.enabled === original.enabled && next.excluded === original.excluded
  }

  function applyEdit(slug: string, next: EditRow, original: TrashFormatRow) {
    if (isClean(next, original)) {
      setEdits(e => { const copy = { ...e }; delete copy[slug]; return copy })
    } else {
      setEdits(e => ({ ...e, [slug]: next }))
    }
  }

  function setScore(slug: string, value: string, original: TrashFormatRow) {
    const cur = edits[slug] ?? { score: String(original.score), enabled: original.enabled, excluded: original.excluded }
    applyEdit(slug, { ...cur, score: value }, original)
  }

  function setEnabled(slug: string, val: boolean, original: TrashFormatRow) {
    const cur = edits[slug] ?? { score: String(original.score), enabled: original.enabled, excluded: original.excluded }
    applyEdit(slug, { ...cur, enabled: val }, original)
  }

  function setExcluded(slug: string, val: boolean, original: TrashFormatRow) {
    const cur = edits[slug] ?? { score: String(original.score), enabled: original.enabled, excluded: original.excluded }
    applyEdit(slug, { ...cur, excluded: val }, original)
  }

  async function doSave() {
    if (!isDirty) return
    setSaving(true); setSaveOk(false)
    try {
      const overrides = Object.entries(edits).map(([slug, e]) => ({
        slug, score: parseInt(e.score) || 0, enabled: e.enabled, excluded: e.excluded,
      }))
      await saveOverrides(instanceId, profileSlug, overrides)
      await loadFormats(instanceId, profileSlug)
      setEdits({})
      setSaveOk(true)
      setTimeout(() => setSaveOk(false), 2500)
    } catch { /* keep edits */ }
    finally { setSaving(false) }
  }

  async function doSync() {
    // Auto-save pending edits before syncing
    if (isDirty) await doSave()
    setSyncing(true)
    try {
      await triggerSync(instanceId, profileSlug)
      await loadPreview(instanceId, profileSlug)
      setBottomTab('log')
      loadSyncLog(instanceId).catch(() => {})
    } catch { /* ignore */ }
    finally { setSyncing(false) }
  }

  async function openImport() {
    await loadImportable(instanceId).catch(() => {})
    setShowImport(true)
  }

  // Filtering
  const trashFormats = myFormats.filter(f => !f.isUserFormat)
  const userFormats = myFormats.filter(f => f.isUserFormat)

  function matchesSearch(f: TrashFormatRow): boolean {
    if (!search) return true
    const q = search.toLowerCase()
    return f.name.toLowerCase().includes(q) || f.slug.toLowerCase().includes(q)
  }

  function matchesFilter(f: TrashFormatRow): boolean {
    const row = getRow(f)
    if (filter === 'enabled') return row.enabled && !row.excluded
    if (filter === 'excluded') return row.excluded
    if (filter === 'overridden') return row.score !== String(f.recommendedScore) || !row.enabled || row.excluded
    return true
  }

  const visibleTrash = trashFormats.filter(f => matchesSearch(f) && matchesFilter(f))
  const visibleUser = userFormats.filter(f => matchesSearch(f))

  const totalVisible = visibleTrash.length + visibleUser.length
  const editCount = Object.keys(edits).length

  if (loadingFormats) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 64 }}>
        <Loader size={20} className="spin" style={{ color: 'var(--text-muted)' }} />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

      {/* ── Sync bar ─── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        padding: '12px 16px', background: 'var(--glass-bg)',
        borderBottom: '1px solid var(--border)',
      }}>
        {/* Profile meta */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 180, flexWrap: 'wrap' }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: profileCfg.enabled ? '#10b981' : 'var(--text-muted)', flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Last sync: {fmtDate(profileCfg.last_sync_at)}
          </span>
          {lastProfileLog && syncStatusBadge(lastProfileLog.status)}
          <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: 'rgba(var(--accent-rgb),0.08)', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            {profileCfg.sync_mode}
          </span>
          {!profileCfg.enabled && (
            <span style={{ fontSize: 11, padding: '2px 5px', borderRadius: 3, background: '#f8717122', color: '#f87171' }}>disabled</span>
          )}
        </div>

        {/* Pending preview badge */}
        {hasPendingPreview && (
          <button
            className="btn btn-sm"
            onClick={() => setShowPreview(true)}
            style={{ background: 'rgba(var(--accent-rgb),0.12)', border: '1px solid rgba(var(--accent-rgb),0.3)', color: 'var(--accent)', fontWeight: 600, fontSize: 12 }}
          >
            ● Review pending changes
          </button>
        )}

        {/* Unsaved changes indicator */}
        {isDirty && (
          <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 500 }}>
            {editCount} unsaved change{editCount !== 1 ? 's' : ''}
          </span>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {isAdmin && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => updateProfileConfig(instanceId, profileSlug, { enabled: !profileCfg.enabled })}
              title={profileCfg.enabled ? 'Disable sync for this profile' : 'Enable sync for this profile'}
              style={{ fontSize: 11, color: profileCfg.enabled ? '#10b981' : 'var(--text-muted)' }}
            >
              {profileCfg.enabled ? 'Enabled' : 'Disabled'}
            </button>
          )}
          {isAdmin && (
            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setEditProfileCfg(true)} title="Profile settings">
              <Settings2 size={13} />
            </button>
          )}
          {isDirty && isAdmin && (
            <button className="btn btn-ghost btn-sm" onClick={doSave} disabled={saving} title="Save overrides to database">
              {saving ? <Loader size={13} className="spin" /> : saveOk ? <Check size={13} style={{ color: '#10b981' }} /> : <Save size={13} />}
              Save
            </button>
          )}
          {isAdmin && (
            <button className="btn btn-primary btn-sm" onClick={doSync} disabled={syncing || isSyncing} title="Sync this profile to arr now">
              {(syncing || isSyncing) ? <Loader size={13} className="spin" /> : <RefreshCw size={13} />}
              Sync now
            </button>
          )}
        </div>
      </div>

      {/* ── Search & filter bar ─── */}
      <div style={{
        display: 'flex', gap: 8, padding: '10px 16px', alignItems: 'center',
        background: 'var(--glass-bg)', borderBottom: '1px solid var(--border)',
        flexWrap: 'wrap',
      }}>
        <input
          className="form-input"
          placeholder="Search formats…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 160, padding: '7px 10px', fontSize: 13 }}
        />
        <select
          className="form-input"
          value={filter}
          onChange={e => setFilter(e.target.value as typeof filter)}
          style={{ width: 140, padding: '7px 10px', fontSize: 13 }}
        >
          <option value="all">All ({myFormats.length})</option>
          <option value="enabled">Enabled</option>
          <option value="excluded">Excluded</option>
          <option value="overridden">Overridden</option>
        </select>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
          {totalVisible} shown
        </span>
        {isAdmin && (
          <button className="btn btn-ghost btn-sm" onClick={openImport} style={{ whiteSpace: 'nowrap' }}>
            <Download size={13} /> Import from Arr
          </button>
        )}
      </div>

      {/* ── Format table ─── */}
      <div style={{ flex: 1, overflowY: 'auto', maxHeight: '45vh', minHeight: 200 }}>

        {/* TRaSH formats */}
        {visibleTrash.length > 0 && (
          <div>
            <div style={{ padding: '8px 16px 4px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', background: 'var(--glass-bg)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 1 }}>
              TRaSH formats · {visibleTrash.length}
            </div>
            {visibleTrash.map(f => {
              const row = getRow(f)
              const isEdited = !!edits[f.slug]
              const isExcluded = row.excluded

              return (
                <div key={f.slug} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '7px 16px',
                  opacity: isExcluded ? 0.45 : 1,
                  background: isEdited ? 'rgba(var(--accent-rgb),0.04)' : 'transparent',
                  borderBottom: '1px solid var(--border)',
                  transition: 'opacity var(--transition-fast)',
                }}>
                  {/* Enabled toggle */}
                  <label className="form-toggle" style={{ flexShrink: 0, transform: 'scale(0.75)', transformOrigin: 'left center' }} title={isExcluded ? 'Format is excluded from sync' : 'Enable in quality profile'}>
                    <input
                      type="checkbox"
                      checked={row.enabled && !isExcluded}
                      disabled={isExcluded}
                      onChange={e => setEnabled(f.slug, e.target.checked, f)}
                    />
                  </label>

                  {/* Name + slug */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 13, fontWeight: 500,
                      color: isExcluded ? 'var(--text-muted)' : 'var(--text-primary)',
                      textDecoration: isExcluded ? 'line-through' : 'none',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {f.name}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{f.slug}</div>
                  </div>

                  {/* Badges */}
                  {f.deprecated && (
                    <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: '#f59e0b22', color: '#f59e0b', flexShrink: 0 }}>deprecated</span>
                  )}
                  {isEdited && (
                    <span style={{ fontSize: 10, padding: '2px 5px', borderRadius: 3, background: 'rgba(var(--accent-rgb),0.15)', color: 'var(--accent)', flexShrink: 0, fontWeight: 600 }}>edited</span>
                  )}

                  {/* Score + exclude controls */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 60, textAlign: 'right' }}>
                      rec: {f.recommendedScore}
                    </span>
                    <input
                      type="number"
                      className="form-input"
                      value={row.score}
                      disabled={isExcluded}
                      onChange={e => setScore(f.slug, e.target.value, f)}
                      style={{ width: 76, padding: '4px 8px', fontSize: 13, textAlign: 'right' }}
                    />
                    <button
                      title={isExcluded ? 'Include in sync' : 'Exclude from sync (format will not be created in arr)'}
                      onClick={() => setExcluded(f.slug, !isExcluded, f)}
                      style={{
                        width: 64, padding: '4px 0', borderRadius: 6, fontSize: 11, fontWeight: 600,
                        cursor: 'pointer', textAlign: 'center',
                        border: `1px solid ${isExcluded ? '#f8717155' : 'var(--border)'}`,
                        background: isExcluded ? '#f8717122' : 'transparent',
                        color: isExcluded ? '#f87171' : 'var(--text-muted)',
                        transition: 'all var(--transition-fast)',
                      }}
                    >
                      {isExcluded ? 'excluded' : 'skip'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* User custom formats */}
        {visibleUser.length > 0 && (
          <div>
            <div style={{ padding: '8px 16px 4px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', background: 'var(--glass-bg)', borderBottom: '1px solid var(--border)', borderTop: visibleTrash.length > 0 ? '2px solid var(--border)' : undefined, position: 'sticky', top: 0, zIndex: 1 }}>
              User custom formats · {visibleUser.length}
            </div>
            {visibleUser.map(f => (
              <div key={f.slug} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 16px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{f.slug}</div>
                </div>
                <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: 'rgba(var(--accent-rgb),0.12)', color: 'var(--accent)', flexShrink: 0, fontWeight: 600 }}>custom</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
                  {f.arrFormatId !== null ? `Arr ID: ${f.arrFormatId}` : 'pending creation'}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', flexShrink: 0, minWidth: 60, textAlign: 'right' }}>
                  score: {f.score}
                </span>
                {isAdmin && (
                  <button
                    className="btn btn-ghost btn-icon"
                    title="Remove from this profile"
                    style={{ padding: 4, flexShrink: 0, color: 'var(--text-muted)' }}
                    onClick={async () => {
                      await removeUserFormat(instanceId, f.slug, profileSlug)
                      await Promise.all([loadFormats(instanceId, profileSlug), loadAllFormats(instanceId)])
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {totalVisible === 0 && (
          <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 48, lineHeight: 1.6 }}>
            {search || filter !== 'all'
              ? 'No formats match your filter.'
              : <>No formats found for this profile.<br />If TRaSH data hasn&rsquo;t been loaded yet, use &ldquo;Refresh from GitHub&rdquo; above or click &ldquo;Browse Formats&rdquo; to check what&rsquo;s available.</>
            }
          </div>
        )}
      </div>

      {/* ── Bottom tabs: Log + Deprecated ─── */}
      <div style={{ borderTop: '2px solid var(--border)' }}>
        <div style={{ display: 'flex', gap: 2, padding: '8px 16px 0', background: 'var(--glass-bg)' }}>
          {(['log', 'deprecated'] as BottomTab[]).map(t => (
            <button
              key={t}
              onClick={() => setBottomTab(t)}
              style={{
                padding: '6px 14px', borderRadius: 'var(--radius-md)', fontSize: 12,
                fontWeight: bottomTab === t ? 600 : 400,
                background: bottomTab === t ? 'rgba(var(--accent-rgb), 0.12)' : 'transparent',
                color: bottomTab === t ? 'var(--accent)' : 'var(--text-secondary)',
                border: bottomTab === t ? '1px solid rgba(var(--accent-rgb), 0.25)' : '1px solid transparent',
                cursor: 'pointer', fontFamily: 'var(--font-sans)',
              }}
            >
              {t === 'log' && 'Sync Log'}
              {t === 'deprecated' && `Deprecated${myDeprecated.length > 0 ? ` (${myDeprecated.length})` : ''}`}
            </button>
          ))}
        </div>
        <div style={{ padding: '12px 16px', maxHeight: 240, overflowY: 'auto' }}>
          {bottomTab === 'log' && <SyncLogTab logs={myLogs} />}
          {bottomTab === 'deprecated' && <DeprecatedTab instanceId={instanceId} deprecated={myDeprecated} />}
        </div>
      </div>

      {/* ── Modals ─── */}
      {showImport && (
        <ImportModal instanceId={instanceId} formats={myImportable} profileSlugs={profileSlugs} onClose={() => { setShowImport(false); loadFormats(instanceId, profileSlug).catch(() => {}) }} />
      )}
      {showPreview && myPreview && (
        <PreviewModal
          instanceId={instanceId}
          preview={myPreview}
          onApply={() => loadPreview(instanceId, profileSlug).catch(() => {})}
          onClose={() => setShowPreview(false)}
        />
      )}
      {editProfileCfg && (
        <ProfileConfigModal
          instanceId={instanceId}
          existing={profileCfg}
          availableProfiles={[]}
          alreadyConfiguredSlugs={new Set()}
          onClose={() => setEditProfileCfg(false)}
        />
      )}
    </div>
  )
}

// ── Browse Formats Modal ──────────────────────────────────────────────────────
//
// Read-only view of ALL TRaSH custom formats for this instance's arr type.

interface BrowseFormatsModalProps {
  instanceId: string
  onClose: () => void
}

function BrowseFormatsModal({ instanceId, onClose }: BrowseFormatsModalProps) {
  const { allFormats, loadAllFormats } = useTrashStore()
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<'all' | 'trash' | 'custom'>('all')
  const [loading, setLoading] = useState(false)

  const formats = allFormats[instanceId] ?? []

  useEffect(() => {
    if (!allFormats[instanceId]) {
      setLoading(true)
      loadAllFormats(instanceId).catch(() => {}).finally(() => setLoading(false))
    }
  }, [instanceId])

  const trashFormats = formats.filter(f => !f.isUserFormat)
  const userFormats = formats.filter(f => f.isUserFormat)

  function matchesSearch(f: TrashFormatRow): boolean {
    if (!search) return true
    const q = search.toLowerCase()
    return f.name.toLowerCase().includes(q) || f.slug.toLowerCase().includes(q)
  }

  const visibleTrash = filterType !== 'custom' ? trashFormats.filter(matchesSearch) : []
  const visibleUser = filterType !== 'trash' ? userFormats.filter(matchesSearch) : []

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="glass"
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 680, maxHeight: '85vh',
          borderRadius: 'var(--radius-xl)', padding: '32px',
          animation: 'slide-up var(--transition-base)', position: 'relative',
          display: 'flex', flexDirection: 'column', gap: 16,
        }}
      >
        <button className="btn btn-ghost btn-icon" onClick={onClose} style={{ position: 'absolute', top: 16, right: 16 }}>
          <X size={16} />
        </button>

        <div>
          <h2 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4, color: 'var(--text-primary)' }}>Browse Formats</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
            All custom formats available for this instance. Edit scores and overrides within a profile tab.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
            <input
              className="form-input"
              placeholder="Search by name or slug…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', padding: '9px 10px 9px 30px', fontSize: 13 }}
              autoFocus
            />
          </div>
          <select
            className="form-input"
            value={filterType}
            onChange={e => setFilterType(e.target.value as typeof filterType)}
            style={{ width: 180, padding: '9px 10px', fontSize: 13 }}
          >
            <option value="all">All ({formats.length})</option>
            <option value="trash">TRaSH formats ({trashFormats.length})</option>
            <option value="custom">User custom ({userFormats.length})</option>
          </select>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 64 }}>
              <Loader size={20} className="spin" style={{ color: 'var(--text-muted)' }} />
            </div>
          ) : formats.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 48 }}>
              No formats cached. Use &ldquo;Refresh from GitHub&rdquo; to populate.
            </div>
          ) : (
            <>
              {filterType !== 'custom' && (
                <div>
                  <div style={{ padding: '8px 16px 4px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', background: 'var(--glass-bg)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 1 }}>
                    TRaSH formats · {visibleTrash.length}
                  </div>
                  {visibleTrash.length === 0 ? (
                    <div style={{ padding: '24px', fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>No TRaSH formats match your search.</div>
                  ) : visibleTrash.map(f => (
                    <div key={f.slug} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{f.slug}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        {f.deprecated && <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: '#f59e0b22', color: '#f59e0b' }}>deprecated</span>}
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'var(--glass-bg)', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                          rec: {f.recommendedScore}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {filterType !== 'trash' && userFormats.length > 0 && (
                <div>
                  <div style={{ padding: '8px 16px 4px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', background: 'var(--glass-bg)', borderBottom: '1px solid var(--border)', borderTop: filterType === 'all' && trashFormats.length > 0 ? '2px solid var(--border)' : undefined, position: 'sticky', top: 0, zIndex: 1 }}>
                    User custom formats · {visibleUser.length}
                  </div>
                  {visibleUser.length === 0 ? (
                    <div style={{ padding: '24px', fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>No custom formats match your search.</div>
                  ) : visibleUser.map(f => (
                    <div key={f.slug} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{f.slug}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        {f.deprecated && <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: '#f59e0b22', color: '#f59e0b' }}>deprecated</span>}
                        <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: 'rgba(var(--accent-rgb),0.12)', color: 'var(--accent)', fontWeight: 600 }}>custom</span>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: 'var(--glass-bg)', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                          rec: {f.recommendedScore}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {filterType === 'custom' && userFormats.length === 0 && (
                <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 48 }}>No user custom formats imported yet.</div>
              )}
            </>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose} style={{ padding: '10px 24px', fontSize: 14 }}>Close</button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ── Instance Editor ───────────────────────────────────────────────────────────
//
// Shows one configured instance: a profile tab bar + the selected profile's editor.

interface InstanceEditorProps {
  config: TrashInstanceConfig
  instanceName: string
  isAdmin: boolean
}

function InstanceEditor({ config, instanceName, isAdmin }: InstanceEditorProps) {
  const { profiles, loadProfiles, triggerSync, configure, deleteProfileConfig, forceFetchGithub, loadAllFormats, allFormats } = useTrashStore()

  const id = config.instance_id
  const profileConfigs = config.profileConfigs ?? []
  const myProfiles = profiles[id] ?? []
  const configuredSlugs = new Set(profileConfigs.map(p => p.profile_slug))

  const [selectedSlug, setSelectedSlug] = useState<string | null>(profileConfigs[0]?.profile_slug ?? null)
  const [showAddProfile, setShowAddProfile] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [deleteSlug, setDeleteSlug] = useState<string | null>(null)
  const [fetching, setFetching] = useState(false)
  const [profilesLoaded, setProfilesLoaded] = useState(false)
  const [showBrowse, setShowBrowse] = useState(false)

  // Keep selectedSlug in sync when configs change (e.g. a profile was added/removed)
  const slugSet = profileConfigs.map(p => p.profile_slug).join(',')
  useEffect(() => {
    if (selectedSlug && !configuredSlugs.has(selectedSlug)) {
      setSelectedSlug(profileConfigs[0]?.profile_slug ?? null)
    }
    if (!selectedSlug && profileConfigs.length > 0) {
      setSelectedSlug(profileConfigs[0].profile_slug)
    }
  }, [slugSet])

  useEffect(() => {
    loadProfiles(id).catch(() => {}).finally(() => setProfilesLoaded(true))
  }, [id])

  async function fetchAndReload() {
    setFetching(true)
    try {
      await forceFetchGithub()
      await loadProfiles(id)
    } catch { /* ignore */ }
    finally { setFetching(false) }
  }

  async function syncAll() {
    setSyncing(true)
    try { await triggerSync(id) } catch { /* ignore */ }
    finally { setSyncing(false) }
  }

  const selectedCfg = profileConfigs.find(p => p.profile_slug === selectedSlug)
  const selectedName = myProfiles.find(p => p.slug === selectedSlug)?.name ?? selectedSlug ?? ''
  const profileSlugs = profileConfigs.map(p => p.profile_slug)

  return (
    <div className="glass" style={{ borderRadius: 12, overflow: 'hidden' }}>

      {/* ── Instance header ─── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{instanceName}</span>
            <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: 'var(--glass-bg)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
              {config.arr_type}
            </span>
            {!config.enabled && (
              <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: '#f8717122', color: '#f87171' }}>disabled</span>
            )}
            {config.isSyncing && (
              <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: 'rgba(var(--accent-rgb),0.1)', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Loader size={10} className="spin" /> syncing…
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            {profileConfigs.length === 0
              ? 'No profiles configured'
              : `${profileConfigs.filter(p => p.enabled).length} of ${profileConfigs.length} profiles active`
            }
          </div>
        </div>

        {isAdmin && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={async () => {
              setToggling(true)
              try { await configure(id, { enabled: !config.enabled }) } catch { /* ignore */ }
              finally { setToggling(false) }
            }}
            disabled={toggling}
            title={config.enabled ? 'Disable TRaSH sync for this instance' : 'Enable TRaSH sync for this instance'}
            style={{ color: config.enabled ? '#10b981' : 'var(--text-muted)' }}
          >
            {toggling ? <Loader size={13} className="spin" /> : config.enabled ? 'Enabled' : 'Enable'}
          </button>
        )}
        {isAdmin && myProfiles.length > 0 && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => { setShowBrowse(true); if (!allFormats[id]) loadAllFormats(id).catch(() => {}) }}
            title="Browse all available TRaSH formats for this instance"
          >
            <Search size={13} />
            Browse Formats
          </button>
        )}
        {isAdmin && profileConfigs.length > 0 && (
          <button className="btn btn-ghost btn-sm" onClick={syncAll} disabled={syncing || config.isSyncing} title="Sync all profiles">
            {syncing || config.isSyncing ? <Loader size={13} className="spin" /> : <RefreshCw size={13} />}
            Sync all
          </button>
        )}
      </div>

      {/* ── No TRaSH data banner ─── */}
      {profilesLoaded && myProfiles.length === 0 && isAdmin && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 16px', background: '#f59e0b11', borderBottom: '1px solid #f59e0b33' }}>
          <AlertTriangle size={14} style={{ color: '#f59e0b', flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 13, color: '#f59e0b' }}>
            No TRaSH Guides data found for this instance. Fetch from GitHub to load available profiles and formats.
          </span>
          <button
            className="btn btn-sm"
            onClick={fetchAndReload}
            disabled={fetching}
            style={{ background: '#f59e0b22', border: '1px solid #f59e0b55', color: '#f59e0b', fontWeight: 600, fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}
          >
            {fetching ? <Loader size={12} className="spin" /> : <GitCommit size={12} />}
            Fetch from GitHub
          </button>
        </div>
      )}

      {/* ── Profile tab bar ─── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, background: 'var(--glass-bg)', borderBottom: '1px solid var(--border)', overflowX: 'auto', padding: '0 8px' }}>
        {profileConfigs.map(pcfg => {
          const name = myProfiles.find(p => p.slug === pcfg.profile_slug)?.name ?? pcfg.profile_slug
          const isActive = selectedSlug === pcfg.profile_slug
          return (
            <button
              key={pcfg.profile_slug}
              onClick={() => { setSelectedSlug(pcfg.profile_slug); setShowBrowse(false) }}
              style={{
                padding: '10px 16px', fontSize: 13, fontWeight: isActive ? 600 : 400, whiteSpace: 'nowrap',
                borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                background: 'transparent', border: 'none', borderBottomWidth: 2,
                borderBottomStyle: 'solid',
                borderBottomColor: isActive ? 'var(--accent)' : 'transparent',
                cursor: 'pointer', fontFamily: 'var(--font-sans)',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              {!pcfg.enabled && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f87171', display: 'inline-block', flexShrink: 0 }} />}
              {name}
              {isAdmin && (
                <span
                  onClick={e => { e.stopPropagation(); setDeleteSlug(pcfg.profile_slug) }}
                  title="Remove this profile"
                  style={{ marginLeft: 4, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', opacity: 0.6, cursor: 'pointer' }}
                >
                  <X size={10} />
                </span>
              )}
            </button>
          )
        })}

        {isAdmin && (
          <button
            onClick={() => setShowAddProfile(true)}
            style={{ padding: '10px 14px', fontSize: 13, color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap', fontFamily: 'var(--font-sans)' }}
            title="Add a TRaSH quality profile to sync"
          >
            <Plus size={13} /> Add Profile
          </button>
        )}
      </div>

      {/* ── Delete profile confirmation ─── */}
      {deleteSlug && (
        <div style={{ padding: '10px 16px', background: '#f8717111', border: '1px solid #f8717133', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <AlertTriangle size={13} style={{ color: '#f87171', flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 13, color: '#f87171' }}>
            Remove profile &ldquo;{myProfiles.find(p => p.slug === deleteSlug)?.name ?? deleteSlug}&rdquo;? This deletes all saved overrides and previews.
          </span>
          <button className="btn btn-danger btn-sm" onClick={async () => {
            await deleteProfileConfig(id, deleteSlug).catch(() => {})
            setDeleteSlug(null)
          }}>Remove</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setDeleteSlug(null)}>Cancel</button>
        </div>
      )}

      {/* ── Profile editor (or empty state) ─── */}
      {selectedCfg ? (
        <ProfileEditor
          instanceId={id}
          profileCfg={selectedCfg}
          profileName={selectedName}
          isSyncing={config.isSyncing}
          isAdmin={isAdmin}
          profileSlugs={profileSlugs}
        />
      ) : (
        <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          {profileConfigs.length === 0
            ? isAdmin
              ? 'No profiles configured. Click "Add Profile" to begin.'
              : 'No profiles configured for this instance.'
            : 'Select a profile tab above to view and edit its formats.'
          }
        </div>
      )}

      {/* ── Modals ─── */}
      {showAddProfile && (
        <ProfileConfigModal
          instanceId={id}
          availableProfiles={myProfiles}
          alreadyConfiguredSlugs={configuredSlugs}
          onClose={() => setShowAddProfile(false)}
        />
      )}
      {showBrowse && (
        <BrowseFormatsModal instanceId={id} onClose={() => setShowBrowse(false)} />
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
//
// Handles instance selection (if multiple) and GitHub refresh.
// InstanceEditor handles the per-instance view.

export default function TrashPage({ embedded, isAdmin }: { embedded?: boolean; isAdmin?: boolean }) {
  const { configs, loadConfigs, forceFetchGithub } = useTrashStore()
  const { instances: arrInstances } = useArrStore()
  const [loading, setLoading] = useState(true)
  const [fetching, setFetching] = useState(false)
  const [fetchResult, setFetchResult] = useState<{ sha: string; filesUpdated: number; formatsUpdated: number } | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null)

  useEffect(() => {
    loadConfigs().catch(() => {}).finally(() => setLoading(false))
  }, [])

  // Auto-select the first configured instance
  useEffect(() => {
    if (configs.length > 0 && (!selectedInstanceId || !configs.find(c => c.instance_id === selectedInstanceId))) {
      setSelectedInstanceId(configs[0].instance_id)
    }
  }, [configs.map(c => c.instance_id).join(',')])

  const nameMap = new Map(arrInstances.map(i => [i.id, i.name]))
  const radarrSonarr = arrInstances.filter(i => i.type === 'radarr' || i.type === 'sonarr')
  const configuredIds = new Set(configs.map(c => c.instance_id))
  const unconfigured = radarrSonarr.filter(i => !configuredIds.has(i.id))
  const selectedConfig = configs.find(c => c.instance_id === selectedInstanceId)

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

  return (
    <>
      {/* Page header */}
      {!embedded && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', margin: 0, fontFamily: 'var(--font-display)' }}>TRaSH Guides Sync</h1>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>Sync custom formats and quality profiles from the TRaSH Guides.</p>
          </div>
          {isAdmin && (
            <button className="btn btn-ghost" onClick={doForceFetch} disabled={fetching} title="Force-fetch latest TRaSH Guides data from GitHub">
              {fetching ? <Loader size={14} className="spin" /> : <GitCommit size={14} />}
              Refresh from GitHub
            </button>
          )}
        </div>
      )}

      {/* GitHub refresh in embedded mode */}
      {embedded && isAdmin && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <button className="btn btn-ghost btn-sm" onClick={doForceFetch} disabled={fetching}>
            {fetching ? <Loader size={13} className="spin" /> : <GitCommit size={13} />}
            Refresh from GitHub
          </button>
        </div>
      )}

      {/* Status messages */}
      {fetchResult && (
        <div style={{ background: '#10b98111', border: '1px solid #10b98133', borderRadius: 10, padding: '10px 16px', marginBottom: 16, fontSize: 13, color: '#10b981', display: 'flex', alignItems: 'center', gap: 8 }}>
          <CheckCircle size={14} />
          GitHub updated — SHA: {fetchResult.sha.substring(0, 8)} · {fetchResult.filesUpdated} files · {fetchResult.formatsUpdated} formats
        </div>
      )}
      {fetchError && (
        <div style={{ background: '#f8717111', border: '1px solid #f8717133', borderRadius: 10, padding: '10px 16px', marginBottom: 16, fontSize: 13, color: '#f87171', display: 'flex', alignItems: 'center', gap: 8 }}>
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
          {/* Instance selector (shown when multiple instances are configured) */}
          {configs.length > 1 && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
              {configs.map(c => {
                const name = nameMap.get(c.instance_id) ?? c.instance_id
                const isSelected = c.instance_id === selectedInstanceId
                return (
                  <button
                    key={c.instance_id}
                    onClick={() => setSelectedInstanceId(c.instance_id)}
                    style={{
                      padding: '8px 16px', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: isSelected ? 600 : 400,
                      background: isSelected ? 'rgba(var(--accent-rgb),0.12)' : 'var(--glass-bg)',
                      color: isSelected ? 'var(--accent)' : 'var(--text-secondary)',
                      border: `1px solid ${isSelected ? 'rgba(var(--accent-rgb),0.3)' : 'var(--border)'}`,
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-sans)',
                    }}
                  >
                    {name}
                    <span style={{ fontSize: 11, opacity: 0.7 }}>{c.arr_type}</span>
                    {c.isSyncing && <Loader size={11} className="spin" />}
                  </button>
                )
              })}
            </div>
          )}

          {/* Selected instance editor */}
          {selectedConfig && (
            <div style={{ marginBottom: 24 }}>
              <InstanceEditor
                key={selectedConfig.instance_id}
                config={selectedConfig}
                instanceName={nameMap.get(selectedConfig.instance_id) ?? selectedConfig.instance_id}
                isAdmin={isAdmin ?? false}
              />
            </div>
          )}

          {configs.length === 0 && radarrSonarr.length > 0 && (
            <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '24px', marginBottom: 24, fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>
              <Info size={24} style={{ marginBottom: 8, color: 'var(--text-muted)' }} />
              <div style={{ fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>No instances configured for TRaSH sync</div>
              <div>Enable TRaSH sync on a Radarr or Sonarr instance below to get started.</div>
            </div>
          )}

          {/* Unconfigured instances */}
          {unconfigured.length > 0 && isAdmin && (
            <div>
              <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>
                Not yet configured
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {unconfigured.map(inst => (
                  <UnconfiguredRow key={inst.id} instanceId={inst.id} instanceName={inst.name} arrType={inst.type as 'radarr' | 'sonarr'} />
                ))}
              </div>
            </div>
          )}

          {/* No instances at all */}
          {radarrSonarr.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px 24px', background: 'var(--glass-bg)', borderRadius: 16, border: '1px solid var(--border)' }}>
              <Info size={32} style={{ color: 'var(--text-muted)', marginBottom: 12 }} />
              <div style={{ fontSize: 15, color: 'var(--text-primary)', fontWeight: 500, marginBottom: 8 }}>No Radarr or Sonarr instances</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Add a Radarr or Sonarr instance on the Instances tab to use TRaSH Guides sync.</div>
            </div>
          )}
        </>
      )}
    </>
  )
}
