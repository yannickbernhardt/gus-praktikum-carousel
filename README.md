# @fos.gus.praktikum – Instagram-Carousel mit gemeinsamer Kommentarspalte

Einstiegs-Lerntool für den Bildungsgang Gesundheit und Soziales.
Sechs Slides (1080 × 1350) in einem Instagram-Feed-Viewer: vier Praktikant\*innen
erzählen von derselben Woche und beschreiben vier völlig verschiedene Arbeitswelten.
Die Kommentarspalte ist **gemeinsam** – was eine Person schreibt, sehen alle anderen.

## Aufbau

```
public/index.html   Carousel + Kommentarspalte (alles in einer Datei)
main.ts             Server für Deno Deploy, Kommentare in Deno KV
deno.json           Tasks und unstable-Flag für KV
```

## Lokal starten

```bash
deno task start
```

Läuft dann auf http://localhost:8000

Mit Moderation und eigenem Port:

```bash
PORT=8731 LEHRER_TOKEN=geheim deno task start
```

Der lokale KV-Speicher liegt in Denos Cache-Verzeichnis und bleibt zwischen
Neustarts erhalten. Zum Leeren den Lehrer-Link benutzen.

## Umgebungsvariablen

| Variable       | Wirkung |
|----------------|---------|
| `LEHRER_TOKEN` | Schaltet die Lehrer-Ansicht frei. Ohne die Variable gibt es keine Moderation. |
| `PORT`         | Nur lokal nötig; auf Deno Deploy wird der Port vorgegeben. |

Auf Deno Deploy wird die Variable so gesetzt:

```bash
deno deploy env add LEHRER_TOKEN <wert> --secret
```

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

- Namensfeld freiwillig – „anonym" wird eingetragen, wenn nichts dasteht.
- Der Hinweis unter dem Eingabefeld erinnert an die Schweigepflicht:
  keine echten Namen von Bewohner\*innen, Klient\*innen oder Kindern.
- Nach der Stunde die Spalte über den Lehrer-Link leeren.

## Datenschutz-Fall „Finns Post“ (Sozi 1.1.2)

Zwei Spuren für die Doppelstunde zum Datenschutz, die Klasse kommt per QR-Code an der Wand dorthin:

| Spur | Pfad | Inhalt |
|------|------|--------|
| A | `/fall/finn_k07` | Finns Profil: neun Beiträge, jede Kommentarspalte und jede Antwort lässt sich öffnen |
| B | `/fall/kita-schneckenhaus` | Internetseite der Kita |

Direkt zu einem Beitrag: `/fall/finn_k07#p1` (Beitrag 1), mit offener Kommentarspalte `/fall/finn_k07#p1k`.
Die alten Adressen `/fall/a` bis `/fall/d` leiten dorthin weiter.

Die Fotos in `public/fall/img` sind KI-generiert (Canva) und zeigen keine Kinder. Alle Personen, Konten,
die Kita und der Ort Lindenfeld sind erfunden. Die Seiten speichern nichts und senden nichts; Herzen,
„Folgen“ und aufgeklappte Antworten wirken nur auf dem eigenen Gerät. Suchmaschinen werden per `noindex`
ausgeschlossen.
