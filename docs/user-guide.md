# HELDASH — Benutzerhandbuch

## Inhaltsverzeichnis

1. [Erster Login](#erster-login)
2. [Oberfläche im Überblick](#oberfläche-im-überblick)
3. [Dashboard](#dashboard)
4. [Apps](#apps)
5. [Media](#media)
6. [Docker](#docker)
7. [Widgets](#widgets)
8. [Einstellungen](#einstellungen)
9. [Design anpassen](#design-anpassen)
10. [Benutzer-Account](#benutzer-account)

---

## Erster Login

Wenn HELDASH das erste Mal gestartet wird, erscheint automatisch eine Seite zum Anlegen des Admin-Accounts. Danach kann man sich oben rechts über den **Login**-Button anmelden.

Wer nur schauen möchte, ohne etwas zu ändern: Das Dashboard ist auch ohne Login lesbar. Bearbeiten, Hinzufügen und Löschen ist jedoch nur für angemeldete Benutzer möglich.

---

## Oberfläche im Überblick

Die Oberfläche besteht aus drei Bereichen:

**Linke Leiste (Sidebar)**
Navigation zwischen den Seiten. Welche Punkte sichtbar sind hängt von der eigenen Gruppe ab — Gäste sehen z.B. keine Docker-Seite, sofern der Admin das nicht freigegeben hat.

**Obere Leiste (Topbar)**
- Links: Datum und Uhrzeit des Servers
- Mitte: Hier erscheinen Widgets, die für die Topbar aktiviert wurden (CPU-Auslastung, Docker-Übersicht etc.)
- Rechts: Design-Einstellungen, Aktualisieren-Button, Dashboard-Steuerung, Login/Logout

**Hauptbereich**
Zeigt die jeweils aktive Seite.

---

## Dashboard

Das Dashboard ist die Startseite — eine frei gestaltbare Übersicht der eigenen Apps, Media-Instanzen und Widgets.

### Was man sieht

Jede App erscheint als Karte mit Icon, Namen und einem farbigen Punkt:
- **Grün** = Die App ist gerade erreichbar
- **Rot** = Die App antwortet nicht
- **Grau** = Noch kein Check durchgeführt

Ein Klick auf die Karte öffnet die App direkt in einem neuen Tab.

### Dashboard bearbeiten

Oben rechts gibt es den Button **„Edit Dashboard"**. Nach dem Klick darauf:

- Alle Karten bekommen einen Anfasser zum Verschieben (Gripper-Symbol oben links auf der Karte)
- Karten können per Drag & Drop beliebig umgeordnet werden
- Drei neue Buttons erscheinen: **App**, **Instance**, **Row**

Mit diesen Buttons fügt man **Platzhalter** ein — leere Felder zum Strukturieren des Layouts. Ein Platzhalter vom Typ „Row" erzwingt z.B. einen Zeilenumbruch, damit die nächste Karte ganz links beginnt.

Mit **„Done"** wird der Bearbeitungsmodus beendet und die neue Anordnung gespeichert.

### Karten hinzufügen / entfernen

Karten erscheinen auf dem Dashboard, sobald bei der jeweiligen App, Media-Instanz oder dem Widget die Option **„Auf Dashboard anzeigen"** aktiviert ist. Das lässt sich in den entsprechenden Bearbeitungs-Dialogen ein- und ausschalten.

Alternativ kann man im Edit-Modus über die Buttons „App" / „Instance" einen Platzhalter einfügen und ihn dort dann mit einer konkreten App belegen — oder einfach den Platzhalter wieder löschen.

### Mein Dashboard vs. Gast-Dashboard

Jeder angemeldete Benutzer hat sein eigenes Layout. Gäste (nicht eingeloggte Besucher) teilen sich ein gemeinsames Layout, das der Admin über den **„Guest Mode"**-Button konfiguriert.

**Guest Mode (nur für Admins):** Aktiviert man diesen Modus, sieht man das Dashboard genau so, wie Gäste es sehen — und kann es entsprechend einrichten. Mit einem erneuten Klick verlässt man den Gastmodus wieder.

---

## Apps

Unter **Apps** findet man eine vollständige Liste aller eingetragenen Dienste, sortiert nach Gruppen.

### App hinzufügen

Als Admin: Oben rechts auf **„Add App"** klicken. Im Formular:

| Feld | Beschreibung |
|---|---|
| **Name** | Anzeigename der App |
| **URL** | Adresse, unter der die App erreichbar ist |
| **Gruppe** | Kategorie, in der die App einsortiert wird |
| **Icon** | Emoji eingeben **oder** eine Bilddatei hochladen (PNG, JPG, SVG — max. 512 KB) |
| **Beschreibung** | Kurze Notiz, die unter dem Namen erscheint |
| **Health Check** | An/Aus — wenn aktiv, wird die App regelmäßig angefragt und der Status aktualisiert |
| **Check URL** | Optional: andere URL für den Health Check (z.B. wenn `/healthz` statt `/` geprüft werden soll) |
| **Auf Dashboard** | Direkt beim Erstellen auf dem Dashboard anzeigen |

### App bearbeiten / löschen

In der Tabelle gibt es rechts pro App zwei Symbole: Stift (bearbeiten) und Mülleimer (löschen). Beim Löschen erscheint eine Bestätigungsabfrage.

### Gruppen

Gruppen sind Kategorien, in die Apps einsortiert werden. Sie können unter **Einstellungen → Gruppen** (der App-Gruppen, nicht Benutzer-Gruppen — beides ist unter Einstellungen zu finden) verwaltet werden:
- Name und Icon vergeben
- Per Drag & Drop umsortieren

### Status-Check manuell auslösen

Oben rechts in der Topbar gibt es einen **Pfeil-im-Kreis**-Button. Ein Klick prüft alle Apps mit aktiviertem Health Check sofort — unabhängig vom regulären Intervall.

---

## Media

Auf der **Media**-Seite werden Informationen aus den eingebundenen Download- und Medienverwaltungs-Diensten angezeigt.

### Unterstützte Dienste

| Dienst | Was wird angezeigt |
|---|---|
| **Radarr** | Film-Statistiken, aktive Downloads mit Fortschrittsbalken, Kalender mit bald erscheinenden Filmen |
| **Sonarr** | Serien-Statistiken, aktive Downloads, Kalender mit kommenden Episoden |
| **Prowlarr** | Liste der konfigurierten Indexer mit Status, Anzahl der Grabs in den letzten 24h |
| **SABnzbd** | Aktive Download-Warteschlange mit Fortschrittsbalken, abgeschlossene Downloads |

### Instanz hinzufügen

Als Admin: Oben rechts auf **„Add Instance"** klicken.

| Feld | Beschreibung |
|---|---|
| **Typ** | Radarr / Sonarr / Prowlarr / SABnzbd |
| **Name** | Frei wählbarer Anzeigename |
| **URL** | Adresse des Dienstes (z.B. `http://192.168.1.10:7878`) |
| **API Key** | In der Weboberfläche des Dienstes unter Einstellungen → Allgemein zu finden |
| **Auf Dashboard** | Karte auch auf dem Dashboard anzeigen |

**Hinweis:** Der API-Key wird sicher auf dem Server gespeichert und **nicht** an den Browser übertragen.

### Icon

Wenn es eine App mit der gleichen URL gibt (z.B. eine Radarr-App in der App-Liste), übernimmt die Media-Karte automatisch das Icon dieser App.

---

## Docker

Die **Docker**-Seite zeigt alle Container auf dem Host-System — live, mit CPU- und RAM-Verbrauch.

> Diese Seite ist nur verfügbar wenn der Docker-Socket eingebunden ist und der eigene Account die entsprechende Berechtigung hat.

### Übersicht

Oben gibt es vier Zählkarten: **Gesamt · Laufend · Gestoppt · Neustart**. Sie geben auf einen Blick den Gesamtzustand aller Container wieder.

### Container-Tabelle

Die Tabelle zeigt alle Container mit:
- **Name** und **Image**
- **Status** (laufend, gestoppt, neustart, ...)
- **Laufzeit** (wie lange der Container bereits läuft)
- **CPU- und RAM-Verbrauch** (wird automatisch aktualisiert)

**Spalten sortieren:** Ein Klick auf einen Spalten-Header sortiert die Tabelle nach dieser Spalte. Nochmaliges Klicken kehrt die Sortierung um.

### Container-Details

Ein Klick auf einen Container öffnet den Detailbereich darunter. Dort gibt es:
- Detaillierte Infos (Image, ID, Netzwerke, etc.)
- **Live-Logs** — der Log-Stream wird in Echtzeit angezeigt, es kann nach einem Begriff gefiltert werden
- **Start / Stop / Restart** — Steuerbefehle (nur für Admins; Farben: grün = Start, rot = Stop, orange = Neustart)

---

## Widgets

Widgets zeigen System-Informationen direkt im Dashboard oder in der Topbar.

### Verfügbare Widget-Typen

| Widget | Was es zeigt |
|---|---|
| **Server Status** | CPU-Auslastung, RAM-Verbrauch, Festplatten-Belegung des Servers als Fortschrittsbalken |
| **AdGuard Home** | DNS-Anfragen, geblockte Anfragen, Blockrate, Schutzstatus |
| **Docker Overview** | Anzahl laufender / gestoppter / neustartender Container; als Admin auch Start/Stop/Restart einzelner Container |

### Widget hinzufügen

Als Admin: Auf die **Widgets**-Seite wechseln → oben rechts **„Add Widget"**.

| Feld | Beschreibung |
|---|---|
| **Typ** | Server Status / AdGuard Home / Docker Overview |
| **Name** | Anzeigename |
| **In Topbar anzeigen** | Widget erscheint zusätzlich als kompakte Zusammenfassung in der Topbar |
| **Auf Dashboard** | Volle Widget-Ansicht auf dem Dashboard |

Je nach Typ erscheinen weitere Felder:
- **Server Status:** Keine weitere Konfiguration nötig — es werden automatisch die Daten des Hostsystems angezeigt, auf dem HELDASH läuft (CPU, RAM, alle eingebundenen Festplatten/Partitionen)
- **AdGuard Home:** URL + Benutzername + Passwort der AdGuard-Instanz
- **Docker Overview:** Keine weitere Konfiguration nötig

**Festplatten einrichten (Server Status):** Festplatten werden nicht automatisch erkannt — jede Festplatte muss zuerst in der Docker-Konfiguration als Pfad in den Container eingebunden werden (z.B. `/hdd1`, `/hdd2`). Read-only (`:ro`) reicht dabei vollständig aus. Anschließend wird dieser Pfad im Widget-Formular unter „Festplatten" eingetragen, damit der Speicherzustand (belegt / gesamt) angezeigt wird.

Beispiel docker-compose:
```yaml
volumes:
  - /mnt/disk1:/hdd1:ro
  - /mnt/disk2:/hdd2:ro
```
Im Widget dann `/hdd1` und `/hdd2` als Festplatten-Pfade angeben.

**Hinweis:** Zugangsdaten (AdGuard-Passwort) werden nur auf dem Server gespeichert und **nie** an den Browser übertragen.

### Widget in der Topbar

Wenn „In Topbar anzeigen" aktiv ist, erscheint das Widget als kleines Panel in der Mitte der Topbar — mit farbig hervorgehobenen Werten:
- Server Status: CPU/RAM/Disk farbig nach Auslastung (grün → orange → rot)
- AdGuard: Geblockte Anfragen in rot, Schutzstatus farbig
- Docker: Container-Zähler mit grüner Laufend-Zahl

### Docker Overview — Container steuern

Admins können direkt im Widget einen Container aus dem Dropdown auswählen und ihn starten, stoppen oder neu starten — ohne die Docker-Seite öffnen zu müssen.

---

## Einstellungen

Die Einstellungen sind in vier Tabs aufgeteilt.

### Tab: Allgemein

- **Dashboard-Titel** — Wird in der Sidebar angezeigt (Standard: HELDASH)
- **Theme** — Zeigt die aktuelle Einstellung. Dunkel/Hell-Modus und Akzentfarbe werden direkt in der Topbar geändert (siehe [Design anpassen](#design-anpassen))
- **Hintergrundbilder** — Eigene Hintergrundbilder hochladen (PNG, JPG, SVG, WebP — max. 5 MB). Jedes Bild braucht einen Namen. Hochgeladene Bilder werden mit einem Vorschau-Thumbnail angezeigt und können dort auch wieder gelöscht werden. Welche Gruppe welches Bild zu sehen bekommt, wird unter **Einstellungen → Gruppen** eingestellt.

### Tab: Benutzer

Liste aller Benutzer mit Status (aktiv / inaktiv). Als Admin:
- **Neuen Benutzer anlegen** — Benutzername, Passwort, Gruppe zuweisen
- **Benutzer bearbeiten** — Passwort ändern, Gruppe ändern, aktivieren/deaktivieren
- **Benutzer löschen**

Ein inaktiver Benutzer kann sich nicht mehr anmelden, bleibt aber in der Datenbank.

### Tab: Gruppen

Gruppen steuern, was ein Benutzer sehen und nutzen darf. Jeder Benutzer gehört genau einer Gruppe an.

**Eingebaute Gruppen:**
- **Admin** — Vollzugriff, kann nicht gelöscht werden
- **Gast** — Lesezugriff, kein Docker, kein Docker-Widget (Standard für nicht eingeloggte Besucher)

**Eigene Gruppen anlegen:** Über „Neue Gruppe" eine Gruppe mit Name und Beschreibung erstellen.

**Berechtigungen bearbeiten:** Auf das Bearbeiten-Symbol einer Gruppe klicken. Es öffnet sich ein Dialog mit fünf Tabs:

| Tab | Was man einstellen kann |
|---|---|
| **Apps** | Welche Apps für diese Gruppe sichtbar sind (Haken = versteckt) |
| **Media** | Welche Media-Instanzen für diese Gruppe sichtbar sind |
| **Widgets** | Welche Widgets (Server Status, AdGuard) für diese Gruppe sichtbar sind |
| **Docker** | Docker-Seite freigeben · Docker-Overview-Widget freigeben |
| **Background** | Hintergrundbild für diese Gruppe auswählen (Dropdown mit allen hochgeladenen Bildern, oder „Kein Hintergrund") |

Alle Änderungen in den Tabs (Apps, Media, Widgets, Docker, Background) werden sofort gespeichert — es gibt keinen separaten Speichern-Button.

### Tab: OIDC / SSO

Vorbereitung für eine zukünftige Single-Sign-On-Integration. Aktuell noch nicht aktiv.

---

## Design anpassen

Das Design lässt sich jederzeit in der Topbar anpassen — auch ohne Admin-Rechte (Gäste speichern ihre Wahl lokal im Browser):

**Akzentfarbe:** Drei farbige Punkte oben rechts — Klick wählt die Akzentfarbe:
- Cyan (Standard)
- Orange
- Magenta

**Hell/Dunkel-Modus:** Der Sonne/Mond-Button wechselt zwischen dunklem und hellem Erscheinungsbild.

---

## Benutzer-Account

### Anmelden

Oben rechts auf **„Login"** klicken, Benutzername und Passwort eingeben.

### Abmelden

Oben rechts erscheint nach dem Login der Benutzername und daneben ein Abmelde-Symbol (Pfeil nach rechts). Ein Klick meldet den Account ab und kehrt zur Gast-Ansicht zurück.

### Passwort ändern

Aktuell nur durch einen Admin unter **Einstellungen → Benutzer** möglich. Eine eigene Passwortänderung durch den Benutzer selbst ist für eine spätere Version geplant.
