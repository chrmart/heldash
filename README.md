# HELDASH

Persönliches Homelab-Dashboard mit Glass-Morphism Design.
Verwalte Services, Docker-Container, Media-Automation,
Home Assistant und mehr — alles in einer Oberfläche.

> ⚠️ **Nutzung auf eigenes Risiko**
>
> Dieses Projekt wurde vollständig mit Claude Code (KI-gestützte Programmierung)
> entwickelt. Es hat **keine manuelle Code-Review durch einen professionellen
> Entwickler** stattgefunden. Der Code wurde nicht auf Sicherheitslücken,
> Produktionsreife oder Best Practices geprüft.
>
> **Es wird ausdrücklich NICHT empfohlen, HELDASH öffentlich im Internet
> bereitzustellen.** Das Dashboard ist ausschließlich für den Einsatz im
> lokalen Heimnetzwerk (LAN) gedacht.
>
> Die Nutzung erfolgt vollständig auf eigenes Risiko.

---

## Sprache / Language

> 🇩🇪 Das Dashboard ist aktuell nur auf Deutsch verfügbar.
> Contributions für weitere Sprachen (i18n) sind willkommen.
>
> 🇬🇧 The dashboard is currently available in German only.
> i18n contributions for additional languages are welcome.

---

## Features

**Dashboard**
- 🗂️ Modulares Grid — Apps, Media-Instanzen und Widgets frei anordnen
- 📱 Vollständig responsiv — Desktop, Tablet und Mobile optimiert
- 📏 Responsives Grid — auto-fill Layout passt sich der Bildschirmgröße an
- 🧩 Widget-Streifen — ungegruppierte Widgets in eigenem Bereich
- 📦 Dashboard-Gruppen — benannte Container, Breite 25–100%,
    kollabierbar auf Mobile, Drag & Drop, Doppelklick zum Umbenennen
- ✅ Dashboard & Health-Check Toggles — Ein-Klick-Steuerung
- 🖱️ Edit-Modus — Drag & Drop mit Touch-Unterstützung auf Mobile
- 📐 Platzhalter-Kacheln — Platz reservieren und Reihen strukturieren
- 👥 Per-User Dashboards — eigenes Layout pro Nutzer
- 🔗 App-Kacheln verlinken direkt zur Service-URL
- 🔴 Live Online/Offline-Statuspunkte

**Navigation**
- 🖥️ Desktop: kollabierbare Sidebar — Icons + Labels oder nur Icons
- 📱 Mobile: Bottom-Navigation-Bar, respektiert Nutzerberechtigungen

**Apps**
- 📋 App-Liste gruppiert nach Kategorien
- ➕ Hinzufügen, bearbeiten, löschen mit Icon (PNG/JPG/SVG oder Emoji)
- 🔁 Automatische Health-Checks per HTTP — serverseitiger Scheduler (alle 2 min), Frontend liest alle 30s
- 🏷️ Tags und Beschreibung pro App

**Media**
- 🎬 Radarr — Film-Statistiken, Download-Queue, Kalender
- 📺 Sonarr — Serien-Statistiken, Download-Queue, Kalender
- 🔍 Prowlarr — Indexer-Liste und 24h-Grab-Statistiken
- ⬇️ SABnzbd — Queue mit Fortschrittsbalken, Download-Verlauf
- 🖼️ Media-Karten erben Icons von passenden App-Einträgen
- 🔒 API-Keys ausschließlich serverseitig

**Seerr / Discover**
- 🔎 Discover-Tab — powered by TMDB: Trending-Filme und Serien
- 🎛️ Erweiterte Filter — Genre, Streaming-Dienst, Sprache, Bewertung, Jahr
- 🔀 Sortierung nach Popularität, Bewertung, Datum oder Titel
- 📺 Echte Staffelauswahl — verfügbare/ausstehende/fehlende Staffeln
- 📥 Filme und Staffeln direkt per Seerr requesten
- 🟢 Intelligenter Request-Button — Live-Verfügbarkeit aus Seerr
- ➕ Load more Pagination

