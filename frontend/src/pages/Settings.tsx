import { useState, useEffect } from 'react'
import { useStore } from '../store/useStore'
import { Plus, Trash2, Users, Shield, Pencil, X, Check } from 'lucide-react'
import type { UserRecord, UserGroup } from '../types'

// ── Inline user edit form ─────────────────────────────────────────────────────
function UserEditRow({
  user,
  userGroups,
  isSelf,
  onSave,
  onCancel,
}: {
  user: UserRecord
  userGroups: UserGroup[]
  isSelf: boolean
  onSave: (data: { role: string; user_group_id: string | null; is_active: boolean; password?: string }) => Promise<void>
  onCancel: () => void
}) {
  const [role, setRole] = useState(user.role)
  const [groupId, setGroupId] = useState(user.user_group_id ?? '')
  const [isActive, setIsActive] = useState(user.is_active)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setError('')
    if (password && password.length < 8) return setError('Password min. 8 Zeichen')
    setSaving(true)
    try {
      await onSave({
        role,
        user_group_id: groupId || null,
        is_active: isActive,
        ...(password ? { password } : {}),
      })
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="glass" style={{ padding: '12px 14px', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label className="form-label" style={{ fontSize: 11 }}>Role</label>
          <select className="form-input" value={role} onChange={e => setRole(e.target.value)} style={{ fontSize: 13, padding: '5px 8px' }} disabled={isSelf}>
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 120 }}>
          <label className="form-label" style={{ fontSize: 11 }}>User Group</label>
          <select className="form-input" value={groupId} onChange={e => setGroupId(e.target.value)} style={{ fontSize: 13, padding: '5px 8px' }}>
            <option value="">— no group —</option>
            {userGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label className="form-label" style={{ fontSize: 11 }}>Active</label>
          <button
            type="button"
            onClick={() => setIsActive(a => !a)}
            disabled={isSelf}
            style={{
              padding: '5px 12px',
              borderRadius: 'var(--radius-sm)',
              fontSize: 12,
              fontWeight: 600,
              cursor: isSelf ? 'default' : 'pointer',
              background: isActive ? 'rgba(34,197,94,0.12)' : 'var(--glass-bg)',
              color: isActive ? 'var(--status-online)' : 'var(--text-muted)',
              border: `1px solid ${isActive ? 'rgba(34,197,94,0.25)' : 'var(--glass-border)'}`,
            }}
          >
            {isActive ? 'Active' : 'Disabled'}
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 160 }}>
          <label className="form-label" style={{ fontSize: 11 }}>New Password (optional)</label>
          <input className="form-input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Leave empty to keep" style={{ fontSize: 13, padding: '5px 8px' }} />
        </div>
      </div>
      {error && <div style={{ fontSize: 12, color: 'var(--status-offline)' }}>{error}</div>}
      <div style={{ display: 'flex', gap: 6 }}>
        <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving} style={{ gap: 4, fontSize: 12 }}>
          <Check size={12} /> {saving ? 'Saving…' : 'Save'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onCancel} style={{ gap: 4, fontSize: 12 }}>
          <X size={12} /> Cancel
        </button>
      </div>
    </div>
  )
}

