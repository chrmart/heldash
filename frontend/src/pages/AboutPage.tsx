import { useState, useEffect, useCallback } from 'react'
import { Copy, Check, ChevronDown, ChevronUp } from 'lucide-react'
import { LS_ABOUT_TAB } from '../constants'
import { api } from '../api'

// ── Types ─────────────────────────────────────────────────────────────────────
type AboutTab = 'overview' | 'setup' | 'docker' | 'media' | 'recyclarr' | 'cfmanager' | 'ha' | 'widgets' | 'design'

// ── CodeBlock ─────────────────────────────────────────────────────────────────
function CodeBlock({ children }: { children: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(children.trim())
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // ignore
    }
  }, [children])

  return (
    <div style={{ position: 'relative' }}>
      <pre style={{
        background: 'var(--bg-surface)',
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
        lineHeight: 1.7,
        padding: 'var(--spacing-lg)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--glass-border)',
        overflowX: 'auto',
        margin: 0,
        whiteSpace: 'pre',
        color: 'var(--text-primary)',
      }}>
        {children.trim()}
      </pre>
      <button
        onClick={handleCopy}
        title="Kopieren"
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '4px 10px',
          borderRadius: 'var(--radius-sm)',
          fontSize: 11,
          fontWeight: 600,
          fontFamily: 'var(--font-sans)',
          cursor: 'pointer',
          background: copied ? 'rgba(16,185,129,0.15)' : 'var(--glass-bg)',
          color: copied ? '#10b981' : 'var(--text-secondary)',
          border: `1px solid ${copied ? 'rgba(16,185,129,0.3)' : 'var(--glass-border)'}`,
          transition: 'all var(--transition-fast)',
        }}
      >
        {copied ? <Check size={11} /> : <Copy size={11} />}
        {copied ? 'Kopiert!' : 'Kopieren'}
      </button>
    </div>
  )
}

// ── DocSection ────────────────────────────────────────────────────────────────
function DocSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: 'var(--spacing-2xl)', marginBottom: 'var(--spacing-xl)' }}>
      <div className="section-header">{title}</div>
      {children}
    </div>
  )
}

// ── SimpleTable ───────────────────────────────────────────────────────────────
function SimpleTable({ headers, rows }: { headers: string[]; rows: (string | React.ReactNode)[][] }) {
  return (
    <div className="table-responsive">
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 400 }}>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} style={{
                textAlign: 'left',
                padding: '8px 12px',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.5px',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
                borderBottom: '1px solid var(--glass-border)',
                background: 'var(--glass-bg)',
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci} style={{
                  padding: '10px 12px',
                  fontSize: 13,
                  color: 'var(--text-primary)',
                  borderBottom: ri < rows.length - 1 ? '1px solid var(--glass-border)' : 'none',
                  fontFamily: typeof cell === 'string' && cell.startsWith('`') ? 'var(--font-mono)' : undefined,
                }}>{typeof cell === 'string' && cell.startsWith('`') ? cell.slice(1, -1) : cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Collapsible ───────────────────────────────────────────────────────────────
function Collapsible({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="glass" style={{ borderRadius: 'var(--radius-xl)', marginTop: 'var(--spacing-xl)', overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'var(--spacing-lg) var(--spacing-2xl)',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          fontFamily: 'var(--font-sans)',
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--text-primary)',
          textAlign: 'left',
        }}
      >
        {title}
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {open && (
        <div style={{ padding: '0 var(--spacing-2xl) var(--spacing-2xl)' }}>
          {children}
        </div>
      )}
    </div>
  )
}

// ── Tab 1: Übersicht ──────────────────────────────────────────────────────────
function TabOverview({ version }: { version: string | null }) {
  const features = [
    { icon: '🗂️', title: 'Dashboard', desc: 'Modulares Grid, Drag & Drop, Gruppen' },
    { icon: '🐳', title: 'Docker', desc: 'Container verwalten, Logs, Start/Stop' },
    { icon: '🎬', title: 'Media', desc: 'Radarr, Sonarr, Prowlarr, SABnzbd' },
    { icon: '🔎', title: 'Discover', desc: 'TMDB-Suche, Seerr-Requests' },
    { icon: '📋', title: 'Recyclarr', desc: 'TRaSH Guides Sync via GUI' },
    { icon: '🏠', title: 'Home Assistant', desc: 'Entities, Panels, Energy' },
    { icon: '🧩', title: 'Widgets', desc: 'Systemstatus, AdGuard, Nginx PM' },
    { icon: '🎨', title: 'Design', desc: 'Anpassbares Erscheinungsbild' },
  ]

  return (
    <>
      <DocSection title="HELDASH">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2xl)', flexWrap: 'wrap' }}>
          <img src="/logo.png" alt="HELDASH" style={{ width: 180, maxWidth: '100%', flexShrink: 0 }} />
          <div>
            <p style={{ fontSize: 15, lineHeight: 1.7, color: 'var(--text-secondary)', margin: 0 }}>
              Persönliches Homelab-Dashboard mit Glass-Morphism Design.<br />
              Verwalte Services, Docker-Container, Media-Automation, Home Assistant<br />
              und mehr — alles in einer Oberfläche.
            </p>
          </div>
        </div>
      </DocSection>

      <DocSection title="Features Übersicht">
        <div className="card-grid-sm">
          {features.map(f => (
            <div key={f.title} className="glass" style={{ borderRadius: 'var(--radius-lg)', padding: 'var(--spacing-lg)' }}>
              <div style={{ fontSize: 22, marginBottom: 8 }}>{f.icon}</div>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4, color: 'var(--text-primary)' }}>{f.title}</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </DocSection>

      <DocSection title="Version & Links">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-lg)', alignItems: 'center' }}>
          <span className="badge badge-neutral">
            Version: {version === null ? <span style={{ opacity: 0.5 }}>…</span> : version || '–'}
          </span>
          <a
            href="https://github.com/Kreuzbube88/heldash"
            target="_blank"
            rel="noopener noreferrer"
            className="badge badge-accent"
            style={{ textDecoration: 'none', cursor: 'pointer' }}
          >
            GitHub: Kreuzbube88/heldash
          </a>
        </div>
      </DocSection>
    </>
  )
}

