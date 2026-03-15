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
- 🔁 Automatische und manuelle Health-Checks per HTTP
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

**Recyclarr / TRaSH Guides**
- 🔄 Recyclarr GUI — TRaSH Guides Sync grafisch konfigurieren
- 📋 Qualitätsprofil-Templates — Standard (EN), Deutsch und Anime,
    mehrere Profile pro Instanz kombinierbar
- 🎚️ Score-Overrides — individuelle Scores pro Format anpassen
- ⛔ Eigene Custom Formats (z.B. Tdarr) — geschützt via
    reset_unmatched_scores.except
- 🛡️ delete_old_custom_formats konfigurierbar (Standard: deaktiviert)
- 👁️ Preview-YAML vor dem Sync einsehen
- ▶️ Live-Sync-Output als Echtzeit-Stream
- ⏰ Sync-Zeitplan — manuell, täglich, wöchentlich oder Cron-Ausdruck
- 🔃 Template-Refresh automatisch alle 24h von GitHub

**CF-Manager**
- 📝 Custom Formats direkt in Radarr/Sonarr verwalten — Live-Daten
- ➕ CFs erstellen mit Conditions (Release-Titel, Sprache, Quelle, etc.)
- ✏️ Bestehende CFs bearbeiten und löschen
- 🎚️ Scores direkt im Qualitätsprofil setzen — mehrere Profile pro Instanz
- 🔒 Recyclarr-geschützte CFs werden markiert
- ⚠️ Schutz vor parallelem Recyclarr-Sync

**Docker**
- 🐳 Live-Container-Liste mit CPU/RAM, State-Badges, Uptime
- 📋 Sortierbare Container-Tabelle
- 📊 Übersichtsleiste — Total / Running / Stopped / Restarting
- 📜 Live-Log-Streaming per SSE (stdout + stderr)
- ▶️ Start / Stop / Restart (nur Admins)
- 🔒 Docker-Seitenzugriff per Gruppe konfigurierbar

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
  -v /mnt/cache/appdata/heldash:/data \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -v /mnt/cache/appdata/recyclarr:/recyclarr \
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
| `SECURE_COOKIES` | **Ja** | `false` | `false` = HTTP, `true` = HTTPS |
| `PORT` | Nein | `8282` | Listen-Port |
| `DATA_DIR` | Nein | `/data` | Datenbank- und Icon-Verzeichnis |
| `LOG_LEVEL` | Nein | `info` | `debug` · `info` · `warn` · `error` |
| `LOG_FORMAT` | Nein | `pretty` | `pretty` = lesbar, `json` = strukturiert |
| `RECYCLARR_CONFIG_PATH` | Nein | `/recyclarr/recyclarr.yml` | Recyclarr Config |
| `RECYCLARR_CONTAINER_NAME` | Nein | `recyclarr` | Recyclarr Container-Name |

---

## Unraid

Community Applications Template verfügbar: **`heldash.xml`**

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
- [x] Recyclarr GUI — Templates, Score-Overrides, Sync-Zeitplan,
        Live-Output, CF-Schutz, YAML-Import
- [x] CF-Manager — Custom Formats in Radarr/Sonarr verwalten
- [x] Import/Export Services
- [x] About-Seite als integriertes Doku-Center

### Geplant
- [ ] OIDC / SSO via voidauth oder Authentik (UI vorbereitet)
- [ ] Torrent-Client Integration (qBittorrent, Transmission, Deluge)
- [ ] Webhook-Benachrichtigungen (ntfy / Gotify)
- [ ] Weitere Integrationen (Immich, Jellyfin, Emby, etc.)

---

## Hinweis zur Entwicklung

Dieses Projekt wurde vollständig mit KI-Unterstützung (Claude Code) entwickelt.
Keine professionelle Sicherheitsprüfung. **Nur im lokalen Heimnetzwerk nutzen.**
