export interface UnraidInstance {
  id: string; name: string; url: string
  enabled: boolean; position: number
  created_at: string; updated_at: string
}
export interface UnraidOs { platform?: string; distro?: string; release?: string; uptime?: number; hostname?: string; arch?: string }
export interface UnraidCpu { manufacturer?: string; brand?: string; cores?: number; threads?: number }
export interface UnraidBaseboard { manufacturer?: string; model?: string; version?: string }
export interface UnraidMetricsMemory { used?: number; total?: number; percentTotal?: number }
export interface UnraidMetricsCpu { percentTotal?: number }
export interface UnraidMetrics { memory?: UnraidMetricsMemory; cpu?: UnraidMetricsCpu }
export interface UnraidInfo {
  info?: {
    id?: string; time?: string
    os?: UnraidOs; cpu?: UnraidCpu; baseboard?: UnraidBaseboard
    versions?: { core?: { unraid?: string } }
  }
  metrics?: UnraidMetrics
  vars?: { version?: string; name?: string }
  online?: boolean
}
export interface UnraidDisk {
  id?: string; idx?: number; name?: string; device?: string; size?: number
  status?: string; temp?: number | null; rotational?: boolean
  fsSize?: number; fsFree?: number; fsUsed?: number
  fsUsedPercent?: number | null
  type?: string; isSpinning?: boolean | null
}
export interface UnraidCapacity { kilobytes?: { free?: string; used?: string; total?: string } }
export interface UnraidParityCheckStatus {
  status?: string; running?: boolean; paused?: boolean; correcting?: boolean
  progress?: number; errors?: number; speed?: string; date?: string; duration?: number
}
export interface UnraidArray {
  array?: {
    state?: string
    capacity?: UnraidCapacity
    parityCheckStatus?: UnraidParityCheckStatus
    parities?: UnraidDisk[]
    disks?: UnraidDisk[]
    caches?: UnraidDisk[]
  }
}
export interface UnraidParityHistory {
  date?: string; duration?: number; speed?: string; status?: string; errors?: number
  progress?: number; correcting?: boolean; paused?: boolean; running?: boolean
}
export interface UnraidContainer {
  id?: string; names?: string[]; state?: string; status?: string
  image?: string; autoStart?: boolean
  hostConfig?: { networkMode?: string }
}
export interface UnraidVm {
  id?: string; name?: string; state?: string
}
export interface UnraidShare {
  id?: string; name?: string; comment?: string
  free?: number; used?: number; size?: number
  cache?: boolean; luksStatus?: string; color?: string
  security?: string; cacheEnabled?: boolean
}
export interface UnraidUser { name?: string; description?: string; role?: string }
export interface UnraidNotification {
  id?: string; title?: string; subject?: string; description?: string
  importance?: string; timestamp?: string; read?: boolean
}
export interface UnraidNotificationCount { info?: number; warning?: number; alert?: number; total?: number }
export interface UnraidNotifications {
  notifications?: {
    overview?: {
      unread?: UnraidNotificationCount
      total?: UnraidNotificationCount
    }
    list?: UnraidNotification[]
  }
}
export interface UnraidConfig {
  config?: { valid?: boolean; error?: string; registrationTo?: string; registrationType?: string }
}
export interface UnraidRegistration {
  registration?: { id?: string; type?: string; state?: string; expiration?: string }
  vars?: { version?: string; name?: string; regTo?: string }
}
