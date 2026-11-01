# Fahrrad-Inventur

Web-App (PWA) für die Inventur alter Fahrräder verschiedenster Hersteller und Typen, mit Swift-Hülle für iOS.

- **Fotografieren & automatisch erkennen**: Fotos eines Rads (Gesamtansicht + Details) werden von **Claude Vision** ausgewertet. Die KI liefert Hersteller, Modell, Typ, Baujahr, Rahmendaten, Zustand, Schätzwert und eine **Teileliste**. Du prüfst die Vorschläge und speicherst.
- **Inventarisieren**: Jedes Rad bekommt eine Inventarnummer (`R-0001`), jedes Teil eine eigene (`T-0001`). Dazu gibt es QR-Etiketten.
- **Teile pro Rad, nach Kategorien**: Kategorien-Baum (Rahmen & Gabel, Antrieb, Schaltung, Bremsen, Laufräder, Cockpit, Sitzbereich, Beleuchtung, Anbauteile …).
- **Gleiche Teile verknüpfen**: Identische Teile werden über alle Räder und das Lager hinweg automatisch zusammengefasst, z. B. „Mafac Racer: 3× (an 2 Rädern, 1 im Lager)“. Als gleich gilt: gleiche Kategorie und gleiche Teile-Nr., oder ohne Teile-Nr. gleicher Hersteller und gleiches Modell (Schreibweise egal).
- **Teile-Lager / Ausschlachten**: Teile einzeln abbauen oder ein ganzes Rad ausschlachten (alle Teile gehen ins Lager, die Herkunft wird gemerkt), an andere Räder einbauen oder einzeln erfassen (auch per KI-Foto).
- **Felder pro Rad**: Hersteller, Modell, Typ, Baujahr, Rahmengröße, Laufradgröße, Farbe, Material, Rahmennummer, Zustand 1–5, Status (Lager / in Arbeit / verkaufsbereit / reserviert / verkauft / ausgeschlachtet), Lagerort, Einkaufspreis, Schätzwert, Verkaufspreis, Notizen.
- **Export & Auswertung**: CSV für Excel (Räder und Teile), JSON-Komplettsicherung inklusive Fotos (Backup/Restore, Gerätewechsel), Datenblatt pro Rad, Inventurliste und Etiketten (drucken / PDF), Statistik-Übersicht.
- **Lokal & offline**: Alle Daten liegen in IndexedDB auf dem Gerät. Nur die KI-Erkennung braucht Internet.

## Schnellstart (Browser)

```bash
npm run serve          # http://localhost:8080
```

Es gibt keinen Build-Schritt: `web/` ist die fertige App. Für das iPhone die App per HTTPS hosten (z. B. GitHub Pages mit dem Ordner `web/`), in Safari öffnen und **Teilen → Zum Home-Bildschirm** wählen.

Danach unter **Mehr → Einstellungen** den Claude-API-Key eintragen (oder eine Proxy-URL, siehe unten) und **Verbindung testen** antippen.

## iOS-App (Swift)

Das Verzeichnis `ios/` enthält eine schlanke SwiftUI-App, die die Web-App in einem `WKWebView` ausführt:

| Datei | Aufgabe |
|---|---|
| `FahrradInventurApp.swift` | App-Einstieg und Wahl der Startadresse (eingebaut oder gehostet) |
| `WebAppView.swift` | WKWebView-Konfiguration mit dauerhaftem Speicher und JS-Bridge |
| `AppSchemeHandler.swift` | liefert `web/` aus dem App-Bundle unter `app://localhost/` aus. Dadurch funktionieren ES-Module und IndexedDB, und die App läuft offline |
| `NativeBridge.swift` | Teilen-Menü für Exporte, nativer Druckdialog, Haptik, externe Links in Safari |

Bauen auf dem Mac:

```bash
brew install xcodegen
cd ios && xcodegen generate
open FahrradInventur.xcodeproj
```

