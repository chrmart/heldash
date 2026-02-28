import type { Service } from '../types'
import { useStore } from '../store/useStore'
import { Pencil, Trash2 } from 'lucide-react'

interface Props {
  onEdit: (service: Service) => void
}

export function ServicesPage({ onEdit }: Props) {
  const { services, groups, deleteService } = useStore()

  const getGroupName = (groupId: string | null) => {
    if (!groupId) return '—'
    return groups.find(g => g.id === groupId)?.name ?? '—'
  }

  const handleDelete = (service: Service) => {
    if (confirm(`Delete "${service.name}"?`)) {
      deleteService(service.id)
    }
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
    <div className="glass" style={{ borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
            <th style={thStyle}>Service</th>
            <th style={thStyle}>URL</th>
            <th style={thStyle}>Group</th>
            <th style={thStyle}>Status</th>
            <th style={thStyle}>Check</th>
            <th style={{ ...thStyle, width: 80, textAlign: 'right' }}></th>
          </tr>
        </thead>
        <tbody>
          {services.map((s, i) => (
            <tr
              key={s.id}
              style={{
                borderBottom: i < services.length - 1 ? '1px solid var(--glass-border)' : 'none',
                transition: 'background var(--transition-fast)',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--glass-bg)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <td style={tdStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 20, lineHeight: 1 }}>{s.icon ?? '🔗'}</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{s.name}</div>
                    {s.description && (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{s.description}</div>
                    )}
                  </div>
                </div>
              </td>
              <td style={tdStyle}>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--accent)', opacity: 0.8, textDecoration: 'none' }}
                >
                  {s.url}
                </a>
              </td>
              <td style={tdStyle}>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{getGroupName(s.group_id)}</span>
              </td>
              <td style={tdStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className={`service-status ${s.last_status ?? 'unknown'}`} style={{ flexShrink: 0 }} />
                  {s.last_status && s.last_status !== 'unknown' && (
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', textTransform: 'capitalize' }}>
                      {s.last_status}
                    </span>
                  )}
                </div>
              </td>
              <td style={tdStyle}>
                <span style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '3px 8px',
                  borderRadius: 'var(--radius-sm)',
                  background: s.check_enabled ? 'rgba(34,197,94,0.12)' : 'var(--glass-bg)',
                  color: s.check_enabled ? 'var(--status-online)' : 'var(--text-muted)',
                  border: `1px solid ${s.check_enabled ? 'rgba(34,197,94,0.25)' : 'var(--glass-border)'}`,
                }}>
                  {s.check_enabled ? 'On' : 'Off'}
                </span>
              </td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>
                <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
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
            </tr>
          ))}
        </tbody>
      </table>
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