// ── Main Settings page ────────────────────────────────────────────────────────
export function SettingsPage() {
  const {
    settings, updateSettings, groups, createGroup, deleteGroup,
    isAdmin, authUser,
    users, loadUsers, createUser, updateUser, deleteUser,
    userGroups, loadUserGroups, createUserGroup, deleteUserGroup,
  } = useStore()

  const [title, setTitle] = useState(settings?.dashboard_title ?? 'HELDASH')
  const [newGroup, setNewGroup] = useState('')
  const [groupError, setGroupError] = useState('')
  const [saving, setSaving] = useState(false)

  const [newUser, setNewUser] = useState({ username: '', first_name: '', last_name: '', email: '', password: '', role: 'user' })
  const [userError, setUserError] = useState('')
  const [addingUser, setAddingUser] = useState(false)

  const [newUG, setNewUG] = useState({ name: '', description: '' })
  const [ugError, setUgError] = useState('')

  const [editingUserId, setEditingUserId] = useState<string | null>(null)

  useEffect(() => {
    if (isAdmin) {
      loadUsers().catch(() => {})
      loadUserGroups().catch(() => {})
    }
  }, [isAdmin])

  if (!settings) return null

  const saveTitle = async () => {
    setSaving(true)
    try {
      await updateSettings({ dashboard_title: title })
    } finally {
      setSaving(false)
    }
  }

  const handleAddGroup = async () => {
    if (!newGroup.trim()) return
    setGroupError('')
    try {
      await createGroup({ name: newGroup.trim() })
      setNewGroup('')
    } catch (e: any) {
      setGroupError(e.message ?? 'Failed to create group')
    }
  }

  const handleAddUser = async () => {
    setUserError('')
    if (!newUser.username.trim()) return setUserError('Username required')
    if (!newUser.first_name.trim()) return setUserError('First name required')
    if (!newUser.last_name.trim()) return setUserError('Last name required')
    if (newUser.password.length < 8) return setUserError('Password min. 8 characters')
    setAddingUser(true)
    try {
      await createUser({
        username: newUser.username.trim(),
        first_name: newUser.first_name.trim(),
        last_name: newUser.last_name.trim(),
        email: newUser.email.trim() || undefined,
        password: newUser.password,
        role: newUser.role,
      } as any)
      setNewUser({ username: '', first_name: '', last_name: '', email: '', password: '', role: 'user' })
    } catch (e: any) {
      setUserError(e.message)
    } finally {
      setAddingUser(false)
    }
  }

  const handleAddUserGroup = async () => {
    setUgError('')
    if (!newUG.name.trim()) return
    try {
      await createUserGroup({ name: newUG.name.trim(), description: newUG.description.trim() || undefined })
      setNewUG({ name: '', description: '' })
    } catch (e: any) {
      setUgError(e.message ?? 'Failed to create group')
    }
  }

  const handleSaveUser = async (userId: string, data: Parameters<typeof updateUser>[1]) => {
    await updateUser(userId, data)
    setEditingUserId(null)
  }

  const groupName = (id: string | null) => userGroups.find(g => g.id === id)?.name ?? '—'

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>

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
          Use the theme toggle (☀/🌙) and accent color dots in the top bar to change the look.
        </p>
        <div style={{ marginTop: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Current:</span>
          <span className="glass" style={{ padding: '4px 10px', borderRadius: 'var(--radius-sm)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
            {settings.theme_mode} / {settings.theme_accent}
          </span>
        </div>
      </section>

      {/* App Groups */}
      <section className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 24 }}>
        <h3 style={{ marginBottom: 20, fontSize: 15, fontWeight: 600 }}>App Groups</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {groups.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No groups yet.</p>
          )}
          {groups.map(g => (
            <div key={g.id} className="glass" style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderRadius: 'var(--radius-md)', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 14 }}>{g.icon ? `${g.icon} ` : ''}{g.name}</span>
              {isAdmin && (
                <button className="btn btn-danger btn-icon btn-sm" onClick={() => deleteGroup(g.id)} style={{ padding: '4px', width: 28, height: 28 }}>
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
        {isAdmin && (
          <>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="form-input"
                value={newGroup}
                onChange={e => setNewGroup(e.target.value)}
                placeholder="New group name"
                onKeyDown={e => e.key === 'Enter' && handleAddGroup()}
              />
              <button className="btn btn-primary" onClick={handleAddGroup} style={{ flexShrink: 0 }}>
                <Plus size={14} /> Add
              </button>
            </div>
            {groupError && <div style={{ fontSize: 12, color: 'var(--status-offline)', marginTop: 6 }}>{groupError}</div>}
          </>
        )}
      </section>

      {/* User Management — admin only */}
      {isAdmin && (
        <section className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 24 }}>
          <h3 style={{ marginBottom: 16, fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Users size={15} /> Users
          </h3>

          {/* User list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            {users.length === 0 && (
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No users loaded.</p>
            )}
            {users.map(u => (
              <div key={u.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {/* User row */}
                <div className="glass" style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderRadius: 'var(--radius-md)', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {u.username}
                      {u.id === authUser?.sub && (
                        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 'var(--radius-sm)', background: 'var(--glass-bg)', color: 'var(--accent)', border: '1px solid var(--glass-border)' }}>you</span>
                      )}
                      {!u.is_active && (
                        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 'var(--radius-sm)', background: 'var(--glass-bg)', color: 'var(--text-muted)', border: '1px solid var(--glass-border)' }}>disabled</span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <span>{u.first_name} {u.last_name}</span>
                      {u.email && <span>{u.email}</span>}
                      <span style={{ color: u.role === 'admin' ? 'var(--accent)' : 'inherit' }}>{u.role}</span>
                      <span>Group: {groupName(u.user_group_id)}</span>
                      {u.last_login && <span>Last login: {new Date(u.last_login).toLocaleDateString('de-DE')}</span>}
                    </div>
                  </div>
                  <button
                    className="btn btn-ghost btn-icon btn-sm"
                    onClick={() => setEditingUserId(editingUserId === u.id ? null : u.id)}
                    data-tooltip="Edit"
                    style={{ padding: '4px', width: 28, height: 28, flexShrink: 0 }}
                  >
                    <Pencil size={12} />
                  </button>
                  {u.id !== authUser?.sub && (
                    <button
                      className="btn btn-danger btn-icon btn-sm"
                      onClick={() => { if (confirm(`Delete user "${u.username}"?`)) deleteUser(u.id) }}
                      data-tooltip="Delete"
                      style={{ padding: '4px', width: 28, height: 28, flexShrink: 0 }}
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>

                {/* Inline edit form */}
                {editingUserId === u.id && (
                  <UserEditRow
                    user={u}
                    userGroups={userGroups}
                    isSelf={u.id === authUser?.sub}
                    onSave={(data) => handleSaveUser(u.id, data)}
                    onCancel={() => setEditingUserId(null)}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Add user form */}
          <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Add User</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="form-input" placeholder="Username *" value={newUser.username} onChange={e => setNewUser(u => ({ ...u, username: e.target.value }))} style={{ flex: 1 }} />
              <select className="form-input" value={newUser.role} onChange={e => setNewUser(u => ({ ...u, role: e.target.value }))} style={{ flexShrink: 0, width: 100 }}>
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="form-input" placeholder="First Name *" value={newUser.first_name} onChange={e => setNewUser(u => ({ ...u, first_name: e.target.value }))} style={{ flex: 1 }} />
              <input className="form-input" placeholder="Last Name *" value={newUser.last_name} onChange={e => setNewUser(u => ({ ...u, last_name: e.target.value }))} style={{ flex: 1 }} />
            </div>
            <input className="form-input" placeholder="Email (optional)" type="email" value={newUser.email} onChange={e => setNewUser(u => ({ ...u, email: e.target.value }))} />
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="form-input" placeholder="Password (min. 8 chars) *" type="password" value={newUser.password} onChange={e => setNewUser(u => ({ ...u, password: e.target.value }))} style={{ flex: 1 }} />
              <button className="btn btn-primary" onClick={handleAddUser} disabled={addingUser} style={{ flexShrink: 0 }}>
                <Plus size={14} /> Add
              </button>
            </div>
            {userError && <div style={{ fontSize: 12, color: 'var(--status-offline)' }}>{userError}</div>}
          </div>
        </section>
      )}

      {/* User Groups — admin only */}
      {isAdmin && (
        <section className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 24 }}>
          <h3 style={{ marginBottom: 16, fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Shield size={15} /> User Groups
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {userGroups.map(g => (
              <div key={g.id} className="glass" style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderRadius: 'var(--radius-md)', justifyContent: 'space-between', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {g.name}
                    {g.is_system && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 'var(--radius-sm)', background: 'var(--glass-bg)', color: 'var(--text-muted)', border: '1px solid var(--glass-border)' }}>system</span>}
                  </div>
                  {g.description && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{g.description}</div>}
                </div>
                {!g.is_system && (
                  <button
                    className="btn btn-danger btn-icon btn-sm"
                    onClick={() => { if (confirm(`Delete group "${g.name}"?`)) deleteUserGroup(g.id) }}
                    style={{ padding: '4px', width: 28, height: 28, flexShrink: 0 }}
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="form-input" placeholder="Group name" value={newUG.name} onChange={e => setNewUG(g => ({ ...g, name: e.target.value }))} style={{ flex: 1 }} />
            <input className="form-input" placeholder="Description (optional)" value={newUG.description} onChange={e => setNewUG(g => ({ ...g, description: e.target.value }))} style={{ flex: 1 }} />
            <button className="btn btn-primary" onClick={handleAddUserGroup} style={{ flexShrink: 0 }}>
              <Plus size={14} /> Add
            </button>
          </div>
          {ugError && <div style={{ fontSize: 12, color: 'var(--status-offline)', marginTop: 6 }}>{ugError}</div>}
        </section>
      )}

      {/* OIDC — placeholder */}
      <section className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 24, opacity: 0.5, pointerEvents: 'none' }}>
        <h3 style={{ marginBottom: 8, fontSize: 15, fontWeight: 600 }}>OIDC / SSO</h3>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          🔒 OIDC integration via voidauth — coming in a future phase. User records are already prepared with email, first/last name, and OIDC fields.
        </p>
      </section>

    </div>
  )
}
