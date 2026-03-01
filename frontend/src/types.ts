export interface Service {
  id: string
  group_id: string | null
  name: string
  url: string
  icon: string | null
  icon_url: string | null
  description: string | null
  tags: string[] // parsed from JSON string
  position_x: number
  position_y: number
  width: number
  height: number
  check_enabled: boolean
  check_url: string | null
  check_interval: number
  last_status: 'online' | 'offline' | 'unknown' | null
  last_checked: string | null
  created_at: string
  updated_at: string
}

export interface Group {
  id: string
  name: string
  icon: string | null
  position: number
  created_at: string
  updated_at: string
}

export type ThemeMode = 'dark' | 'light'
export type ThemeAccent = 'cyan' | 'orange' | 'magenta'

export interface Settings {
  theme_mode: ThemeMode
  theme_accent: ThemeAccent
  dashboard_title: string
  auth_enabled: boolean
  auth_mode: 'none' | 'local' | 'oidc'
  [key: string]: any
}

export interface AuthUser {
  sub: string
  username: string
  role: 'admin' | 'user'
  groupId: string | null
}

export interface UserRecord {
  id: string
  username: string
  email: string | null
  first_name: string | null
  last_name: string | null
  user_group_id: string | null
  is_active: boolean
  last_login: string | null
  created_at: string
}

// ── Dashboard item types ──────────────────────────────────────────────────────
export interface DashboardServiceItem {
  id: string
  type: 'service'
  position: number
  ref_id: string
  service: Service
}

export interface DashboardArrItem {
  id: string
  type: 'arr_instance'
  position: number
  ref_id: string
  instance: {
    id: string
    type: string
    name: string
    url: string
    enabled: boolean
  }
}

export interface DashboardPlaceholderItem {
  id: string
  type: 'placeholder' | 'placeholder_app' | 'placeholder_instance' | 'placeholder_row'
  position: number
}

export type DashboardItem = DashboardServiceItem | DashboardArrItem | DashboardPlaceholderItem

export interface UserGroup {
  id: string
  name: string
  description: string | null
  is_system: boolean
  created_at: string
  hidden_service_ids: string[]
  hidden_arr_ids: string[]
}