**Recyclarr**
- 🔄 Recyclarr v8 GUI — recyclarr.yml automatisch generiert
- ⚙️ Wizard für Ersteinrichtung, danach Verwaltung im Recyclarr-Tab
- 📊 TRaSH CFs nach Custom Format Groups gruppiert — nur Profil-relevante Gruppen (≥50% Überschneidung) angezeigt
- 🔍 CF-Suche filtert über alle Gruppen, klappt Treffer automatisch auf
- 🎚️ Score-Overrides pro CF pro Profil + Heatmap-Ansicht
- 📊 Profil-Vergleich bei mehreren Profilen (Unterschiede hervorgehoben)
- 👤 Eigene CFs aus CF-Manager pro Profil aktivieren mit eigenem Score
- 🛡️ reset_unmatched_scores + except + except_patterns (Regex)
- ⏰ Sync-Zeitplan: manuell, täglich, wöchentlich oder Cron — Zeitplan wird sofort aktiv (kein Neustart)
- 🔍 Score-Change Detection bei manuellen Änderungen in Radarr/Sonarr
- 📜 Sync-Verlauf der letzten 10 Syncs mit Output auf Anfrage
- 💾 Automatisches Config-Backup vor jedem Sync (max 5 Backups)

**CF-Manager**
- 📝 Eigene Custom Formats in Radarr/Sonarr erstellen, bearbeiten, löschen
- ➕ Vollständiger Conditions-Editor (Schema direkt aus Arr-API geladen)
- 📥 Import aus Radarr/Sonarr — erkennt automatisch welche CFs nicht von TRaSH kommen
- 📤 Export einzelner CFs als JSON (kompatibel mit TRaSH Guides Format)
- 📋 Vorlagen für alle Condition-Typen (Release-Titel, Sprache, Quelle, Auflösung, etc.)
- 🔀 CF kopieren — innerhalb gleicher Instanz oder cross-service (Radarr ↔ Sonarr)
- 🔒 Schutz vor Löschen aktiver Recyclarr-CFs

**Docker**
- 🐳 Live-Container-Liste mit CPU/RAM, State-Badges, Uptime
- 📋 Sortierbare Container-Tabelle
- 📊 Übersichtsleiste — Total / Running / Stopped / Restarting
- 📜 Live-Log-Streaming per SSE (stdout + stderr)
- ⚡ Echtzeit-Statusupdates via Docker Events stream (kein Polling)
- ▶️ Start / Stop / Restart (nur Admins)
- 🔒 Docker-Seitenzugriff per Gruppe konfigurierbar

**Logbuch**
- 📋 Zentrales Monitoring-Center — alle Aktivitäten an einem Ort
- 💯 Homelab Health Score (0–100) — berechnet aus Services, Docker, Recyclarr, HA
- 📅 Ereignis-Kalender — GitHub-Graph-Stil, letzten 84 Tage
- 🔔 Anomalie-Erkennung — instabile Services automatisch markiert
- 📊 Tabs: Aktivitäten | Uptime | Sync-Verlauf | Docker Events
- 🔍 Filter nach Kategorie, Zeitraum und Freitext
- 🔄 Erweiterbar — neue Integrationen (z.B. Unraid) als eigener Tab

**Home Assistant**
- 🏠 Multi-Instanz-Support (hinzufügen/bearbeiten/löschen/testen)
- 🔍 Entity-Browser — Domain-Filter-Tabs + Suche
- 🃏 Panel-Grid — domain-aware Karten, Echtzeit-WebSocket, Drag & Drop
- 💡 Lichter — Toggle, Helligkeit, Farbtemperatur
- 🌡️ Klima — Ist- + Zieltemperatur, HVAC-Modus
- 🎵 Media Player — Steuerung, Lautstärke, Quellauswahl, Album-Cover
- 🪟 Cover — Öffnen/Stopp/Schließen + Positions-Slider
- 📊 Sensoren — Wert mit Einheit, zuletzt aktualisiert (schreibgeschützt)
- ▶️ Scripts & Szenen — Aktions-Button
- ⚡ Energie-Dashboard — Solar, Netz, Autarkie-Chart,
    Heute / Diese Woche / Dieser Monat
- 🏠 Räume/Areas — Panels nach HA-Bereichen gruppieren,
    automatische Raum-Erkennung aus Entity-Registry
- 🔒 Long-Lived Access Tokens ausschließlich serverseitig