In Xcode das Team und die Bundle-ID (`de.example.fahrradinventur`) anpassen und auf dem iPhone starten. Kamera und Mediathek fragt die App über die normalen iOS-Berechtigungsdialoge an.

Statt der eingebauten Web-App kann die App auch eine gehostete PWA laden: in `ios/project.yml` `WebAppURL` setzen. Updates kommen dann ohne neuen App-Build an, die Daten liegen aber unter dem Origin dieser URL.

Die JS-Seite der Bridge steht in `web/js/native.js`. Im normalen Browser fällt sie automatisch auf Web-APIs zurück (Download/Web Share, `window.print()`).

## Claude-API: Key direkt oder über Proxy

- **Direkt**: Der Key wird nur lokal auf dem Gerät gespeichert und direkt an `api.anthropic.com` geschickt. Das ist einfach und passend, solange nur du die App nutzt. Wer Zugriff auf das Gerät hat, kann den Key aber auslesen.
- **Proxy** (empfohlen bei mehreren Nutzern): `proxy/worker.js` ist ein Cloudflare Worker, der den Key serverseitig ergänzt.

  ```bash
  cd proxy
  npx wrangler secret put ANTHROPIC_API_KEY
  npx wrangler secret put APP_TOKEN          # Zugangscode für die App
  npx wrangler deploy
  ```

  In der App dann die Worker-URL als **Proxy-URL** und den Zugangscode im Feld **API-Key** eintragen. Optional lassen sich mit `ALLOWED_ORIGINS` und `ALLOWED_MODELS` Herkunft und Modelle einschränken.

Modell: Standard ist **Claude Opus 5.5** (beste Erkennung). In den Einstellungen sind Sonnet 5.5 und Haiku 5.5 als günstigere Alternativen wählbar, außerdem Gründlichkeit und maximale Fotozahl pro Erkennung (Standard 6). Die Fotos werden vor dem Senden auf höchstens 1568 px verkleinert. Die Antwort kommt als JSON nach festem Schema (Structured Outputs). Lehnt ein Sicherheitsfilter eine Anfrage ab, versucht die API automatisch ein passendes Ersatzmodell (`fallbacks: "default"`).

## Projektstruktur

```
web/                 Die App (HTML/CSS/JS, ES-Module, ohne Build-Schritt)
  js/model.js        Datenmodell, Kategorien-Baum, Logik für gleiche Teile, CSV, Statistik
  js/db.js           IndexedDB (Räder, Teile, Fotos, Einstellungen)
  js/ai.js           Claude-Vision-Erkennung (offizielles Anthropic-SDK)
  js/views/          Ansichten (Übersicht, Räder, Rad, Teile, Teil, Einstellungen, Druck)
  vendor/            Lokal gebündelte Bibliotheken (Anthropic-SDK, QR-Code)
ios/                 Swift/SwiftUI-Hülle (XcodeGen)
proxy/               Optionaler Cloudflare-Worker-Proxy
tests/               Unit-Tests (Node) und End-to-End-Test (Playwright, simulierte API)
```

## Entwicklung

```bash
npm install
npm test               # Unit-Tests (Logik + Proxy)
npm run test:e2e       # Browser-Test des kompletten Ablaufs mit simulierter Claude-API
npm run vendor         # web/vendor/ neu bündeln (nach SDK-Update)
node scripts/make-icons.mjs   # PNG-Icons aus web/icons/icon.svg erzeugen
```

## Hinweise

- **Sicherung**: Die Daten liegen nur auf dem Gerät. Bitte regelmäßig **Komplett-Sicherung** erstellen und z. B. in iCloud Drive ablegen.
- **Safari ohne Home-Bildschirm**: Safari kann Website-Daten nach längerer Nichtnutzung löschen. Als Home-Bildschirm-App oder in der iOS-App bleiben die Daten erhalten.
- **KI-Ergebnisse sind Vorschläge**: Besonders Baujahr, Rahmengröße und Werte sind Schätzungen. Die Prüfansicht zeigt pro Teil an, wie sicher die KI ist.
