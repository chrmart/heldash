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
  auto_theme_enabled?: boolean
  auto_theme_light_start?: string  // HH:MM e.g. "08:00"
  auto_theme_dark_start?: string   // HH:MM e.g. "20:00"
  design_border_radius?: 'sharp' | 'default' | 'rounded'
  design_glass_blur?: 'subtle' | 'medium' | 'strong'
  design_density?: 'compact' | 'comfortable' | 'spacious'
  design_animations?: 'full' | 'reduced' | 'none'
  design_sidebar_style?: 'default' | 'minimal' | 'floating'
  design_custom_css?: string
  tmdb_api_key?: string
  recyclarr_container_name?: string
  recyclarr_config_path?: string
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
  group_id?: string | null
  service: Service
}

export interface DashboardArrItem {
  id: string
  type: 'arr_instance'
  position: number
  ref_id: string
  group_id?: string | null
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
  type: 'placeholder' | 'placeholder_app' | 'placeholder_widget' | 'placeholder_row'
  position: number
  group_id?: string | null
}

export interface ServerStatusConfig {
  disks: { path: string; name: string }[]
}

export interface AdGuardHomeConfig {
  url: string
  username: string
  // password intentionally omitted — never sent to frontend
}

export interface CustomButtonConfig {
  buttons: { id: string; label: string; url: string; method: 'GET' | 'POST' }[]
}

export interface HomeAssistantConfig {
  url: string
  entities: { entity_id: string; label: string }[]
  // token intentionally omitted — never sent to frontend
}

export interface PiholeConfig {
  url: string
  // password intentionally omitted — never sent to frontend
}

export interface HaEntityState {
  entity_id: string
  label: string
  state: string
  unit: string | null
  device_class: string | null
  friendly_name: string | null
}

export interface NginxPMConfig {
  url: string
  username: string
  // password intentionally omitted — never sent to frontend
}

export interface HomeAssistantEnergyConfig {
  instance_id: string
  period: 'day' | 'week' | 'month'
}

export interface CalendarWidgetConfig {
  instance_ids: string[]
  days_ahead: number
}

export interface CalendarEntry {
  id: string
  title: string
  type: 'movie' | 'episode'
  date: string        // YYYY-MM-DD
  instanceId: string
  instanceName: string
  instanceType: 'radarr' | 'sonarr'
  season_number?: number
  episode_number?: number
}

export interface EnergyData {
  configured: boolean
  period?: string
  grid_consumption?: number
  solar_production?: number
  battery_charge?: number
  grid_return?: number
  gas_consumption?: number
  self_sufficiency?: number
  chart_data?: {
    labels: string[]
    consumption: number[]
    solar: number[]
    battery: number[]
    grid_return: number[]
  }
  period_label?: string
  error?: string
}

export interface Widget {
  id: string
  type: 'server_status' | 'adguard_home' | 'docker_overview' | 'custom_button' | 'home_assistant' | 'pihole' | 'nginx_pm' | 'home_assistant_energy' | 'calendar'
  name: string
  config: ServerStatusConfig | AdGuardHomeConfig | CustomButtonConfig | HomeAssistantConfig | PiholeConfig | NginxPMConfig | CalendarWidgetConfig | Record<string, never>
  position: number
  show_in_topbar: boolean  // deprecated: use display_location
  display_location: 'topbar' | 'sidebar' | 'none'
  icon_url: string | null
  created_at: string
  updated_at: string
}

export interface ServerStats {
  cpu: { load: number }
  ram: { total: number; used: number; free: number }
  disks: { path: string; name: string; total: number; used: number; free: number; error?: 'not_mounted'; duplicate?: boolean; duplicateOf?: string }[]
}

export interface AdGuardStats {
  total_queries: number    // -1 = unreachable/error
  blocked_queries: number
  blocked_percent: number
  protection_enabled: boolean
}

export interface NpmStats {
  proxy_hosts: number
  streams: number
  certificates: number
  cert_expiring_soon: number  // expires within 30 days
}

export type WidgetStats = ServerStats | AdGuardStats | HaEntityState[] | NpmStats | CalendarEntry[]

export interface DashboardWidgetItem {
  id: string
  type: 'widget'
  position: number
  ref_id: string
  group_id?: string | null
  widget: Pick<Widget, 'id' | 'type' | 'name' | 'config' | 'show_in_topbar' | 'icon_url'>
}

export type DashboardItem = DashboardServiceItem | DashboardArrItem | DashboardPlaceholderItem | DashboardWidgetItem

export interface DashboardGroup {
  id: string
  name: string
  position: number
  col_span: number
  items: DashboardItem[]
}

export interface DashboardResponse {
  groups: DashboardGroup[]
  items: DashboardItem[]
}

export interface UserGroup {
  id: string
  name: string
  description: string | null
  is_system: boolean
  docker_access: boolean
  docker_widget_access: boolean
  background_id: string | null
  created_at: string
  hidden_service_ids: string[]
  hidden_arr_ids: string[]
  hidden_widget_ids: string[]
}

export interface Background {
  id: string
  name: string
  file_path: string
}

// ── Home Assistant ────────────────────────────────────────────────────────────

export interface HaInstance {
  id: string
  name: string
  url: string
  enabled: boolean
  position: number
  created_at: string
  updated_at: string
}

export interface HaPanel {
  id: string
  instance_id: string
  entity_id: string
  label: string | null
  panel_type: string
  position: number
  owner_id: string
  area_id: string | null
  created_at: string
}

export interface HaArea {
  area_id: string
  name: string
  icon: string | null
}

export interface HaEntityFull {
  entity_id: string
  state: string
  attributes: {
    friendly_name?: string
    unit_of_measurement?: string
    device_class?: string
    icon?: string
    // Light
    brightness?: number
    color_temp?: number
    min_color_temp_kelvin?: number
    max_color_temp_kelvin?: number
    // Climate
    temperature?: number
    current_temperature?: number
    hvac_mode?: string
    hvac_modes?: string[]
    min_temp?: number
    max_temp?: number
    // Media player
    media_title?: string
    media_artist?: string
    entity_picture?: string
    volume_level?: number
    source?: string
    source_list?: string[]
    // Cover
    current_position?: number
    [key: string]: unknown
  }
  last_changed: string
  last_updated: string
}

export interface DockerContainer {
  id: string
  name: string
  image: string
  state: string   // 'running' | 'exited' | 'paused' | 'restarting' | 'dead' | 'created'
  status: string  // human-readable e.g. "Up 3 days"
  startedAt: string | null
}

export interface ContainerStats {
  cpuPercent: number
  memUsed: number   // bytes
  memTotal: number  // bytes
}

export interface DockerLogEvent {
  stream: 'stdout' | 'stderr'
  log: string
  timestamp: string
}