// ── Tab 2: Installation & Setup ───────────────────────────────────────────────
function TabSetup() {
  return (
    <>
      <DocSection title="Docker Run">
        <CodeBlock>{`
docker run -d \\
  --name heldash \\
  -p 8282:8282 \\
  -v /mnt/cache/appdata/heldash:/data \\
  -e SECRET_KEY=$(openssl rand -hex 32) \\
  -e SECURE_COOKIES=false \\
  ghcr.io/kreuzbube88/heldash:latest
        `}</CodeBlock>
      </DocSection>

      <DocSection title="Docker Compose">
        <CodeBlock>{`
services:
  heldash:
    image: ghcr.io/kreuzbube88/heldash:latest
    container_name: heldash
    ports:
      - 8282:8282
    volumes:
      - /mnt/cache/appdata/heldash:/data
      # Für Docker-Verwaltung:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      # Für Recyclarr-Integration:
      - /mnt/cache/appdata/recyclarr:/recyclarr
    environment:
      - SECRET_KEY=DEIN_GEHEIMER_SCHLUESSEL
      - SECURE_COOKIES=false
    restart: unless-stopped
        `}</CodeBlock>
      </DocSection>

      <DocSection title="Umgebungsvariablen">
        <SimpleTable
          headers={['Variable', 'Pflicht', 'Standard', 'Beschreibung']}
          rows={[
            ['SECRET_KEY', '✅ Ja', '(unsicher)', 'JWT-Signierungsschlüssel. Generieren: openssl rand -hex 32'],
            ['SECURE_COOKIES', '✅ Ja', 'false', 'false = HTTP (LAN), true = HTTPS (hinter Reverse Proxy mit SSL)'],
            ['PORT', 'Nein', '8282', 'Fastify Listen-Port'],
            ['DATA_DIR', 'Nein', '/data', 'Datenbankpfad und Icon-Verzeichnis'],
            ['LOG_LEVEL', 'Nein', 'info', 'debug · info · warn · error'],
            ['LOG_FORMAT', 'Nein', 'pretty', 'pretty = lesbare Ausgabe, json = strukturiert für Log-Aggregatoren'],
            ['RECYCLARR_CONFIG_PATH', 'Nein', '/recyclarr/recyclarr.yml', 'Pfad zur Recyclarr-Konfigurationsdatei'],
            ['RECYCLARR_CONTAINER_NAME', 'Nein', 'recyclarr', 'Name des Recyclarr Docker-Containers'],
          ]}
        />
      </DocSection>

      <DocSection title="Erster Start">
        <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 2, fontSize: 14, color: 'var(--text-secondary)' }}>
          <li>Container starten</li>
          <li><code style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>http://server-ip:8282</code> öffnen</li>
          <li>Admin-Account anlegen (erscheint automatisch beim ersten Start)</li>
          <li>Unter <strong>Settings → General</strong>: Dashboard-Titel anpassen</li>
          <li>Unter <strong>Apps</strong>: erste Services hinzufügen</li>
        </ol>
      </DocSection>

      <DocSection title="Unraid">
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '0 0 12px' }}>
          Community Applications Template verfügbar: <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>heldash.xml</code>
        </p>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0 }}>
          Import über <strong>Community Applications → Import</strong>
        </p>
      </DocSection>

      <Collapsible title="Technische Details">
        <SimpleTable
          headers={['Schicht', 'Technologie']}
          rows={[
            ['Frontend', 'React 18, TypeScript, Vite 5'],
            ['State', 'Zustand'],
            ['Drag & Drop', '@dnd-kit'],
            ['Icons', 'lucide-react'],
            ['Styling', 'Vanilla CSS, Glass Morphism'],
            ['Backend', 'Fastify 4, TypeScript'],
            ['Datenbank', 'SQLite (WAL-Modus)'],
            ['Container', 'Docker, node:20-alpine'],
            ['Registry', 'ghcr.io/kreuzbube88/heldash'],
          ]}
        />
      </Collapsible>
    </>
  )
}

