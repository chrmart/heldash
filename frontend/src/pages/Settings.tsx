import { useState, useEffect } from 'react'
import { useStore } from '../store/useStore'
import { useArrStore } from '../store/useArrStore'
import { useWidgetStore } from '../store/useWidgetStore'
import { Plus, Trash2, Users, Shield, Pencil, X, Check, Eye, EyeOff } from 'lucide-react'
import type { UserRecord, UserGroup, Service } from '../types'
import type { ArrInstance } from '../types/arr'

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
  onSave: (data: { user_group_id: string | null; is_active: boolean; password?: string }) => Promise<void>
  onCancel: () => void
}) {
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 120 }}>
          <label className="form-label" style={{ fontSize: 11 }}>Group</label>
          <select className="form-input" value={groupId} onChange={e => setGroupId(e.target.value)} style={{ fontSize: 13, padding: '5px 8px' }} disabled={isSelf}>
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

// ── Reusable visibility checklist ─────────────────────────────────────────────
function VisibilityChecklist({
  label,
  items,
  hiddenIds,
  onSave,
}: {
  label: string
  items: { id: string; name: string; icon?: string | null; icon_url?: string | null }[]
  hiddenIds: string[]
  onSave: (hiddenIds: string[]) => Promise<void>
}) {
  const [hidden, setHidden] = useState<Set<string>>(new Set(hiddenIds))
  const [saving, setSaving] = useState(false)

  useEffect(() => { setHidden(new Set(hiddenIds)) }, [hiddenIds.join(',')])

  const toggle = (id: string) => setHidden(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>{label}</div>
      {items.length === 0
        ? <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>None configured yet.</span>
        : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {items.map(item => {
              const visible = !hidden.has(item.id)
              return (
                <label key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
                  <input type="checkbox" checked={visible} onChange={() => toggle(item.id)} style={{ accentColor: 'var(--accent)', width: 14, height: 14 }} />
                  {item.icon_url
                    ? <img src={item.icon_url} alt="" style={{ width: 16, height: 16, objectFit: 'contain', borderRadius: 3, flexShrink: 0 }} />
                    : item.icon ? <span style={{ fontSize: 14, lineHeight: 1 }}>{item.icon}</span> : null
                  }
                  <span style={{ color: visible ? 'var(--text-primary)' : 'var(--text-muted)' }}>{item.name}</span>
                  {visible
                    ? <Eye size={11} style={{ color: 'var(--status-online)', marginLeft: 'auto' }} />
                    : <EyeOff size={11} style={{ color: 'var(--text-muted)', marginLeft: 'auto' }} />
                  }
                </label>
              )
            })}
          </div>
        )
      }
      <button className="btn btn-primary btn-sm" onClick={async () => { setSaving(true); try { await onSave([...hidden]) } finally { setSaving(false) } }} disabled={saving} style={{ alignSelf: 'flex-start', fontSize: 12, marginTop: 2 }}>
        <Check size={12} /> {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  )
}

