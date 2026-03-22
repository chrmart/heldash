import React, { useEffect, useState } from 'react'
import { Plus, RefreshCw, Download, Trash2, Edit2, CheckCircle, XCircle, AlertTriangle, Clock, ChevronDown, ChevronRight } from 'lucide-react'
import { api } from '../api'
import { useStore } from '../store/useStore'
import { useToast } from '../components/Toast'
import type { BackupSource, BackupStatusResult } from '../types'

// ── Backup type definitions ───────────────────────────────────────────────────

const BACKUP_TYPES: { value: string; label: string; description: string }[] = [
  { value: 'ca_backup', label: 'CA Backup (Unraid)', description: 'Liest das CA Backup Plugin Log von Unraid' },
  { value: 'duplicati', label: 'Duplicati', description: 'Verbindet sich mit der Duplicati Web-UI' },
  { value: 'kopia', label: 'Kopia', description: 'Verbindet sich mit dem Kopia-Server' },
  { value: 'docker', label: 'Docker (Export)', description: 'Exportiert Container-Konfigurationen als JSON' },
  { value: 'vm', label: 'VM Backups', description: 'Prüft Backup-Dateien in einem lokalen Pfad' },
]

// ── Add/Edit Source Modal ─────────────────────────────────────────────────────

interface SourceModalProps {
  source?: BackupSource | null
  onClose: () => void
  onSave: (data: { name: string; type: string; config: Record<string, unknown>; enabled: boolean }) => Promise<void>
}