**Widgets**
- 🖥️ Server Status — Live CPU, RAM, Festplatten (Linux-Host)
- 🛡️ AdGuard Home — DNS-Statistiken, Blockierrate, Schutz-Toggle
- 🕳️ Pi-hole — DNS-Statistiken, Blockierrate, Schutz-Toggle
- 🐳 Docker Overview — Container-Counts + Steuerung
- 🔐 Nginx Proxy Manager — Proxies, Zertifikate, Ablauf-Warnungen
- 🏠 Home Assistant Widget — Entity-States überall
- ⚡ HA Energy Widget — kompakte Energie-Zusammenfassung
- 📅 Kalender-Widget — kombinierte Radarr/Sonarr Upcoming-Releases
- 📊 Pinbar in Topbar für Schnellübersicht
- 🔄 Live-Polling — alle Widgets aktualisieren automatisch

**Dashboard & UX**
- ➕ Quick-Actions in Topbar — kontextsensitiver Add-Button pro Seite
- 🎓 Onboarding-Wizard — geführte Ersteinrichtung beim ersten Start
- 👁️ Gast-Sichtbarkeits-Overlay — Admin sieht direkt welche Elemente für Gäste sichtbar sind

**Auth & Zugriff**
- 🔑 Lokale Nutzer-Authentifizierung — Admin-Setup beim ersten Start
- 👥 Nutzergruppen (Admin, Gast + eigene)
- 👁️ Per-Gruppe Sichtbarkeit für Apps, Media und Widgets
- 🐳 Per-Gruppe Docker-Berechtigungen
- 🎨 Gäste können Theme lokal ändern
- 🛠️ Admin "Gast-Modus"

**Design & Einstellungen**
- 🎨 Design-Tab (nur Admins) — Ecken-Stil, Blur, Abstände, Sidebar-Stil,
    Animationen, Custom CSS — gilt global für alle Nutzer
- 🌓 Hell/Dunkel + 3 Akzentfarben (Cyan, Orange, Magenta)
- 🕐 Auto-Theme — zeitbasierter Hell/Dunkel-Wechsel
- 🖼️ Hintergrundbilder — Upload und Zuweisung pro Nutzergruppe
- 🎬 TMDB API-Key Konfiguration

**Dokumentation**
- 📖 Integriertes Doku-Center in der About-Seite

**Import/Export**
- 📥 JSON Import/Export — Backup und Restore von Service-Konfigurationen

---

## Quick Start
```bash
docker run -d \
  --name heldash \
  -p 8282:8282 \
  -v /mnt/user/appdata/heldash:/data \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -v /mnt/user/appdata/recyclarr:/recyclarr \
  -e SECRET_KEY=$(openssl rand -hex 32) \
  -e SECURE_COOKIES=false \
  ghcr.io/kreuzbube88/heldash:latest
```

Oder mit docker-compose:
```bash
docker compose up -d
```

Dann **http://server-ip:8282** öffnen.
Beim ersten Start erscheint automatisch die Admin-Einrichtungsseite.

---

## Sicherheitshinweis

⚠️ **HELDASH ist ausschließlich für den lokalen Einsatz im Heimnetzwerk gedacht.**

- Nicht öffentlich im Internet bereitstellen
- Hinter Reverse Proxy (z.B. Nginx Proxy Manager) mit SSL betreiben
- `SECURE_COOKIES=true` wenn hinter HTTPS
- `SECRET_KEY` immer setzen: `openssl rand -hex 32`

---

## Umgebungsvariablen

| Variable | Pflicht | Standard | Beschreibung |
|---|---|---|---|
| `SECRET_KEY` | **Ja** | unsicher | JWT-Schlüssel. `openssl rand -hex 32` |
| `SECURE_COOKIES` | **Ja** | `false` | `false` = HTTP lokal, `true` = HTTPS via Reverse Proxy |
| `PORT` | Nein | `8282` | Listen-Port des Webservers |
| `DATA_DIR` | Nein | `/data` | Datenbank, Icons, Hintergründe |
| `LOG_LEVEL` | Nein | `info` | `debug` · `info` · `warn` · `error` |
| `LOG_FORMAT` | Nein | `pretty` | `pretty` = lesbar · `json` = für Log-Aggregatoren |
| `RECYCLARR_CONFIG_PATH` | Nein | `/recyclarr/recyclarr.yml` | Pfad zur recyclarr.yml (Container-Perspektive) |
| `RECYCLARR_CONTAINER_NAME` | Nein | `recyclarr` | Name des Recyclarr Docker-Containers |
| `PUID` | Nein | `99` | User-ID für Dateiberechtigungen (Unraid: 99) |
| `PGID` | Nein | `100` | Group-ID für Dateiberechtigungen (Unraid: 100) |

