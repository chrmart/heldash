import { useState } from 'react'
import { useStore } from '../store/useStore'
import { ServiceCard } from '../components/ServiceCard'
import type { Service } from '../types'

interface Props {
  onEdit: (service: Service) => void
}

export function Dashboard({ onEdit }: Props) {
  const { services, groups } = useStore()
  const [filter, setFilter] = useState('')

  const filtered = services.filter(s =>
    s.name.toLowerCase().includes(filter.toLowerCase()) ||
    s.description?.toLowerCase().includes(filter.toLowerCase())
  )

  const ungrouped = filtered.filter(s => !s.group_id)
  const grouped = groups.map(g => ({
    group: g,
    services: filtered.filter(s => s.group_id === g.id),
  })).filter(g => g.services.length > 0)

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

      {/* Stats bar */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 28, flexWrap: 'wrap' }}>
        <StatPill label="Total" value={services.length} />
        <StatPill label="Online" value={services.filter(s => s.last_status === 'online').length} color="var(--status-online)" />
        <StatPill label="Offline" value={services.filter(s => s.last_status === 'offline').length} color="var(--status-offline)" />
        <StatPill label="Unknown" value={services.filter(s => !s.last_status || s.last_status === 'unknown').length} />
      </div>

      {/* Grouped */}
      {grouped.map(({ group, services: gs }) => (
        <div key={group.id} style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            {group.icon && <span>{group.icon}</span>}
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
              {group.name}
            </span>
            <div className="accent-strip" style={{ flex: 1 }} />
          </div>
          <div className="services-grid">
            {gs.map(s => <ServiceCard key={s.id} service={s} onEdit={onEdit} />)}
          </div>
        </div>
      ))}

      {/* Ungrouped */}
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
          <div className="services-grid">
            {ungrouped.map(s => <ServiceCard key={s.id} service={s} onEdit={onEdit} />)}
          </div>
        </div>
      )}
    </div>
  )
}

function StatPill({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="glass" style={{ padding: '6px 14px', borderRadius: 'var(--radius-md)', display: 'flex', gap: 8, alignItems: 'center' }}>
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontSize: 16, fontWeight: 600, color: color ?? 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{value}</span>
    </div>
  )
}