// ── Tab 3: Docker ─────────────────────────────────────────────────────────────
function TabDocker() {
  return (
    <>
      <DocSection title="Voraussetzungen">
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '0 0 12px' }}>
          Der Docker-Socket muss in den Container gemountet werden:
        </p>
        <CodeBlock>{`-v /var/run/docker.sock:/var/run/docker.sock:ro`}</CodeBlock>
      </DocSection>

      <DocSection title="Docker-Seite aktivieren">
        <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 2, fontSize: 14, color: 'var(--text-secondary)' }}>
          <li><strong>Settings → Groups</strong> → Gruppe auswählen</li>
          <li>Tab <strong>"Docker"</strong> → Docker-Seitenzugriff aktivieren</li>
        </ol>
        <div style={{ marginTop: 12 }}>
          <span className="badge badge-neutral">ℹ️ Admins haben immer Zugriff</span>
        </div>
      </DocSection>

      <DocSection title="Funktionen">
        <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 2, fontSize: 14, color: 'var(--text-secondary)' }}>
          <li>Container-Liste mit CPU/RAM-Auslastung</li>
          <li>Live-Log-Stream pro Container (stdout + stderr)</li>
          <li>Start / Stop / Restart (nur Admins)</li>
          <li>Docker Overview Widget für Dashboard/Topbar/Sidebar</li>
        </ul>
      </DocSection>

      <DocSection title="Docker Overview Widget">
        <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 2, fontSize: 14, color: 'var(--text-secondary)' }}>
          <li><strong>Widgets → + Widget hinzufügen → Typ: Docker Overview</strong></li>
          <li>Widget auf Dashboard, Topbar oder Sidebar platzieren</li>
        </ol>
        <div style={{ marginTop: 12 }}>
          <span className="badge badge-warning">⚠️ Docker Widget-Zugriff muss pro Gruppe separat aktiviert werden (Settings → Groups → Docker)</span>
        </div>
      </DocSection>
    </>
  )
}

// ── Tab 4: Media & Seerr ──────────────────────────────────────────────────────
function TabMedia() {
  return (
    <>
      <DocSection title="Unterstützte Services">
        <SimpleTable
          headers={['Service', 'Typ', 'Funktion']}
          rows={[
            ['Radarr', 'Arr', 'Film-Verwaltung, Queue, Kalender'],
            ['Sonarr', 'Arr', 'Serien-Verwaltung, Queue, Kalender'],
            ['Prowlarr', 'Arr', 'Indexer-Verwaltung'],
            ['SABnzbd', 'Downloader', 'Download-Queue, Verlauf'],
            ['Seerr', 'Request', 'Medien-Requests, Discover'],
          ]}
        />
      </DocSection>

      <DocSection title="Arr-Instanz hinzufügen">
        <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 2, fontSize: 14, color: 'var(--text-secondary)' }}>
          <li><strong>Media-Seite → + Instance</strong> (Topbar)</li>
          <li>Typ wählen: Radarr / Sonarr / Prowlarr / SABnzbd / Seerr</li>
          <li>URL und API-Key eintragen</li>
        </ol>
        <div style={{ marginTop: 12 }}>
          <span className="badge badge-neutral">🔒 API-Keys werden serverseitig gespeichert — nie an den Browser übertragen</span>
        </div>
      </DocSection>

      <DocSection title="Discover Tab (TMDB)">
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Voraussetzungen</p>
        <ul style={{ margin: '0 0 16px', paddingLeft: 20, lineHeight: 2, fontSize: 14, color: 'var(--text-secondary)' }}>
          <li>Seerr-Instanz konfiguriert</li>
          <li>TMDB API-Key hinterlegt</li>
        </ul>

        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>TMDB API-Key einrichten</p>
        <ol style={{ margin: '0 0 16px', paddingLeft: 20, lineHeight: 2, fontSize: 14, color: 'var(--text-secondary)' }}>
          <li>Kostenlosen Account auf <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>themoviedb.org</code> erstellen</li>
          <li>Unter <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>themoviedb.org/settings/api</code> → API-Key kopieren</li>
          <li>In HELDASH: <strong>Settings → General → TMDB API Key</strong> eintragen</li>
        </ol>

        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Funktionen</p>
        <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 2, fontSize: 14, color: 'var(--text-secondary)' }}>
          <li>Trending-Inhalte browsen (Heute / Diese Woche)</li>
          <li>Filter: Genre, Streaming-Dienst, Sprache, Bewertung, Erscheinungsjahr</li>
          <li>Suche nach Filmen und Serien</li>
          <li>Request per Klick → wird direkt an Seerr gesendet</li>
          <li>TV-Serien: Staffelauswahl vor dem Request</li>
        </ul>
      </DocSection>

      <DocSection title="Icon-Vererbung">
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.7 }}>
          Media-Karten übernehmen automatisch das Icon des passenden Service-Eintrags
          (Abgleich über URL). Service in Apps mit gleicher URL → Icon wird übernommen.
        </p>
      </DocSection>
    </>
  )
}

