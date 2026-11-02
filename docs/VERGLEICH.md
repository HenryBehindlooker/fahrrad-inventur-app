# Marktvergleich: Fahrrad-Inventur vs. ähnliche Apps

Stand: November 2026. Grundlage sind Hersteller- und App-Store-Seiten sowie Foren. Die Angaben zu den anderen Produkten wurden nicht selbst getestet.

## Was es am Markt gibt

| Produkt | Art | Stärken | Lücken für unseren Zweck |
|---|---|---|---|
| **Sortly** | Allgemeine Inventur-App | QR-/Barcode-Scan in der App, Fotos, eigene Felder, Ordner/Lagerorte, offline mit Sync | Nicht fahrradspezifisch, keine Erkennung, keine Teile-Logik pro Rad; ab ca. 49 $/Monat |
| **ProBikeGarage** | Wartungs-Tracker für eigene Räder | Teile wandern zwischen Rädern mit Historie, Wartungsintervalle (über Strava) | Für Fahrer statt Händler/Sammler: kein Lager, kein Verkauf, keine Inventur |
| **Tower Systems, Odoo, app-room, Bikebook, velo.port** | Laden- und Werkstatt-Software | Seriennummern, Reparaturaufträge mit Arbeitszeit und Teilen, Kasse | Teuer und aufwendig, auf Neuware ausgelegt; Gebrauchträder und Ausschlachten kaum abgebildet |
| **„Bike/Vehicle Identifier“-Apps** | KI-Foto-Erkennung | Foto → Marke, Modell, Preis | Meist für Motorräder; keine Inventur, keine Teile; alte Fahrräder kaum abgedeckt |
| **VeloBase** | Datenbank für Vintage-Teile | Viele Komponenten, Steuerkopf-Schilder, Kataloge | Nur Nachschlagewerk, keine Verwaltung |
| **Bicycle Blue Book** | Wertermittlung | Wertspanne privat / Händler-Ankauf | US-Markt, umstritten, keine Inventur |
| **Bike Index, Fahrradpass, Polizei** | Register / Diebstahlprüfung | Rahmennummer auf Diebstahl prüfen | Nur Prüfung, keine Verwaltung |

**Ergebnis:** Keine der gefundenen Apps verbindet KI-Erkennung alter Räder, Teile-Lager mit Ausschlachten, Werkstatt-Kalkulation und Verkauf. Diese Lücke füllt die Fahrrad-Inventur.

## Welche Ideen übernommen wurden

| Vorbild | Umsetzung in der Fahrrad-Inventur |
|---|---|
| Sortly: Scan in der App | **QR-Scanner** (Live-Kamera, Foto vom Etikett oder Eingabe der Nummer) öffnet Rad oder Teil sofort. Etiketten-QR-Codes enthalten einen Link, deshalb funktioniert auch die normale iPhone-Kamera. |
| Sortly: Bestandszählung | **Inventur-Modus**: Etiketten nacheinander scannen, mit Live-Fortschritt, Liste „fehlt noch“ und Warnung bei Unerwartetem (z. B. als verkauft geführt). Das Ergebnis wird gespeichert. |
| Sortly: Lagerorte | **Lagerorte** mit Vorschlägen beim Tippen, Filter in Räder- und Teileliste, Auswertung in der Übersicht |
| ProBikeGarage: Teile-Historie | **Verlauf** für jedes Rad und Teil: erfasst, ab- und eingebaut, Status, Preise, KI-Prüfung, Aufgaben |
| Werkstatt-Software: Aufträge | **Werkstatt-Aufgaben** pro Rad mit Arbeitszeit und Teilekosten, dazu eine **Kalkulation** (Einkauf + Teile + Arbeit gegenüber Erlös = Gewinn) |
| Werkstatt-Software: Teile aus dem Bestand | **Aus Lager einbauen**: passende Lagerteile werden nach Kategorie und Zustand vorgeschlagen |
| Identifier-Apps: schnelles Scannen | **Schnellerfassung**: viele Räder hintereinander fotografieren. Die KI erkennt im Hintergrund, die Ergebnisse prüfst du danach gesammelt unter „Zu prüfen“. |
| Bicycle Blue Book: Wertspanne | **KI-Verkaufsassistent**: Preisspanne privat, Händler-Ankauf, Erlös bei Einzelteilen, Empfehlung und ein fertiger Anzeigentext zum Kopieren oder Teilen |
| Bike Index / Polizei | **Rahmennummer-Prüfung**: Warnung bei doppelter Nummer, Direktlink zur Bike-Index-Suche, Hinweis auf den Abgleich bei der Polizei |
| Händlerpraxis Gebrauchtware | **Ankauf und Verkauf**: Datum, Verkäufer bzw. Käufer (Ankaufbeleg), Standzeit, Ladenhüter-Hinweis ab 90 Tagen |

## Mögliche nächste Schritte

- **Sync zwischen Geräten / Team-Betrieb** (z. B. über Supabase). Das ist der größte verbleibende Vorteil von Sortly.
- **Wartungsintervalle** für vermietete oder verliehene Räder (wie bei ProBikeGarage)
- **Kasse / Rechnung** beim Verkauf (Differenzbesteuerung nach § 25a UStG für Gebrauchtwaren)
- **Direkter Export zu Marktplätzen** (eBay-API). Kleinanzeigen bietet keine offene Schnittstelle, deshalb gibt es dort nur Kopieren/Teilen.

## Quellen

- Sortly: [Business-App](https://sortly.com/business-inventory-app), [Custom Fields](https://www.sortly.com/features/custom-fields/), [Testbericht](https://theretailexec.com/tools/sortly-review/)
- ProBikeGarage: [App Store](https://apps.apple.com/us/app/-/id1422489202), [eMTB-Forum](https://emtbforums.com/threads/anyone-using-probikegarage-app-for-tracking-maintanence-of-your-bike.11520)
- Laden- und Werkstatt-Software: [Tower Systems](https://www.towersystems.com.au/bike-shops), [Odoo Bike Shop](https://apps.odoo.com/apps/modules/19.0/bike_shop), [Saledock](https://www.saledock.com/industries/bike-shops), [velo.port-Alternativen (OMR)](https://omr.com/de/reviews/product/velo-port/alternatives), [Workshop by Bikebook](https://pickyourapp.com/de/products/workshop-by-bikebook)
- Identifier-Apps: [Vehicle Identifier](https://apps.apple.com/us/app/-/id6744629188), [Bike Identifier](https://apps.apple.com/us/app/-/id6747320897), [Nyckel Road-Bike-Klassifikator](https://edge.nyckel.com/pretrained-classifiers/road-bike-make/)
- [VeloBase](https://dcmpx.remotevs.com/com/velobase/PL/default.aspx), [Bicycle Blue Book](https://articles.bicyclebluebook.com/the-bicycle-blue-book-difference)
- Diebstahlprüfung: [Bike Index (Apify-Doku)](https://apify.com/jungle_synthesizer/bikeindex-stolen-bike-registry-scraper), [Rahmennummer prüfen (linexo)](https://www.linexo.de/magazin/tipps-tricks/fahrrad-rahmennummer-pruefen-denn-sicher-ist-sicher)