---

## Unraid

Community Applications Template: **`heldash.xml`** im Repository-Root.

**Wichtige Pfade:**
| Pfad im Container | Host-Pfad (Standard) | Beschreibung |
|---|---|---|
| `/data` | `/mnt/user/appdata/heldash` | Datenbank + Konfiguration |
| `/var/run/docker.sock` | `/var/run/docker.sock` | Docker-Integration (ro) |
| `/recyclarr` | `/mnt/user/appdata/recyclarr` | Recyclarr Config (optional) |

**Pflichtfelder bei Installation:**
- `SECRET_KEY` — `openssl rand -hex 32` im Terminal generieren
- `SECURE_COOKIES` — `false` für lokalen Zugriff, `true` bei HTTPS

---

## Dokumentation

Vollständige Dokumentation direkt im Dashboard unter **About**.

---

## Roadmap

### Abgeschlossen ✓
- [x] App-Verwaltung + Status-Checks
- [x] Gruppen / Kategorien
- [x] Hell/Dunkel + Akzentfarben + Auto-Theme
- [x] Drag & Drop
- [x] Lokale Nutzer-Authentifizierung
- [x] Nutzergruppen (Admin, Gast, eigene)
- [x] Per-Gruppe Sichtbarkeit für Apps, Media, Widgets
- [x] Radarr / Sonarr / Prowlarr Integration
- [x] SABnzbd Integration
- [x] Seerr / Discover mit TMDB
- [x] Modulares Dashboard mit Gruppen, Edit-Modus, Platzhalter
- [x] Per-User Dashboards
- [x] Widget-System (Server Status, AdGuard, Pi-hole, Docker Overview,
        Nginx PM, HA, HA Energy, Kalender)
- [x] Topbar Widget-Stats + Live-Polling
- [x] Docker-Seite — Stats, Logs, Start/Stop/Restart
- [x] Per-Gruppe Docker-Berechtigungen
- [x] Hintergrundbilder pro Nutzergruppe
- [x] Responsives Dashboard + Mobile Navigation
- [x] Widget-Streifen auf Dashboard
- [x] Admin Design Settings
- [x] Home Assistant — Multi-Instanz, Entity-Browser, Panel-Grid,
        domain-aware Karten, Dimmer, Klima, Media Player, Cover, Sensoren
- [x] HA Energie-Dashboard + Widget
- [x] HA Räume/Areas — Panels nach HA-Bereichen gruppieren
- [x] CF-Manager — Import/Export, Vorlagen, Cross-Service Copy
- [x] Recyclarr — CF Groups, Profil-Vergleich, Score-Heatmap, Sync-Verlauf, Config-Backup
- [x] Service Uptime-History + Uptime-Übersicht Tab
- [x] Aktivitäten-Feed (HA, Docker, Recyclarr, System)
- [x] Quick-Actions Topbar
- [x] Onboarding-Wizard
- [x] Gast-Sichtbarkeits-Overlay
- [x] Import/Export Services
- [x] About-Seite als integriertes Doku-Center
- [x] Logbuch — Health Score, Ereignis-Kalender, Anomalie-Erkennung
- [x] Aktivitäten-Feed mit Echtzeit-Updates (kein Page Reload)
- [x] Service Status Echtzeit-Updates
- [x] Docker Events stream (kein Polling)
- [x] Recyclarr Zeitplan hot-reload (kein Container-Neustart)
- [x] Unraid Community Applications Template

### Geplant
- [ ] Unraid API Integration (Logbuch-Tab)
- [ ] OIDC / SSO via Authentik oder voidauth
- [ ] Torrent-Client Integration (qBittorrent, Transmission, Deluge)
- [ ] Webhook-Benachrichtigungen (ntfy / Gotify)
- [ ] Weitere Integrationen (Immich, Jellyfin, Emby, etc.)

---

## Hinweis zur Entwicklung

Dieses Projekt wurde vollständig mit KI-Unterstützung (Claude Code) entwickelt.
Keine professionelle Sicherheitsprüfung. **Nur im lokalen Heimnetzwerk nutzen.**
