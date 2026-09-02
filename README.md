# @fos.gus.praktikum – Instagram-Carousel mit gemeinsamer Kommentarspalte

Einstiegs-Lerntool für den Bildungsgang Gesundheit und Soziales.
Sechs Slides (1080 × 1350) in einem Instagram-Feed-Viewer: vier Praktikant\*innen
erzählen von derselben Woche und beschreiben vier völlig verschiedene Arbeitswelten.
Die Kommentarspalte ist **gemeinsam** – was eine Person schreibt, sehen alle anderen.

## Aufbau

```
public/index.html   Carousel + Kommentarspalte (alles in einer Datei)
server.js           Mini-Server, nur Node-Standardbibliothek, keine Abhängigkeiten
package.json        start-Skript für Railway
```

## Lokal starten

```bash
node server.js
```

Läuft dann auf http://localhost:3000

Mit Moderation und Speicherung auf der Platte:

```bash
PORT=3000 LEHRER_TOKEN=geheim DATA_DIR=daten node server.js
```

## Umgebungsvariablen

| Variable       | Wirkung |
|----------------|---------|
| `PORT`         | Port; setzt Railway automatisch. |
| `LEHRER_TOKEN` | Schaltet die Lehrer-Ansicht frei. Ohne die Variable gibt es keine Moderation. |
| `DATA_DIR`     | Ordner für `kommentare.json`. Ohne die Variable liegen die Kommentare nur im Arbeitsspeicher und sind nach einem Neustart weg. |

## Zwei Links

- **Für die Klasse:** `https://<domain>/` – lesen, schreiben, eigene Beiträge löschen.
- **Für die Lehrkraft:** `https://<domain>/?lehrer=<LEHRER_TOKEN>` – zusätzlich jeden
  Beitrag löschen und über „Alle Kommentare löschen" die Spalte vor der nächsten
  Klasse zurücksetzen.

Der Lehrer-Link gehört nicht auf den Beamer und nicht in den QR-Code.

## Regeln im Server

- Höchstens 280 Zeichen pro Kommentar, 24 Zeichen pro Name.
- Zwei Sekunden Abstand zwischen zwei Beiträgen **desselben Geräts**
  (bewusst pro Gerät, nicht pro IP – im Schul-WLAN teilen sich alle dieselbe IP).
- Höchstens 10 Beiträge pro Gerät, 400 insgesamt.
- Steuerzeichen werden entfernt, die Anzeige setzt reinen Text – kein HTML aus Kommentaren.
- Gespeichert werden nur Name, Text, Zeitstempel und eine zufällige Gerätekennung.
  **Keine IP-Adressen.**

## Datenschutz im Unterricht

Die Kommentare liegen auf einem Server in der Cloud und sind über den Link für
jede\*n erreichbar, der ihn kennt. Deshalb:

- Namensfeld freiwillig – „anonym" ist voreingestellt, wenn nichts eingetragen wird.
- Der Hinweis unter dem Eingabefeld erinnert an die Schweigepflicht:
  keine echten Namen von Bewohner\*innen, Klient\*innen oder Kindern.
- Nach der Stunde die Spalte über den Lehrer-Link leeren.