// ── Tab 5: Recyclarr ──────────────────────────────────────────────────────────
function TabTrash() {
  return (
    <>
      <DocSection title="Voraussetzungen">
        <ul style={{ margin: '0 0 16px', paddingLeft: 20, lineHeight: 2, fontSize: 14, color: 'var(--text-secondary)' }}>
          <li>Recyclarr läuft als separater Docker-Container</li>
          <li>CRON_SCHEDULE in Recyclarr deaktiviert (siehe unten)</li>
          <li>Volume-Mount in HELDASH-Container:</li>
        </ul>
        <CodeBlock>{`-v /pfad/zu/recyclarr/config:/recyclarr`}</CodeBlock>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '16px 0 8px' }}>Umgebungsvariablen in HELDASH setzen:</p>
        <CodeBlock>{`RECYCLARR_CONFIG_PATH=/recyclarr/recyclarr.yml
RECYCLARR_CONTAINER_NAME=recyclarr`}</CodeBlock>
      </DocSection>

      <DocSection title="Recyclarr Container einrichten (falls noch nicht vorhanden)">
        <CodeBlock>{`
services:
  recyclarr:
    image: ghcr.io/recyclarr/recyclarr:latest
    container_name: recyclarr
    volumes:
      - /mnt/cache/appdata/recyclarr:/config
    environment:
      - TZ=Europe/Berlin
      # CRON_SCHEDULE deaktiviert — Sync wird über HELDASH gesteuert
      # - CRON_SCHEDULE=@daily
        `}</CodeBlock>
      </DocSection>

      <DocSection title="Auto-Sync deaktivieren (wichtig!)">
        <div style={{ marginBottom: 12 }}>
          <span className="badge badge-warning">⚠️ Wenn Recyclarr mit CRON_SCHEDULE betrieben wird, läuft der Sync automatisch im Hintergrund — parallel zum Dashboard. Das kann zu Konflikten führen und sollte vermieden werden.</span>
        </div>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 12px' }}>
          Recyclarr ist ein CLI-Tool das standardmäßig nichts automatisch tut.
          Auto-Sync wird nur aktiv wenn <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>CRON_SCHEDULE</code> gesetzt ist.
        </p>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 16px' }}>
          Damit ausschließlich das Dashboard den Sync steuert:<br />
          <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>CRON_SCHEDULE</code> aus der Recyclarr <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>docker-compose.yml</code> entfernen oder auskommentieren.
        </p>

        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Vorher (Auto-Sync aktiv)</p>
        <CodeBlock>{`
environment:
  - TZ=Europe/Berlin
  - CRON_SCHEDULE=@daily   ← entfernen oder auskommentieren
        `}</CodeBlock>

        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '16px 0 8px' }}>Nachher (Sync nur über HELDASH)</p>
        <CodeBlock>{`
environment:
  - TZ=Europe/Berlin
  # - CRON_SCHEDULE=@daily  ← deaktiviert
        `}</CodeBlock>

        <div style={{ marginTop: 12 }}>
          <span className="badge badge-neutral">ℹ️ Ohne CRON_SCHEDULE bleibt der Container aktiv und wartet — Recyclarr wird nur ausgeführt wenn "Sync Now" im Dashboard geklickt wird.</span>
        </div>
      </DocSection>

      <DocSection title="Workflow">
        <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 2, fontSize: 14, color: 'var(--text-secondary)' }}>
          <li><strong>Media-Seite → Tab "Recyclarr"</strong></li>
          <li>Radarr oder Sonarr Instanz auswählen → aktivieren</li>
          <li>Quality Definition aktivieren (empfohlen)</li>
          <li>Ein oder mehrere Profile auswählen (z.B. "HD Bluray + WEB (German)")</li>
          <li>Optional: Score-Overrides für einzelne Formate anpassen</li>
          <li>Optional: Eigene Custom Formats hinzufügen (z.B. für Tdarr)</li>
          <li><strong>"Sync Now"</strong> klicken → Live-Output wird angezeigt</li>
        </ol>
      </DocSection>

      <DocSection title="Eigene Custom Formats (z.B. Tdarr)">
        <div style={{ marginBottom: 12 }}>
          <span className="badge badge-warning">⚠️ Der Name muss exakt mit dem Custom Format in Radarr/Sonarr übereinstimmen</span>
        </div>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Vorgehen</p>
        <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 2, fontSize: 14, color: 'var(--text-secondary)' }}>
          <li>Custom Format zuerst manuell in Radarr/Sonarr anlegen</li>
          <li>In HELDASH: <strong>Media → Recyclarr → Instanz → "Custom Formats" → + Hinzufügen</strong></li>
          <li>Exakten Namen eintragen + Score + Profil zuordnen</li>
          <li>Beim nächsten Sync wird der Score automatisch gesetzt und gehalten</li>
        </ol>
      </DocSection>

      <DocSection title="Schutz eigener Custom Formats">
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 12 }}>
          Recyclarr löscht standardmäßig nur Custom Formats, die es selbst angelegt hat — niemals manuell erstellte CFs.
          Damit eigene CFs (z.B. Tdarr) bei jedem Sync ihren Score behalten, reichen zwei Einstellungen:
        </p>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <th style={{ textAlign: 'left', padding: '6px 12px 6px 0', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', fontSize: 12 }}>Einstellung</th>
              <th style={{ textAlign: 'left', padding: '6px 12px 6px 0', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', fontSize: 12 }}>Wert</th>
              <th style={{ textAlign: 'left', padding: '6px 0', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', fontSize: 12 }}>Wo</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <td style={{ padding: '8px 12px 8px 0', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>delete_old_custom_formats</td>
              <td style={{ padding: '8px 12px 8px 0' }}><span className="badge badge-error">false</span></td>
              <td style={{ padding: '8px 0', color: 'var(--text-secondary)', fontSize: 13 }}>Instanz-Einstellungen → "Alte CFs löschen" deaktiviert lassen</td>
            </tr>
            <tr>
              <td style={{ padding: '8px 12px 8px 0', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>reset_unmatched_scores</td>
              <td style={{ padding: '8px 12px 8px 0' }}><span className="badge badge-error">false</span></td>
              <td style={{ padding: '8px 0', color: 'var(--text-secondary)', fontSize: 13 }}>Profil-Einstellungen → "Unmatched Scores zurücksetzen" deaktiviert lassen</td>
            </tr>
          </tbody>
        </table>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Beispiel: Tdarr-Scores in Radarr schützen</p>
        <pre style={{ background: 'var(--bg-tertiary)', borderRadius: 8, padding: '12px 16px', fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', overflowX: 'auto', margin: '0 0 12px 0', lineHeight: 1.6 }}>{`# YAML (automatisch generiert von HELDASH)
radarr:
  my-radarr:
    delete_old_custom_formats: false
    quality_profiles:
      - name: HD Bluray + WEB
        reset_unmatched_scores:
          enabled: false   # ← Tdarr-Score bleibt erhalten
    custom_formats:
      - trash_ids: [...]   # TRaSH-Formate
      - assign_scores_to:
          - name: HD Bluray + WEB
        # Tdarr CF: manuell in Radarr angelegt, Score via HELDASH gesetzt`}</pre>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="badge badge-success">✓ Mit diesen zwei Einstellungen sind alle eigenen CFs geschützt</span>
          <span className="badge badge-neutral">ℹ️ Recyclarr löscht nur CFs, die es selbst erstellt hat — manuell angelegte CFs sind immer sicher</span>
        </div>
      </DocSection>

      <DocSection title="Templates automatisch aktualisieren">
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>
          Templates werden alle 24h automatisch von GitHub (<code style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>recyclarr/config-templates</code>) aktualisiert.
          Neue Profile und Custom Formats erscheinen automatisch nach dem nächsten Refresh.<br />
          Manuell aktualisieren: <strong>"Refresh"</strong> Button oben im Recyclarr Tab (nur Admins).
        </p>
      </DocSection>
    </>
  )
}

// ── Tab 6: CF-Manager ─────────────────────────────────────────────────────────
function TabCFManager() {
  return (
    <>
      <DocSection title="CF-Manager">
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>
          Custom Formats direkt in Radarr und Sonarr verwalten —
          ohne die Oberfläche der Arr-Instanzen zu öffnen.
          Daten werden live aus der Instanz geladen.
        </p>
      </DocSection>

      <DocSection title="Instanz auswählen">
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>
          Pill-Buttons oben — eine Schaltfläche pro Radarr/Sonarr-Instanz.
          Prowlarr, SABnzbd und Seerr werden nicht unterstützt.
        </p>
      </DocSection>

      <DocSection title="Custom Formats verwalten (linke Spalte)">
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 12px' }}>
          Liste aller CFs die in der Instanz vorhanden sind.
          Suchfeld zum Filtern nach Name.
        </p>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Pro CF wird angezeigt</p>
        <ul style={{ margin: '0 0 16px', paddingLeft: 20, lineHeight: 2, fontSize: 14, color: 'var(--text-secondary)' }}>
          <li>Name</li>
          <li>Anzahl Conditions <span className="badge badge-neutral" style={{ fontSize: 11 }}>badge-neutral</span></li>
          <li>Score pro Qualitätsprofil <span className="badge badge-success" style={{ fontSize: 11, marginRight: 4 }}>positiv</span><span className="badge badge-error" style={{ fontSize: 11 }}>negativ</span></li>
          <li><span className="badge badge-accent" style={{ fontSize: 11 }}>Recyclarr: geschützt</span> wenn der CF-Name in der Recyclarr Ausnahmen-Liste (<code style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>reset_unmatched_scores.except</code>) steht</li>
        </ul>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Aktionen (nur Admins)</p>
        <ul style={{ margin: '0 0 16px', paddingLeft: 20, lineHeight: 2, fontSize: 14, color: 'var(--text-secondary)' }}>
          <li>Stift-Icon → CF bearbeiten</li>
          <li>Papierkorb-Icon → CF löschen (mit Bestätigung)</li>
        </ul>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0 }}>
          <strong>"+ Erstellen"</strong> Button (nur Admins) → Neues CF anlegen
        </p>
      </DocSection>

      <DocSection title="CF erstellen / bearbeiten">
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Felder</p>
        <ul style={{ margin: '0 0 16px', paddingLeft: 20, lineHeight: 2, fontSize: 14, color: 'var(--text-secondary)' }}>
          <li>Name (Pflicht)</li>
          <li>"Umbenennen wenn angewendet" Toggle</li>
        </ul>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Conditions</p>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 8px' }}>
          Pro Condition: Typ, Name, Negate, Pflicht, Wert<br />
          + Condition hinzufügen / × entfernen
        </p>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Unterstützte Typen</p>
        <ul style={{ margin: '0 0 16px', paddingLeft: 20, lineHeight: 2, fontSize: 14, color: 'var(--text-secondary)' }}>
          <li>Release-Titel (Regex)</li>
          <li>Sprache</li>
          <li>Quelle</li>
          <li>Auflösung</li>
          <li>Release-Gruppe</li>
          <li>Qualitäts-Modifier</li>
          <li>Dateigröße</li>
          <li>Indexer-Flag</li>
        </ul>
        <span className="badge badge-neutral">Änderungen werden direkt in Radarr/Sonarr gespeichert.</span>
      </DocSection>

      <DocSection title="Scores im Qualitätsprofil setzen (rechte Spalte)">
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 12px' }}>
          Tabs — ein Tab pro Qualitätsprofil in der Instanz.
          Mehrere Profile pro Instanz werden vollständig unterstützt.
        </p>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 16px' }}>
          Pro Profil: Tabelle aller CFs mit aktuellem Score.
          Score-Eingabe pro CF — positiv, negativ oder 0.
          <strong>"Alle Scores speichern"</strong> speichert alle Änderungen auf einmal.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="badge badge-warning">Scores die von Recyclarr verwaltet werden können beim nächsten Sync überschrieben werden — außer der CF-Name steht in der Ausnahmen-Liste unter Recyclarr → Advanced Settings.</span>
          <span className="badge badge-accent">Recyclarr: geschützt neben CFs die in der Ausnahmen-Liste stehen — diese Scores werden nicht überschrieben.</span>
        </div>
      </DocSection>

      <DocSection title="Zusammenspiel mit Recyclarr">
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 12px' }}>
          Empfohlener Workflow für eigene CFs (z.B. Tdarr):
        </p>
        <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 2, fontSize: 14, color: 'var(--text-secondary)' }}>
          <li>CF hier im CF-Manager erstellen (Name + Conditions)</li>
          <li>Score im gewünschten Qualitätsprofil setzen</li>
          <li>In <strong>Recyclarr → Instanz → Advanced Settings</strong> des Profils: CF-Namen zur Ausnahmen-Liste hinzufügen</li>
          <li>Recyclarr überschreibt diesen Score beim Sync nicht mehr</li>
        </ol>
      </DocSection>
    </>
  )
}

// ── Tab 7: Home Assistant ─────────────────────────────────────────────────────
function TabHA() {
  return (
    <>
      <DocSection title="HA-Instanz hinzufügen">
        <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 2, fontSize: 14, color: 'var(--text-secondary)' }}>
          <li><strong>Home Assistant Seite → + Instance</strong></li>
          <li>Name, URL (z.B. <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>http://homeassistant.local:8123</code>), Long-Lived Token eintragen</li>
          <li><strong>"Test"</strong> Button → Verbindung prüfen</li>
        </ol>
        <div style={{ marginTop: 12 }}>
          <span className="badge badge-neutral">🔒 Tokens werden serverseitig gespeichert — nie an den Browser übertragen</span>
        </div>
      </DocSection>

      <DocSection title="Long-Lived Token erstellen (in HA)">
        <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 2, fontSize: 14, color: 'var(--text-secondary)' }}>
          <li>Home Assistant öffnen</li>
          <li><strong>Profil → Sicherheit → Long-Lived Access Tokens → Token erstellen</strong></li>
          <li>Token kopieren und in HELDASH eintragen</li>
        </ol>
      </DocSection>

      <DocSection title="Panels hinzufügen">
        <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 2, fontSize: 14, color: 'var(--text-secondary)' }}>
          <li>Entity Browser öffnen (Lupe-Icon)</li>
          <li>Domain-Tab wählen (Lichter, Klima, Sensoren, etc.)</li>
          <li>Entity suchen und auswählen → Panel wird hinzugefügt</li>
          <li>Panels per Drag & Drop anordnen</li>
        </ol>
      </DocSection>

      <DocSection title="Räume / Areas">
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 12px' }}>
          Voraussetzung: Areas müssen in Home Assistant konfiguriert sein
          (<strong>Einstellungen → Bereiche &amp; Zonen → Bereiche</strong>)
        </p>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Ansicht wechseln</p>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 16px' }}>
          Oben auf der Home Assistant Seite: Toggle <strong>"Flach"</strong> | <strong>"Nach Raum"</strong><br />
          Preference wird lokal gespeichert
        </p>
        <SimpleTable
          headers={['Ansicht', 'Beschreibung']}
          rows={[
            ['Flach', 'Alle Panels in einem Grid — bisheriges Verhalten'],
            ['Nach Raum', 'Panels werden nach HA-Bereich gruppiert. Jeder Raum als eigener Abschnitt mit Raumname. Panels ohne Raum-Zuweisung erscheinen unter "Ohne Raum". Reihenfolge: alphabetisch, "Ohne Raum" immer zuletzt. Auf Mobile: Räume kollabierbar per Tipp auf den Header'],
          ]}
        />
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '16px 0 8px' }}>Raum automatisch erkennen</p>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 16px' }}>
          Beim Hinzufügen eines Panels wird der Raum automatisch
          aus der HA Entity-Registry übernommen (falls konfiguriert).
        </p>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Raum manuell zuweisen</p>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 16px' }}>
          Panel bearbeiten (Stift-Icon) → <strong>"Raum"</strong> Dropdown<br />
          "Kein Raum" = Panel erscheint in "Ohne Raum"
        </p>
        <span className="badge badge-neutral">Wenn keine Areas in HA konfiguriert sind, wird der Toggle ausgeblendet und die Flach-Ansicht verwendet.</span>
      </DocSection>

      <DocSection title="Unterstützte Entity-Typen">
        <SimpleTable
          headers={['Domain', 'Steuerung']}
          rows={[
            ['light.*', 'Toggle, Helligkeit, Farbtemperatur'],
            ['climate.*', 'Zieltemperatur, HVAC-Modus'],
            ['media_player.*', 'Play/Pause, Lautstärke, Quelle, Album-Cover'],
            ['cover.*', 'Öffnen/Schließen, Position'],
            ['switch.*, automation.*, fan.*', 'Toggle'],
            ['sensor.*, binary_sensor.*', 'Anzeige (schreibgeschützt)'],
            ['script.*, scene.*', 'Ausführen-Button'],
          ]}
        />
      </DocSection>

      <DocSection title="Energy Dashboard">
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Voraussetzungen</p>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '0 0 16px', lineHeight: 1.7 }}>
          HA Energy Dashboard muss in Home Assistant konfiguriert sein.
        </p>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Panel hinzufügen</p>
        <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 2, fontSize: 14, color: 'var(--text-secondary)' }}>
          <li><strong>+ Panel → Panel-Typ: Energy</strong></li>
          <li>Panel zeigt: Netzverbrauch, Solar, Autarkie, optional Gas/Einspeisung</li>
          <li>Zeitraum wählen: Heute / Diese Woche / Dieser Monat</li>
        </ol>
      </DocSection>

      <DocSection title="HA Widget">
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.7 }}>
          <strong>Settings → Widgets → + Widget → Typ: Home Assistant</strong><br />
          Entities für Topbar/Sidebar-Anzeige auswählen.
        </p>
      </DocSection>
    </>
  )
}