function SourceModal({ source, onClose, onSave }: SourceModalProps) {
  const [name, setName] = useState(source?.name ?? '')
  const [type, setType] = useState(source?.type ?? 'ca_backup')
  const [enabled, setEnabled] = useState(source?.enabled ?? true)
  const [config, setConfig] = useState<Record<string, unknown>>(source?.config ?? {})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    if (!name.trim() || !type) { setError('Name und Typ sind erforderlich'); return }
    setSaving(true)
    setError(null)
    try {
      await onSave({ name: name.trim(), type, config, enabled })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler beim Speichern')
    } finally {
      setSaving(false)
    }
  }

  const updateConfig = (key: string, value: string) => {
    setConfig(prev => ({ ...prev, [key]: value }))
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="glass modal" style={{ width: '100%', maxWidth: 520, padding: 24, borderRadius: 'var(--radius-xl)' }}>
        <h3 style={{ margin: '0 0 20px', fontFamily: 'var(--font-display)' }}>{source ? 'Quelle bearbeiten' : 'Backup-Quelle hinzufügen'}</h3>

        {error && <div className="error-banner" style={{ marginBottom: 16 }}>{error}</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label className="field-label">Name *</label>
            <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Mein Backup" />
          </div>

          <div>
            <label className="field-label">Typ *</label>
            <select className="input" value={type} onChange={e => { setType(e.target.value); setConfig({}) }}>
              {BACKUP_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
              {BACKUP_TYPES.find(t => t.value === type)?.description}
            </span>
          </div>

          {type === 'ca_backup' && (
            <div>
              <label className="field-label">Log-Pfad</label>
              <input className="input" value={(config.logPath as string) ?? ''} onChange={e => updateConfig('logPath', e.target.value)} placeholder="/boot/logs/CA_backup.log" />
            </div>
          )}

          {type === 'duplicati' && (
            <>
              <div>
                <label className="field-label">URL</label>
                <input className="input" value={(config.url as string) ?? ''} onChange={e => updateConfig('url', e.target.value)} placeholder="http://192.168.1.x:8200" />
              </div>
              <div>
                <label className="field-label">API Key</label>
                <input className="input" value={(config.apiKey as string) ?? ''} onChange={e => updateConfig('apiKey', e.target.value)} placeholder="API Key" />
              </div>
            </>
          )}

          {type === 'kopia' && (
            <>
              <div>
                <label className="field-label">URL</label>
                <input className="input" value={(config.url as string) ?? ''} onChange={e => updateConfig('url', e.target.value)} placeholder="http://192.168.1.x:51515" />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <label className="field-label">Benutzer</label>
                  <input className="input" value={(config.user as string) ?? 'kopia'} onChange={e => updateConfig('user', e.target.value)} placeholder="kopia" />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="field-label">Passwort</label>
                  <input className="input" type="password" value={(config.pass as string) ?? ''} onChange={e => updateConfig('pass', e.target.value)} placeholder="Passwort" />
                </div>
              </div>
            </>
          )}

          {type === 'vm' && (
            <div>
              <label className="field-label">Backup-Pfad</label>
              <input className="input" value={(config.backupPath as string) ?? ''} onChange={e => updateConfig('backupPath', e.target.value)} placeholder="/mnt/user/backups/vms" />
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <label className="field-label" style={{ margin: 0 }}>Aktiviert</label>
            <button
              onClick={() => setEnabled(v => !v)}
              style={{ width: 40, height: 22, borderRadius: 11, background: enabled ? 'var(--accent)' : 'var(--glass-border)', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 200ms' }}
            >
              <span style={{ position: 'absolute', top: 2, left: enabled ? 20 : 2, width: 18, height: 18, borderRadius: '50%', background: 'white', transition: 'left 200ms' }} />
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          <button className="btn btn-ghost" onClick={onClose}>Abbrechen</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Speichern...' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Status Card ───────────────────────────────────────────────────────────────

function StatusCard({ result }: { result: BackupStatusResult }) {
  const [expanded, setExpanded] = useState(false)

  const StatusIcon = result.error
    ? () => <XCircle size={16} style={{ color: 'var(--status-offline)' }} />
    : result.success === false
      ? () => <AlertTriangle size={16} style={{ color: '#f59e0b' }} />
      : result.success === true
        ? () => <CheckCircle size={16} style={{ color: 'var(--status-online)' }} />
        : () => <Clock size={16} style={{ color: 'var(--text-muted)' }} />

  const statusText = result.error ? 'Fehler' : result.success === false ? 'Veraltet' : result.success === true ? 'OK' : 'Unbekannt'
  const statusColor = result.error ? 'var(--status-offline)' : result.success === false ? '#f59e0b' : result.success === true ? 'var(--status-online)' : 'var(--text-muted)'

  const typeLabel = BACKUP_TYPES.find(t => t.value === result.type)?.label ?? result.type

  const fmtDate = (iso: string | null) => {
    if (!iso) return '—'
    try {
      return new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    } catch { return iso }
  }

  return (
    <div className="glass" style={{ borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', cursor: 'pointer' }}
      >
        <StatusIcon />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{result.name}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{typeLabel}</div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: statusColor }}>{statusText}</div>
          {result.lastRun && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Zuletzt: {fmtDate(result.lastRun)}</div>}
          {result.size && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Größe: {result.size}</div>}
        </div>
        {expanded ? <ChevronDown size={14} style={{ flexShrink: 0, color: 'var(--text-muted)' }} /> : <ChevronRight size={14} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />}
      </div>
      {expanded && result.error && (
        <div style={{ borderTop: '1px solid var(--glass-border)', padding: '10px 16px', fontSize: 12, color: 'var(--status-offline)', background: 'rgba(239,68,68,0.06)' }}>
          {result.error}
        </div>
      )}
    </div>
  )
}

// ── Guide Tab ─────────────────────────────────────────────────────────────────

interface GuideSectionProps {
  title: string
  children: React.ReactNode
}

function GuideSection({ title, children }: GuideSectionProps) {
  const [open, setOpen] = useState(false)
  return (
    <div className="glass" style={{ borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
      >
        <span style={{ fontWeight: 600, fontSize: 14 }}>{title}</span>
        {open ? <ChevronDown size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} /> : <ChevronRight size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />}
      </button>
      {open && (
        <div style={{ borderTop: '1px solid var(--glass-border)', padding: '12px 16px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          {children}
        </div>
      )}
    </div>
  )
}

function GuideTab() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 8px' }}>
        Best Practices und Empfehlungen für eine robuste Backup-Strategie.
      </p>

      <GuideSection title="3-2-1 Backup-Regel">
        <p style={{ margin: '0 0 8px' }}>Die 3-2-1-Regel ist der Industriestandard:</p>
        <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <li><strong>3</strong> Kopien der Daten (1 Original + 2 Backups)</li>
          <li><strong>2</strong> verschiedene Speichermedien (z.B. HDD + NAS)</li>
          <li><strong>1</strong> Backup an einem externen Standort (z.B. Cloud oder Offsite)</li>
        </ul>
      </GuideSection>

      <GuideSection title="Unraid CA Backup">
        <p style={{ margin: '0 0 8px' }}>Das CA Backup Plugin sichert deine Unraid-Konfiguration:</p>
        <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <li>Installiere "Community Applications" und dann "CA Backup/Restore Appdata"</li>
          <li>Richte einen Cron-Job für nächtliche Backups ein</li>
          <li>Schreibe Backups auf ein Share, der auf einer anderen physischen Disk liegt</li>
          <li>Empfehlung: täglich um 3:00 Uhr, 7 Tage Aufbewahrung</li>
        </ul>
      </GuideSection>

      <GuideSection title="Docker-Daten sichern">
        <p style={{ margin: '0 0 8px' }}>Container-Konfigurationen sind leicht zu sichern:</p>
        <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <li>Nutze den "Docker Export" Button hier, um alle Container-Configs als JSON zu exportieren</li>
          <li>Sichere deinen <code style={{ background: 'var(--glass-bg)', padding: '1px 4px', borderRadius: 4 }}>/mnt/user/appdata</code> Ordner regelmäßig</li>
          <li>Für Datenbanken: Nutze datenbankspezifische Backup-Methoden (pg_dump, mysqldump)</li>
          <li>Tools wie Duplicati oder Kopia können Appdata-Verzeichnisse inkrementell sichern</li>
        </ul>
      </GuideSection>

      <GuideSection title="Kopia einrichten">
        <p style={{ margin: '0 0 8px' }}>Kopia ist ein modernes, verschlüsseltes Backup-Tool:</p>
        <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <li>Auf Unraid: Kopia als Docker Container (Linuxserver.io Image) installieren</li>
          <li>Repository: lokal, NAS (SMB/NFS) oder Cloud (S3, Backblaze B2, Azure)</li>
          <li>Snapshot-Zeitplan: täglich, wöchentliche Bereinigung</li>
          <li>Kopia verschlüsselt alles lokal bevor es hochgeladen wird</li>
        </ul>
      </GuideSection>

      <GuideSection title="VM Backups">
        <p style={{ margin: '0 0 8px' }}>Virtuelle Maschinen auf Unraid sichern:</p>
        <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <li>Stelle die VM vor dem Backup ab (konsistenter Zustand)</li>
          <li>Sichere <code style={{ background: 'var(--glass-bg)', padding: '1px 4px', borderRadius: 4 }}>/mnt/user/domains/</code> mit den .img und .xml Dateien</li>
          <li>Nutze Unraid's eingebaute VM Manager Snapshot-Funktion wenn verfügbar</li>
          <li>Alternativ: Libvirt Snapshot + Backup-Script</li>
        </ul>
      </GuideSection>

      <GuideSection title="Backup testen">
        <p style={{ margin: '0 0 8px' }}>Ein Backup das nie getestet wurde ist keines:</p>
        <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <li>Teste Wiederherstellung monatlich</li>
          <li>Dokumentiere den Wiederherstellungsprozess</li>
          <li>Prüfe Backup-Integrität (Checksummen) automatisch</li>
          <li>Stelle sicher dass Backups vollständig und lesbar sind</li>
        </ul>
      </GuideSection>
    </div>
  )
}

// ── Main BackupPage ───────────────────────────────────────────────────────────

export function BackupPage() {
  const { isAdmin } = useStore()
  const [tab, setTab] = useState<'overview' | 'guide'>('overview')
  const [sources, setSources] = useState<BackupSource[]>([])
  const [statusResults, setStatusResults] = useState<BackupStatusResult[]>([])
  const [loading, setLoading] = useState(true)
  const [statusLoading, setStatusLoading] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editSource, setEditSource] = useState<BackupSource | null>(null)
  const [exportLoading, setExportLoading] = useState(false)
  const { toast } = useToast()

  const loadSources = async () => {
    try {
      const data = await api.backup.sources.list()
      setSources(data)
    } catch { /* ignore */ } finally {
      setLoading(false)
    }
  }

  const loadStatus = async () => {
    setStatusLoading(true)
    try {
      const data = await api.backup.status()
      setStatusResults(data.sources)
    } catch { /* ignore */ } finally {
      setStatusLoading(false)
    }
  }

  useEffect(() => { loadSources() }, [])
  useEffect(() => { if (tab === 'overview' && sources.length > 0) { loadStatus() } }, [sources.length, tab])

  const handleSave = async (data: { name: string; type: string; config: Record<string, unknown>; enabled: boolean }) => {
    if (editSource) {
      await api.backup.sources.update(editSource.id, data)
    } else {
      await api.backup.sources.create(data)
    }
    await loadSources()
  }

  const handleDelete = async (source: BackupSource) => {
    try {
      await api.backup.sources.delete(source.id)
      await loadSources()
      toast({ message: `${source.name} entfernt`, type: 'info' })
    } catch (e) {
      toast({ message: e instanceof Error ? e.message : 'Fehler', type: 'error' })
    }
  }

  const handleDockerExport = async () => {
    setExportLoading(true)
    try {
      const blob = await api.backup.dockerExport()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `heldash-docker-export-${new Date().toISOString().split('T')[0]}.json`
      a.click()
      URL.revokeObjectURL(url)
      toast({ message: 'Docker-Export heruntergeladen', type: 'success' })
    } catch (e) {
      toast({ message: e instanceof Error ? e.message : 'Export fehlgeschlagen', type: 'error' })
    } finally {
      setExportLoading(false)
    }
  }

  const okCount = statusResults.filter(r => r.success === true && !r.error).length
  const warnCount = statusResults.filter(r => r.success === false || (r.success === null && !r.error)).length
  const errCount = statusResults.filter(r => r.error).length

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner" /></div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <h2 style={{ margin: 0, fontFamily: 'var(--font-display)' }}>Backup Center</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" onClick={handleDockerExport} disabled={exportLoading} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Download size={14} /> Docker exportieren
          </button>
          {isAdmin && (
            <button
              className="btn btn-primary"
              onClick={() => { setEditSource(null); setShowAddModal(true) }}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Plus size={14} /> Quelle hinzufügen
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--glass-border)', paddingBottom: 0 }}>
        {[{ key: 'overview', label: 'Übersicht' }, { key: 'guide', label: 'Leitfaden' }].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as 'overview' | 'guide')}
            style={{
              padding: '8px 16px', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer',
              borderBottom: tab === t.key ? '2px solid var(--accent)' : '2px solid transparent',
              color: tab === t.key ? 'var(--accent)' : 'var(--text-secondary)',
              fontWeight: tab === t.key ? 600 : 400,
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          {/* Stats */}
          {statusResults.length > 0 && (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {[
                { label: `${okCount} OK`, color: 'var(--status-online)' },
                { label: `${warnCount} Veraltet`, color: '#f59e0b' },
                { label: `${errCount} Fehler`, color: 'var(--status-offline)' },
              ].map(s => (
                <div key={s.label} className="glass" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 'var(--radius-md)', color: s.color, fontSize: 13, fontWeight: 500 }}>
                  {s.label}
                </div>
              ))}
              <button
                className="btn btn-ghost"
                onClick={loadStatus}
                disabled={statusLoading}
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}
              >
                <RefreshCw size={13} style={{ animation: statusLoading ? 'spin 1s linear infinite' : 'none' }} />
                Aktualisieren
              </button>
            </div>
          )}

          {/* Source list with status */}
          {sources.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>💾</div>
              <h3 style={{ fontFamily: 'var(--font-display)', marginBottom: 8 }}>Keine Backup-Quellen</h3>
              <p style={{ marginBottom: 20 }}>Füge Backup-Quellen hinzu um ihren Status zu überwachen</p>
              {isAdmin && (
                <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>Erste Quelle hinzufügen</button>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* Status results (if loaded) */}
              {statusResults.length > 0 ? (
                statusResults.map(result => (
                  <div key={result.id} style={{ position: 'relative' }}>
                    <StatusCard result={result} />
                    {isAdmin && (
                      <div style={{ position: 'absolute', top: 12, right: 48, display: 'flex', gap: 4 }}>
                        <button
                          className="btn-icon"
                          onClick={() => {
                            const src = sources.find(s => s.id === result.id)
                            if (src) { setEditSource(src); setShowAddModal(true) }
                          }}
                          title="Bearbeiten"
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          className="btn-icon"
                          onClick={() => {
                            const src = sources.find(s => s.id === result.id)
                            if (src) handleDelete(src)
                          }}
                          title="Löschen"
                          style={{ color: 'var(--status-offline)' }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                /* Loading / sources list without status */
                sources.map(source => (
                  <div key={source.id} className="glass" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{source.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{BACKUP_TYPES.find(t => t.value === source.type)?.label ?? source.type}</div>
                    </div>
                    {!source.enabled && <span style={{ fontSize: 11, color: 'var(--text-muted)', padding: '2px 8px', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-sm)' }}>Deaktiviert</span>}
                    {isAdmin && (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn-icon" onClick={() => { setEditSource(source); setShowAddModal(true) }} title="Bearbeiten"><Edit2 size={13} /></button>
                        <button className="btn-icon" onClick={() => handleDelete(source)} title="Löschen" style={{ color: 'var(--status-offline)' }}><Trash2 size={13} /></button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}

      {tab === 'guide' && <GuideTab />}

      {showAddModal && (
        <SourceModal
          source={editSource}
          onClose={() => { setShowAddModal(false); setEditSource(null) }}
          onSave={handleSave}
        />
      )}
    </div>
  )
}
