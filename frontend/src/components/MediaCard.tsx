import { useState } from 'react'
import { useArrStore } from '../store/useArrStore'
import { useStore } from '../store/useStore'
import type { ArrStatus, ArrStats, ArrQueueItem, ArrCalendarItem, SonarrCalendarItem, ProwlarrIndexer, SabnzbdQueueData, SabnzbdHistoryData } from '../types/arr'
import { ChevronDown, ChevronUp } from 'lucide-react'

// Minimal instance shape — works for both ArrInstance and dashboard partial
export interface ArrInstanceBase {
  id: string
  type: string
  name: string
  url: string
  enabled: boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function fmtBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

export function fmtMb(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`
  if (mb === 0) return '0 MB'
  return `${mb.toFixed(0)} MB`
}

export function fmtPct(done: number, total: number): string {
  if (total === 0) return '0%'
  return `${Math.round(((total - done) / total) * 100)}%`
}

export const TYPE_LABELS: Record<string, string> = {
  radarr: 'Radarr',
  sonarr: 'Sonarr',
  prowlarr: 'Prowlarr',
  sabnzbd: 'SABnzbd',
}

export const TYPE_COLORS: Record<string, string> = {
  radarr: '#f59e0b',
  sonarr: '#3b82f6',
  prowlarr: '#8b5cf6',
  sabnzbd: '#22c55e',
}

// ── Shared sub-components ─────────────────────────────────────────────────────

export function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</span>
      <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>{value}</span>
    </div>
  )
}

export function ExpandBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      className="btn btn-ghost btn-sm"
      onClick={onClick}
      style={{ fontSize: 11, gap: 4, padding: '4px 8px', color: active ? 'var(--accent)' : 'var(--text-secondary)' }}
    >
      {label}
      {active ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
    </button>
  )
}

// ── List components ───────────────────────────────────────────────────────────

export function QueueList({ items }: { items: ArrQueueItem[] }) {
  if (items.length === 0) return <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>Queue is empty.</p>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {items.map(item => (
        <div key={item.id} className="glass" style={{ padding: '8px 12px', borderRadius: 'var(--radius-md)', fontSize: 12 }}>
          <div style={{ fontWeight: 500, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</div>
          <div style={{ display: 'flex', gap: 12, color: 'var(--text-muted)' }}>
            <span>{fmtPct(item.sizeleft, item.size)} done</span>
            <span>{fmtBytes(item.sizeleft)} left</span>
            <span style={{ textTransform: 'capitalize' }}>{item.protocol}</span>
            <span style={{ color: item.status === 'downloading' ? 'var(--status-online)' : 'var(--text-muted)', textTransform: 'capitalize' }}>{item.status}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

export function CalendarList({ items, type }: { items: ArrCalendarItem[]; type: string }) {
  if (items.length === 0) return <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>Nothing upcoming this week.</p>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {items.map(item => {
        const isSonarr = type === 'sonarr'
        const sonarrItem = item as SonarrCalendarItem
        const title = isSonarr
          ? `${sonarrItem.series?.title ?? 'Unknown'} — S${String(sonarrItem.seasonNumber).padStart(2, '0')}E${String(sonarrItem.episodeNumber).padStart(2, '0')}`
          : (item as any).title
        const date = isSonarr ? sonarrItem.airDateUtc : ((item as any).inCinemas ?? (item as any).digitalRelease)
        return (
          <div key={item.id} className="glass" style={{ padding: '8px 12px', borderRadius: 'var(--radius-md)', fontSize: 12, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
            <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
              {date ? new Date(date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : '—'}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export function IndexerList({ items }: { items: ProwlarrIndexer[] }) {
  if (items.length === 0) return <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>No indexers.</p>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {items.map(idx => (
        <div key={idx.id} className="glass" style={{ padding: '6px 12px', borderRadius: 'var(--radius-md)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: idx.enable ? 'var(--status-online)' : 'var(--status-offline)', flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{idx.name}</span>
          <span style={{ color: 'var(--text-muted)', textTransform: 'capitalize', fontSize: 11 }}>{idx.protocol}</span>
          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{idx.privacy}</span>
        </div>
      ))}
    </div>
  )
}

export function SabnzbdQueueList({ queue }: { queue: SabnzbdQueueData }) {
  if (queue.slots.length === 0) return <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>Queue is empty.</p>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {queue.slots.map(slot => {
        const pct = parseFloat(slot.percentage)
        return (
          <div key={slot.nzo_id} className="glass" style={{ padding: '8px 12px', borderRadius: 'var(--radius-md)', fontSize: 12 }}>
            <div style={{ fontWeight: 500, marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{slot.filename}</div>
            <div style={{ height: 3, background: 'var(--glass-border)', borderRadius: 2, marginBottom: 6, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', borderRadius: 2 }} />
            </div>
            <div style={{ display: 'flex', gap: 12, color: 'var(--text-muted)' }}>
              <span>{pct.toFixed(0)}%</span>
              <span>{fmtMb(slot.mbleft)} left</span>
              <span>{slot.timeleft}</span>
              <span style={{ color: slot.status === 'Downloading' ? 'var(--status-online)' : 'var(--text-muted)' }}>{slot.status}</span>
            </div>
          </div>
        )
      })}
      {queue.noofslots > queue.slots.length && (
        <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', padding: '4px 0' }}>
          +{queue.noofslots - queue.slots.length} more items
        </p>
      )}
    </div>
  )
}

export function SabnzbdHistoryList({ history }: { history: SabnzbdHistoryData }) {
  if (history.slots.length === 0) return <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>No history yet.</p>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {history.slots.map(slot => (
        <div key={slot.nzo_id} className="glass" style={{ padding: '6px 12px', borderRadius: 'var(--radius-md)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
            background: slot.status === 'Completed' ? 'var(--status-online)' : 'var(--status-offline)',
          }} />
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{slot.name}</span>
          <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{fmtBytes(slot.bytes)}</span>
          {slot.cat && <span style={{ color: 'var(--text-muted)', fontSize: 11, flexShrink: 0 }}>{slot.cat}</span>}
        </div>
      ))}
    </div>
  )
}

// ── Optional icon in card header ──────────────────────────────────────────────

function InstanceIcon({ iconUrl, iconEmoji }: { iconUrl?: string | null; iconEmoji?: string | null }) {
  const [imgErr, setImgErr] = useState(false)
  if (iconUrl && !imgErr) {
    return (
      <img
        src={iconUrl}
        alt=""
        onError={() => setImgErr(true)}
        style={{ width: 24, height: 24, objectFit: 'contain', borderRadius: 4, flexShrink: 0 }}
      />
    )
  }
  if (iconEmoji) {
    return <span style={{ fontSize: 20, flexShrink: 0, lineHeight: 1 }}>{iconEmoji}</span>
  }
  return null
}

// ── Arr card content (radarr / sonarr / prowlarr) ─────────────────────────────

const normalizeUrl = (u: string) => u.replace(/\/$/, '').toLowerCase()

export function ArrCardContent({ instance }: {
  instance: ArrInstanceBase
}) {
  const { stats, statuses, queues, calendars, indexers, loadQueue, loadCalendar, loadIndexers } = useArrStore()
  const { services } = useStore()
  const instUrl = normalizeUrl(instance.url)
  const matchingSvc = services.find(s =>
    normalizeUrl(s.url) === instUrl || (s.check_url && normalizeUrl(s.check_url) === instUrl)
  )
  const iconUrl = matchingSvc?.icon_url ?? null
  const iconEmoji = matchingSvc?.icon ?? null
  const [expanded, setExpanded] = useState<'queue' | 'calendar' | 'indexers' | null>(null)
  const [loadingExpand, setLoadingExpand] = useState(false)

  const status: ArrStatus | undefined = statuses[instance.id]
  const stat: ArrStats | undefined = stats[instance.id]
  const online = status?.online ?? null

  const handleExpand = async (section: 'queue' | 'calendar' | 'indexers') => {
    if (expanded === section) { setExpanded(null); return }
    setExpanded(section)
    if (section === 'queue' && !queues[instance.id]) {
      setLoadingExpand(true); await loadQueue(instance.id).catch(() => {}); setLoadingExpand(false)
    }
    if (section === 'calendar' && !calendars[instance.id]) {
      setLoadingExpand(true); await loadCalendar(instance.id).catch(() => {}); setLoadingExpand(false)
    }
    if (section === 'indexers' && !indexers[instance.id]) {
      setLoadingExpand(true); await loadIndexers(instance.id).catch(() => {}); setLoadingExpand(false)
    }
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <InstanceIcon iconUrl={iconUrl} iconEmoji={iconEmoji} />
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: 1, padding: '2px 8px',
          borderRadius: 'var(--radius-sm)', background: `${TYPE_COLORS[instance.type]}22`,
          color: TYPE_COLORS[instance.type], border: `1px solid ${TYPE_COLORS[instance.type]}44`,
          textTransform: 'uppercase', flexShrink: 0,
        }}>
          {TYPE_LABELS[instance.type] ?? instance.type}
        </span>
        <span style={{ fontWeight: 600, fontSize: 15, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{instance.name}</span>
        <span style={{
          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
          background: online === null ? 'var(--text-muted)' : online ? 'var(--status-online)' : 'var(--status-offline)',
          boxShadow: online ? '0 0 6px var(--status-online)' : 'none',
        }} />
      </div>

      {status?.online && status.version && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {status.instanceName ?? TYPE_LABELS[instance.type]} v{status.version}
        </div>
      )}

      {stat && stat.type !== 'sabnzbd' && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {stat.type === 'radarr' && (
            <>
              <Stat label="Movies" value={stat.movieCount} />
              <Stat label="Monitored" value={stat.monitored} />
              <Stat label="On Disk" value={stat.withFile} />
              <Stat label="Size" value={fmtBytes(stat.sizeOnDisk)} />
            </>
          )}
          {stat.type === 'sonarr' && (
            <>
              <Stat label="Series" value={stat.seriesCount} />
              <Stat label="Monitored" value={stat.monitored} />
              <Stat label="Episodes" value={stat.episodeCount} />
              <Stat label="Size" value={fmtBytes(stat.sizeOnDisk)} />
            </>
          )}
          {stat.type === 'prowlarr' && (
            <>
              <Stat label="Indexers" value={stat.indexerCount} />
              <Stat label="Enabled" value={stat.enabledIndexers} />
              <Stat label="Grabs 24h" value={stat.grabCount24h} />
            </>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {instance.type !== 'prowlarr' && (
          <>
            <ExpandBtn label="Queue" active={expanded === 'queue'} onClick={() => handleExpand('queue')} />
            <ExpandBtn label="Calendar" active={expanded === 'calendar'} onClick={() => handleExpand('calendar')} />
          </>
        )}
        {instance.type === 'prowlarr' && (
          <ExpandBtn label="Indexers" active={expanded === 'indexers'} onClick={() => handleExpand('indexers')} />
        )}
      </div>

      {expanded && (
        <div>
          {loadingExpand
            ? <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
            : expanded === 'queue' && queues[instance.id]
              ? <QueueList items={queues[instance.id]!.records} />
              : expanded === 'calendar' && calendars[instance.id]
                ? <CalendarList items={calendars[instance.id]!} type={instance.type} />
                : expanded === 'indexers' && indexers[instance.id]
                  ? <IndexerList items={indexers[instance.id]!} />
                  : null
          }
        </div>
      )}
    </>
  )
}

// ── SABnzbd card content ──────────────────────────────────────────────────────

export function SabnzbdCardContent({ instance }: {
  instance: ArrInstanceBase
}) {
  const { stats, statuses, sabQueues, histories, loadSabQueue, loadHistory } = useArrStore()
  const { services } = useStore()
  const instUrl = normalizeUrl(instance.url)
  const matchingSvc = services.find(s =>
    normalizeUrl(s.url) === instUrl || (s.check_url && normalizeUrl(s.check_url) === instUrl)
  )
  const iconUrl = matchingSvc?.icon_url ?? null
  const iconEmoji = matchingSvc?.icon ?? null
  const [expanded, setExpanded] = useState<'queue' | 'history' | null>(null)
  const [loadingExpand, setLoadingExpand] = useState(false)

  const status: ArrStatus | undefined = statuses[instance.id]
  const stat: ArrStats | undefined = stats[instance.id]
  const sabStat = stat?.type === 'sabnzbd' ? stat : undefined
  const online = status?.online ?? null

  const handleExpand = async (section: 'queue' | 'history') => {
    if (expanded === section) { setExpanded(null); return }
    setExpanded(section)
    if (section === 'queue' && !sabQueues[instance.id]) {
      setLoadingExpand(true); await loadSabQueue(instance.id).catch(() => {}); setLoadingExpand(false)
    }
    if (section === 'history' && !histories[instance.id]) {
      setLoadingExpand(true); await loadHistory(instance.id).catch(() => {}); setLoadingExpand(false)
    }
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <InstanceIcon iconUrl={iconUrl} iconEmoji={iconEmoji} />
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: 1, padding: '2px 8px',
          borderRadius: 'var(--radius-sm)', background: `${TYPE_COLORS['sabnzbd']}22`,
          color: TYPE_COLORS['sabnzbd'], border: `1px solid ${TYPE_COLORS['sabnzbd']}44`,
          textTransform: 'uppercase', flexShrink: 0,
        }}>SABnzbd</span>
        <span style={{ fontWeight: 600, fontSize: 15, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{instance.name}</span>
        <span style={{
          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
          background: online === null ? 'var(--text-muted)' : online ? 'var(--status-online)' : 'var(--status-offline)',
          boxShadow: online ? '0 0 6px var(--status-online)' : 'none',
        }} />
      </div>

      {status?.online && status.version && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>SABnzbd v{status.version}</div>
      )}

      {sabStat && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <Stat label="Queue" value={sabStat.queueCount} />
          <Stat label="Left" value={fmtMb(sabStat.mbleft)} />
          <Stat label="Speed" value={sabStat.paused ? 'Paused' : (sabStat.speed || '—')} />
          <Stat label="Disk Free" value={`${sabStat.diskspaceFreeGb.toFixed(1)} GB`} />
        </div>
      )}

      <div style={{ display: 'flex', gap: 6 }}>
        <ExpandBtn label="Queue" active={expanded === 'queue'} onClick={() => handleExpand('queue')} />
        <ExpandBtn label="History" active={expanded === 'history'} onClick={() => handleExpand('history')} />
      </div>

      {expanded && (
        <div>
          {loadingExpand
            ? <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
            : expanded === 'queue' && sabQueues[instance.id]
              ? <SabnzbdQueueList queue={sabQueues[instance.id]!} />
              : expanded === 'history' && histories[instance.id]
                ? <SabnzbdHistoryList history={histories[instance.id]!} />
                : null
          }
        </div>
      )}
    </>
  )
}
