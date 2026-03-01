import type { Service } from '../types'
import { useStore } from '../store/useStore'
import { Pencil, Trash2 } from 'lucide-react'

interface Props {
  onEdit: (service: Service) => void
}

export function ServicesPage({ onEdit }: Props) {
  const { services, groups, deleteService } = useStore()

  const handleDelete = (service: Service) => {
    if (confirm(`Delete "${service.name}"?`)) {
      deleteService(service.id)
    }
  }

  if (services.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">⬡</div>
        <div className="empty-state-text">No apps yet.<br />Add your first app with the button above.</div>
      </div>
    )
  }

  // Build sections: one per group (ordered by position), then ungrouped at end
  const sortedGroups = [...groups].sort((a, b) => a.position - b.position)
  const sections: { label: string; icon: string | null; services: Service[] }[] = []

  for (const group of sortedGroups) {
    const groupServices = services.filter(s => s.group_id === group.id)
    if (groupServices.length > 0) {
      sections.push({ label: group.name, icon: group.icon, services: groupServices })
    }
  }

  const ungrouped = services.filter(s => !s.group_id)
  if (ungrouped.length > 0) {
    sections.push({ label: 'Ohne Gruppe', icon: null, services: ungrouped })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {sections.map(section => (
        <div key={section.label}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            {section.icon && <span style={{ fontSize: 16 }}>{section.icon}</span>}
            <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              {section.label}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', opacity: 0.6 }}>({section.services.length})</span>
          </div>
          <div className="glass" style={{ borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
                  <th style={thStyle}>App</th>
                  <th style={thStyle}>URL</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Check</th>
                  <th style={{ ...thStyle, width: 80, textAlign: 'right' }}></th>
                </tr>
              </thead>
              <tbody>
                {section.services.map((s, i) => (
                  <tr
                    key={s.id}
                    style={{
                      borderBottom: i < section.services.length - 1 ? '1px solid var(--glass-border)' : 'none',
                      transition: 'background var(--transition-fast)',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--glass-bg)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 20, lineHeight: 1 }}>
                          {s.icon_url
                            ? <img src={s.icon_url} alt="" style={{ width: 22, height: 22, objectFit: 'contain', borderRadius: 4 }} />
                            : (s.icon ?? '🔗')
                          }
                        </span>
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
        </div>
      ))}
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