// ── Tab 7: Widgets ────────────────────────────────────────────────────────────
function TabWidgets() {
  const widgetTypes = [
    {
      icon: '🖥️',
      title: 'Server Status',
      desc: 'CPU, RAM, Festplatten-Auslastung (Linux-Host)',
      setup: 'Keine — zeigt automatisch Host-Ressourcen',
      badge: null,
    },
    {
      icon: '🛡️',
      title: 'AdGuard Home',
      desc: 'DNS-Statistiken, Blockierrate, Schutz-Toggle',
      setup: 'URL + Benutzername + Passwort eintragen',
      badge: null,
    },
    {
      icon: '🔐',
      title: 'Nginx Proxy Manager',
      desc: 'Aktive Proxies, Zertifikate, Ablauf-Warnungen',
      setup: 'NPM-URL + Benutzername + Passwort (Token-Authentifizierung)',
      badge: null,
    },
    {
      icon: '🐳',
      title: 'Docker Overview',
      desc: 'Container-Counts, Start/Stop/Restart',
      setup: 'Docker-Socket muss gemountet sein',
      badge: 'warning' as const,
      badgeText: 'Docker Widget-Zugriff pro Gruppe aktivieren',
    },
    {
      icon: '🏠',
      title: 'Home Assistant',
      desc: 'Entity-States in Topbar/Sidebar',
      setup: 'HA-Instanz + Entities auswählen',
      badge: null,
    },
    {
      icon: '⚡',
      title: 'HA Energy',
      desc: 'Kompakte Energie-Zusammenfassung',
      setup: 'HA-Instanz + Zeitraum auswählen. Voraussetzung: HA Energy Dashboard konfiguriert',
      badge: null,
    },
    {
      icon: '📅',
      title: 'Kalender',
      desc: 'Upcoming Radarr/Sonarr Releases',
      setup: 'Arr-Instanzen auswählen + Tage-Vorschau (1–30)',
      badge: null,
    },
  ]

  return (
    <>
      <DocSection title="Verfügbare Widget-Typen">
        <div className="card-grid-sm">
          {widgetTypes.map(w => (
            <div key={w.title} className="glass" style={{ borderRadius: 'var(--radius-lg)', padding: 'var(--spacing-lg)' }}>
              <div style={{ fontSize: 22, marginBottom: 8 }}>{w.icon}</div>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4, color: 'var(--text-primary)' }}>{w.title}</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>{w.desc}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: w.badge ? 8 : 0 }}>
                <span style={{ fontWeight: 600 }}>Einrichtung:</span> {w.setup}
              </div>
              {w.badge && (
                <span className={`badge badge-${w.badge}`} style={{ fontSize: 11 }}>⚠️ {w.badgeText}</span>
              )}
            </div>
          ))}
        </div>
      </DocSection>

      <DocSection title="Widget-Anzeigeorte">
        <SimpleTable
          headers={['Ort', 'Beschreibung']}
          rows={[
            ['Dashboard', 'Vollständige Karte im Widget-Bereich'],
            ['Topbar', 'Kompakte Stats in der oberen Leiste'],
            ['Sidebar', 'Mini-Widget in der linken Navigation'],
          ]}
        />
      </DocSection>

      <DocSection title="Gruppen-Berechtigungen für Widgets">
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.7 }}>
          <strong>Settings → Groups → Gruppe → Tab "Widgets"</strong><br />
          Einzelne Widgets für Gruppen ein-/ausblenden.
        </p>
      </DocSection>
    </>
  )
}