// ── Per-group visibility editor (Apps + Media + Widgets) ──────────────────────
function GroupVisibilityEditor({
  group,
  services,
  arrInstances,
  widgets,
  onSaveApps,
  onSaveArr,
  onSaveWidgets,
}: {
  group: UserGroup
  services: Service[]
  arrInstances: ArrInstance[]
  widgets: { id: string; name: string }[]
  onSaveApps: (hiddenIds: string[]) => Promise<void>
  onSaveArr: (hiddenIds: string[]) => Promise<void>
  onSaveWidgets: (hiddenIds: string[]) => Promise<void>
}) {
  const [tab, setTab] = useState<'apps' | 'media' | 'widgets'>('apps')

  return (
    <div style={{ padding: '10px 14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: 4 }}>
        {(['apps', 'media', 'widgets'] as const).map(t => (
          <button
            key={t}
            className="btn btn-ghost btn-sm"
            onClick={() => setTab(t)}
            style={{ fontSize: 11, padding: '3px 10px', textTransform: 'capitalize', color: tab === t ? 'var(--accent)' : 'var(--text-muted)', borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent', borderRadius: 0 }}
          >
            {t === 'apps' ? 'Apps' : t === 'media' ? 'Media' : 'Widgets'}
          </button>
        ))}
      </div>
      {tab === 'apps' && <VisibilityChecklist label="Visibility" items={services} hiddenIds={group.hidden_service_ids} onSave={onSaveApps} />}
      {tab === 'media' && <VisibilityChecklist label="Visibility" items={arrInstances.map(i => ({ id: i.id, name: i.name }))} hiddenIds={group.hidden_arr_ids} onSave={onSaveArr} />}
      {tab === 'widgets' && <VisibilityChecklist label="Visibility" items={widgets} hiddenIds={group.hidden_widget_ids ?? []} onSave={onSaveWidgets} />}
    </div>
  )
}

// ── Main Settings page ────────────────────────────────────────────────────────
export function SettingsPage() {
  const {
    settings, updateSettings, groups, createGroup, deleteGroup,
    services,
    isAdmin, authUser,
    users, loadUsers, createUser, updateUser, deleteUser,
    userGroups, loadUserGroups, createUserGroup, deleteUserGroup, updateGroupVisibility, updateArrVisibility, updateWidgetVisibility,
  } = useStore()
  const { instances: arrInstances, loadInstances } = useArrStore()
  const { widgets, loadWidgets } = useWidgetStore()

  const [title, setTitle] = useState(settings?.dashboard_title ?? 'HELDASH')
  const [newGroup, setNewGroup] = useState('')
  const [groupError, setGroupError] = useState('')
  const [saving, setSaving] = useState(false)

  const [newUser, setNewUser] = useState({ username: '', first_name: '', last_name: '', email: '', password: '', user_group_id: 'grp_guest' })
  const [userError, setUserError] = useState('')
  const [addingUser, setAddingUser] = useState(false)

  const [newUG, setNewUG] = useState({ name: '', description: '' })
  const [ugError, setUgError] = useState('')

  const [editingUserId, setEditingUserId] = useState<string | null>(null)
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null)

  useEffect(() => {
    if (isAdmin) {
      loadUsers().catch(() => {})
      loadUserGroups().catch(() => {})
      loadInstances().catch(() => {})
      loadWidgets().catch(() => {})
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
        user_group_id: newUser.user_group_id || undefined,
      })
      setNewUser({ username: '', first_name: '', last_name: '', email: '', password: '', user_group_id: 'grp_guest' })
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

  const groupName = (id: string | null) => {
    if (!id) return '—'
    const g = userGroups.find(g => g.id === id)
    return g ? g.name : '—'
  }

  const isAdmin_group = (id: string | null) => id === 'grp_admin'

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
                      <span style={{ color: isAdmin_group(u.user_group_id) ? 'var(--accent)' : 'inherit' }}>
                        {groupName(u.user_group_id)}
                      </span>
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
            <input className="form-input" placeholder="Username *" value={newUser.username} onChange={e => setNewUser(u => ({ ...u, username: e.target.value }))} />
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="form-input" placeholder="First Name *" value={newUser.first_name} onChange={e => setNewUser(u => ({ ...u, first_name: e.target.value }))} style={{ flex: 1, minWidth: 0 }} />
              <input className="form-input" placeholder="Last Name *" value={newUser.last_name} onChange={e => setNewUser(u => ({ ...u, last_name: e.target.value }))} style={{ flex: 1, minWidth: 0 }} />
            </div>
            <input className="form-input" placeholder="Email (optional)" type="email" value={newUser.email} onChange={e => setNewUser(u => ({ ...u, email: e.target.value }))} />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label className="form-label" style={{ fontSize: 11, whiteSpace: 'nowrap', margin: 0 }}>Group</label>
              <select className="form-input" value={newUser.user_group_id} onChange={e => setNewUser(u => ({ ...u, user_group_id: e.target.value }))} style={{ flex: 1, minWidth: 0 }}>
                {userGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="form-input" placeholder="Password (min. 8 chars) *" type="password" value={newUser.password} onChange={e => setNewUser(u => ({ ...u, password: e.target.value }))} style={{ flex: 1, minWidth: 0 }} />
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
              <div key={g.id} className="glass" style={{ borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                {/* Group header row */}
                <div style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {g.name}
                      {g.is_system && (
                        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 'var(--radius-sm)', background: 'var(--glass-bg)', color: 'var(--text-muted)', border: '1px solid var(--glass-border)' }}>system</span>
                      )}
                      {g.id === 'grp_admin' && (
                        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 'var(--radius-sm)', background: 'rgba(var(--accent-rgb),0.12)', color: 'var(--accent)', border: '1px solid rgba(var(--accent-rgb),0.25)' }}>full access</span>
                      )}
                    </div>
                    {g.description && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{g.description}</div>}
                  </div>
                  {/* Visibility toggle button — not for admin group */}
                  {g.id !== 'grp_admin' && (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setExpandedGroupId(expandedGroupId === g.id ? null : g.id)}
                      style={{ fontSize: 11, gap: 4, padding: '4px 8px' }}
                    >
                      <Eye size={11} />
                      {expandedGroupId === g.id ? 'Close' : 'Visibility'}
                    </button>
                  )}
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
                {/* Expanded visibility editor */}
                {expandedGroupId === g.id && g.id !== 'grp_admin' && (
                  <div style={{ borderTop: '1px solid var(--glass-border)' }}>
                    <GroupVisibilityEditor
                      group={g}
                      services={services}
                      arrInstances={arrInstances}
                      widgets={widgets.map(w => ({ id: w.id, name: w.name }))}
                      onSaveApps={(hiddenIds) => updateGroupVisibility(g.id, hiddenIds)}
                      onSaveArr={(hiddenIds) => updateArrVisibility(g.id, hiddenIds)}
                      onSaveWidgets={(hiddenIds) => updateWidgetVisibility(g.id, hiddenIds)}
                    />
                  </div>
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
          OIDC integration via voidauth — coming in a future phase. User records are already prepared with email, first/last name, and OIDC fields.
        </p>
      </section>

    </div>
  )
}
