import { useState } from 'react'
import { useStore } from '../store/useStore'
import { Plus, Trash2 } from 'lucide-react'

export function SettingsPage() {
  const { settings, updateSettings, groups, createGroup, deleteGroup } = useStore()
  const [title, setTitle] = useState(settings?.dashboard_title ?? 'HEL Dashboard')
  const [newGroup, setNewGroup] = useState('')
  const [saving, setSaving] = useState(false)

  if (!settings) return null

  const saveTitle = async () => {
    setSaving(true)
    await updateSettings({ dashboard_title: title })
    setSaving(false)
  }

  const handleAddGroup = async () => {
    if (!newGroup.trim()) return
    await createGroup({ name: newGroup.trim() })
    setNewGroup('')
  }

  return (
    <div style={{ maxWidth: 600, display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* General */}
      <section className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 24 }}>
        <h3 style={{ marginBottom: 20, fontSize: 15, fontWeight: 600 }}>General</h3>
        <div className="form-group">
          <label className="form-label">Dashboard Title</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="form-input" value={title} onChange={e => setTitle(e.target.value)} />
            <button className="btn btn-primary" onClick={saveTitle} disabled={saving} style={{ flexShrink: 0 }}>
              {saving ? '...' : 'Save'}
            </button>
          </div>
        </div>
      </section>

      {/* Appearance */}
      <section className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 24 }}>
        <h3 style={{ marginBottom: 20, fontSize: 15, fontWeight: 600 }}>Appearance</h3>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          Use the theme toggle (☀/🌙) and accent color dots in the top bar to change the look. Settings are saved automatically.
        </p>
        <div style={{ marginTop: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Current:</span>
          <span className="glass" style={{ padding: '4px 10px', borderRadius: 'var(--radius-sm)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
            {settings.theme_mode} / {settings.theme_accent}
          </span>
        </div>
      </section>

      {/* Groups */}
      <section className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 24 }}>
        <h3 style={{ marginBottom: 20, fontSize: 15, fontWeight: 600 }}>Service Groups</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {groups.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No groups yet.</p>
          )}
          {groups.map(g => (
            <div key={g.id} className="glass" style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderRadius: 'var(--radius-md)', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 14 }}>{g.icon ? `${g.icon} ` : ''}{g.name}</span>
              <button className="btn btn-danger btn-icon btn-sm" onClick={() => deleteGroup(g.id)} style={{ padding: '4px', width: 28, height: 28 }}>
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="form-input" value={newGroup} onChange={e => setNewGroup(e.target.value)} placeholder="New group name" onKeyDown={e => e.key === 'Enter' && handleAddGroup()} />
          <button className="btn btn-primary" onClick={handleAddGroup} style={{ flexShrink: 0 }}>
            <Plus size={14} /> Add
          </button>
        </div>
      </section>

      {/* Auth - placeholder */}
      <section className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 24, opacity: 0.6 }}>
        <h3 style={{ marginBottom: 8, fontSize: 15, fontWeight: 600 }}>Authentication</h3>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          🔒 Login & OIDC integration (voidauth) coming in a future phase.
        </p>
      </section>

    </div>
  )
}
