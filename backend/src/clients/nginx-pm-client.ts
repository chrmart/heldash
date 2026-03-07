import { request, Agent } from 'undici'

interface ProxyHost {
  id: number
  domain_names: string[]
  forward_scheme: 'http' | 'https'
  forward_host: string
  forward_port: number
  enabled: number
  meta: {
    letsencrypt_agree?: boolean
    letsencrypt_email?: string
    dns_challenge?: boolean
  }
  certificate_id: number | null
}

interface Certificate {
  id: number
  provider: 'letsencrypt' | 'other'
  domain_names: string[]
  expires_on: string
}

interface NpmStatus {
  uptime: number
  proxyCount: number
  certificateCount: number
  totalExpiredCerts: number
  totalExpiringCertificates: number
}

export class NginxPMClient {
  private baseUrl: string
  private username: string
  private password: string
  private token: string | null = null
  private tokenExpiry: number = 0
  private agent: Agent

  constructor(url: string, username: string, password: string) {
    this.baseUrl = url.replace(/\/$/, '')
    this.username = username
    this.password = password
    this.agent = new Agent({
      headersTimeout: 5_000,
      bodyTimeout: 5_000,
      connect: { rejectUnauthorized: false },
    })
  }

  private async getToken(): Promise<string> {
    // Token noch gültig? (cached für 6 Stunden)
    if (this.token && this.tokenExpiry > Date.now()) {
      return this.token
    }

    // Neuen Token holen
    const url = `${this.baseUrl}/api/tokens`
    const res = await request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identity: this.username,
        secret: this.password,
      }),
      dispatcher: this.agent,
    })

    let body = ''
    for await (const chunk of res.body) {
      body += chunk
    }

    if (res.statusCode === 401) throw new Error('NPM: Invalid credentials')
    if (res.statusCode === 403) throw new Error('NPM: Access denied')
    if (res.statusCode >= 500) throw new Error('NPM: Server error')
    if (res.statusCode >= 400) throw new Error('NPM: Auth failed')

    const data = JSON.parse(body)
    this.token = data.token
    // Token gültig für 6 Stunden
    this.tokenExpiry = Date.now() + (6 * 60 * 60 * 1000)
    return this.token
  }

  private async fetchApi<T>(path: string, options?: Record<string, any>): Promise<T> {
    const url = `${this.baseUrl}/api${path}`
    const token = await this.getToken()

    const res = await request(url, {
      method: 'GET',
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        ...options?.headers,
      },
      dispatcher: this.agent,
    })

    if (res.statusCode === 401) throw new Error('NPM: Invalid credentials or token expired')
    if (res.statusCode === 403) throw new Error('NPM: Access denied')
    if (res.statusCode >= 500) throw new Error('NPM: Server error')
    if (res.statusCode >= 400) throw new Error('NPM: Not found')

    let body = ''
    for await (const chunk of res.body) {
      body += chunk
    }

    return JSON.parse(body)
  }

  async getStatus(): Promise<NpmStatus> {
    try {
      const [proxies, certs] = await Promise.all([
        this.fetchApi<{ data: ProxyHost[] }>('/nginx/proxies'),
        this.fetchApi<{ data: Certificate[] }>('/certificates'),
      ])

      const proxyCount = proxies.data.length
      const enabledCount = proxies.data.filter(p => p.enabled === 1).length

      const now = new Date()
      let totalExpiredCerts = 0
      let totalExpiringCertificates = 0

      certs.data.forEach(cert => {
        const expiryDate = new Date(cert.expires_on)
        const daysUntilExpiry = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

        if (daysUntilExpiry < 0) {
          totalExpiredCerts++
        } else if (daysUntilExpiry <= 30) {
          totalExpiringCertificates++
        }
      })

      return {
        uptime: Math.floor(process.uptime()),
        proxyCount: enabledCount,
        certificateCount: certs.data.length,
        totalExpiredCerts,
        totalExpiringCertificates,
      }
    } catch (err) {
      throw new Error(`NPM API error: ${(err as Error).message}`)
    }
  }

  async getProxies(): Promise<ProxyHost[]> {
    const result = await this.fetchApi<{ data: ProxyHost[] }>('/nginx/proxies')
    return result.data
  }

  async getCertificates(): Promise<Certificate[]> {
    const result = await this.fetchApi<{ data: Certificate[] }>('/certificates')
    return result.data
  }
}