// ── Tab 8: Design & Einstellungen ─────────────────────────────────────────────
function TabDesign() {
  return (
    <>
      <DocSection title="Design-Tab (nur Admins)">
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '0 0 16px', lineHeight: 1.7 }}>
          <strong>Settings → Design</strong> — Änderungen gelten global für alle Nutzer.
        </p>
        <SimpleTable
          headers={['Einstellung', 'Optionen', 'Beschreibung']}
          rows={[
            ['Ecken-Stil', 'Scharf / Standard / Abgerundet', 'Radius aller Karten und Elemente'],
            ['Hintergrund-Blur', 'Subtil / Mittel / Stark', 'Stärke des Glass-Morphism Effekts'],
            ['Abstände', 'Kompakt / Komfortabel / Geräumig', 'Padding und Spacing im Layout'],
            ['Sidebar-Stil', 'Standard / Minimal / Schwebend', 'Aussehen der Navigation'],
            ['Animationen', 'Voll / Reduziert / Keine', 'Transitions und Animationen'],
            ['Custom CSS', 'Freitextfeld', 'Globale CSS-Overrides'],
          ]}
        />
      </DocSection>

      <DocSection title="Themes">
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '0 0 12px', lineHeight: 1.7 }}>
          <strong>Topbar → Mond/Sonne Icon</strong> → Hell / Dunkel umschalten<br />
          <strong>Topbar → Farbkreis</strong> → Akzentfarbe: Cyan / Orange / Magenta
        </p>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Auto-Theme (Settings → General)</p>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.7 }}>
          Automatischer Wechsel nach Uhrzeit.<br />
          Z.B. Hell ab 08:00, Dunkel ab 20:00.
        </p>
      </DocSection>

      <DocSection title="Hintergrundbilder">
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '0 0 12px', lineHeight: 1.7 }}>
          <strong>Settings → Design → Hintergrundbilder</strong>
        </p>
        <ol style={{ margin: '0 0 12px', paddingLeft: 20, lineHeight: 2, fontSize: 14, color: 'var(--text-secondary)' }}>
          <li>Bild hochladen (PNG/JPG/SVG/WebP, max. 5 MB)</li>
          <li>Unter <strong>Settings → Groups → Gruppe → Tab "Background"</strong> zuweisen</li>
        </ol>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0 }}>
          Jede Gruppe kann ein eigenes Hintergrundbild haben.
        </p>
      </DocSection>

      <DocSection title="Benutzer & Gruppen">
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '0 0 8px', lineHeight: 1.7 }}>
          <strong>Settings → Users</strong>: Nutzer anlegen, Passwort setzen, Gruppe zuweisen<br />
          <strong>Settings → Groups</strong>: Gruppen-Tabs: Apps · Media · Widgets · Docker · Background<br />
          Sichtbarkeit pro Gruppe individuell einstellbar.
        </p>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '16px 0 8px' }}>Eingebaute Gruppen</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          <span className="badge badge-accent">Admin — Vollzugriff, nicht löschbar</span>
          <span className="badge badge-neutral">Guest — Lesezugriff, kein Docker</span>
        </div>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>Gast-Modus für Admins</p>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.7 }}>
          <strong>Topbar → "Switch to Guest View"</strong><br />
          → Dashboard so einrichten wie Gäste es sehen sollen.
        </p>
      </DocSection>
    </>
  )
}

