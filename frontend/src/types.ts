export interface Service {
  id: string
  group_id: string | null
  name: string
  url: string
  icon: string | null
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