// ── AboutPage ─────────────────────────────────────────────────────────────────
const TAB_ORDER: AboutTab[] = ['overview', 'setup', 'docker', 'media', 'recyclarr', 'cfmanager', 'ha', 'widgets', 'design']

const TAB_LABELS: Record<AboutTab, string> = {
  overview: 'Übersicht',
  setup: 'Installation & Setup',
  docker: 'Docker',
  media: 'Media & Seerr',
  recyclarr: 'Recyclarr',
  cfmanager: 'CF-Manager',
  ha: 'Home Assistant',
  widgets: 'Widgets',
  design: 'Design & Einstellungen',
}

export function AboutPage() {
  const [activeTab, setActiveTab] = useState<AboutTab>(() => {
    const saved = localStorage.getItem(LS_ABOUT_TAB)
    return (saved && TAB_ORDER.includes(saved as AboutTab) ? saved : 'overview') as AboutTab
  })
  const [version, setVersion] = useState<string | null>(null)

  useEffect(() => {
    api.health()
      .then(data => setVersion(data.version ?? '–'))
      .catch(() => setVersion('–'))
  }, [])

  const handleTabChange = (tab: AboutTab) => {
    setActiveTab(tab)
    localStorage.setItem(LS_ABOUT_TAB, tab)
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Tab bar */}
      <div style={{ marginBottom: 'var(--spacing-2xl)', overflowX: 'auto' }}>
        <div className="tabs" style={{ display: 'inline-flex', minWidth: 'max-content' }}>
          {TAB_ORDER.map(tab => (
            <button
              key={tab}
              className={`tab${activeTab === tab ? ' active' : ''}`}
              onClick={() => handleTabChange(tab)}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {activeTab === 'overview'   && <TabOverview version={version} />}
      {activeTab === 'setup'      && <TabSetup />}
      {activeTab === 'docker'     && <TabDocker />}
      {activeTab === 'media'      && <TabMedia />}
      {activeTab === 'recyclarr'  && <TabTrash />}
      {activeTab === 'cfmanager'  && <TabCFManager />}
      {activeTab === 'ha'         && <TabHA />}
      {activeTab === 'widgets'    && <TabWidgets />}
      {activeTab === 'design'     && <TabDesign />}
    </div>
  )
}
