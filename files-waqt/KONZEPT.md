# Waqt: technisches Konzept (Arbeitstitel)

Waqt (وقت, „Zeit“) ist eine Web-App für dich und drei Freunde. Ziel: Gebete pünktlich und möglichst in der Moschee verrichten, mit Punkten und einer Rangliste, die motiviert statt beschämt.

**Gliederung**

1. Architektur und Code-Landkarte
2. Was ein Browser kann und was nicht
3. Datenmodell
4. Punktesystem
5. Bilderkennung für den Gebetsteppich
6. Umsetzungsplan: Prototyp, MVP, Vollversion
7. Design und Motion
8. Datenschutz und Sicherheit
9. Einrichten

---

## 1. Architektur und Code-Landkarte

```
Handy (PWA, HTTPS)
 index.html ── main.js ─┬─ fx.js, clock.js       GSAP, SVG-Uhr
                        ├─ prayer-times.js ───►  Aladhan API (gratis, ohne Key)
                        ├─ geo.js ────────────►  Geolocation API
                        ├─ sensors.js ────────►  DeviceMotion, Wake Lock
                        ├─ rug.js ────────────►  TensorFlow.js + MobileNet (im Browser)
                        ├─ scoring.js            Punkte, Serie (reine Funktionen)
                        └─ db.js ─────────────►  Firebase Auth + Firestore (Spark, gratis)
```

| Baustein | Technik | Kosten |
|---|---|---|
| Hosting | Netlify oder Firebase Hosting | 0 € |
| Frontend | HTML, CSS, Vanilla-JS (ES-Module), GSAP 3.13 mit ScrollTrigger und ScrollSmoother (alle GSAP-Plugins sind seit der Webflow-Übernahme kostenlos) | 0 € |
| Gebetszeiten | Aladhan API: Koordinaten und Datum, optional Methode und Asr-Schule | 0 €, kein Key |
| Standort | HTML5 Geolocation | 0 € |
| Bewegung | DeviceMotion und Screen Wake Lock | 0 € |
| Bilderkennung | TensorFlow.js und MobileNet, läuft im Browser | 0 €, kein Server |
| Login und Daten | Firebase Auth (E-Mail/Passwort) und Firestore, Spark-Tarif | 0 € |

**Wo liegt welcher Code?**

| Deine Anforderung | Datei |
|---|---|
| GSAP-Motion: Handy wandert, Winkel bleibt, Lag | `js/fx.js`, CSS in `index.html` |
| Uhr ohne Zahlen, arabische Gebetsnamen | `js/clock.js` |
| Gebetszeiten-API | `js/prayer-times.js` |
| Punkte-Berechnung und Serie | `js/scoring.js` |
| Geolocation und Moschee-Nähe | `js/geo.js` |
| Handy-Stillstand als Gebetsbeginn und -ende | `js/sensors.js` |
| Bilderkennung mit Fallback | `js/rug.js` |
| Firebase Auth und Datenstruktur | `js/db.js`, `firestore.rules` |
| PWA | `sw.js`, `manifest.webmanifest` |
| Verdrahtung, Ablauf | `js/main.js` |

---

## 2. Was ein Browser kann und was nicht

| Wunsch | Realität | Lösung |
|---|---|---|
| Moschee automatisch erkennen | Browser bekommen im Hintergrund keine GPS-Position, nur bei geöffneter App. | Bei offener App: Auto-Check-in nach 3 Minuten innerhalb von 100 m. Sonst ein Tipp auf „Ich bin in der Moschee“. Wer echtes Hintergrund-Geofencing will: später eine Android-Hülle (Capacitor). |
| Handy liegt im anderen Zimmer und misst | Sperrt sich der Bildschirm, friert die Seite ein. | Wake Lock hält den Bildschirm an, die App zeigt nur Text auf Schwarz. In Home-Screen-Apps auf iPhones zuerst am echten Gerät testen. |
| Bewegungssensor auf iPhones | Freigabe nur direkt nach einem Tipp. | Der Knopf „Handy weglegen und beten“ löst sie aus. Android braucht das nicht. |
| Fotos speichern | Cloud Storage for Firebase verlangt inzwischen den Blaze-Tarif (Zahlungsmittel hinterlegt). Stand meiner Recherche seit Februar 2026, bitte in deiner Konsole gegenprüfen. | Fotos als JPEG (höchstens 640 px, etwa 50 KB) in Firestore, nach 30 Tagen automatisch gelöscht. Spark bleibt gratis, keine Karte nötig. |
| Erinnerung zu den Gebetszeiten | Web-Push braucht einen Server. | V1: Kalenderexport (.ics) mit Alarmen. V2: Push über einen kostenlosen Cron. |

---

## 3. Datenmodell (Firestore)

| Pfad | Inhalt |
|---|---|
| `users/{uid}` (für alle 4 lesbar) | `name`, `totalPoints`, `streak`, `createdAt` |
| `users/{uid}/private/prefs` (nur du) | `mosque {lat, lon, name}`, `method`, `school` |
| `prayers/{uid}_{YYYY-MM-DD}_{fajr\|dhuhr\|asr\|maghrib\|isha}` | `uid`, `day`, `prayer`, `place` (`home` oder `mosque`), `at` (Gebetsbeginn), `start`, `end`, `points`, `tier`, `via` (`gps`, `gps-auto`, `motion`, `manual`), `durationSec`, `dist`, `rug {verdict, score}`, `hasPhoto`, `createdAt` |
| `photos/{gleiche ID}` | `uid`, `dataUrl` (JPEG), `createdAt` |

Die feste ID macht Doppel-Einträge unmöglich (die Regeln erlauben kein Überschreiben) und erlaubt Abfragen nach Zeitraum ohne Extra-Index. Die Moschee-Koordinaten liegen bewusst im privaten Dokument: Deine Freunde sehen Punkte und Serie, nicht deinen Ort.

---

## 4. Punktesystem

| Situation | Punkte |
|---|---|
| Vor Beginn des Gebetsfensters | 0 |
| Zuhause, in den ersten 5 Minuten | 100 |
| Zuhause, danach | sinkt linear von 100 auf 10 bis zum Fensterende |
| Zuhause, nach dem Fenster (nachgeholt) | 10 |
| Moschee (höchstens 100 m, GPS besser als 80 m, Fenster offen) | 450, egal wann im Fenster |

Beispiel Asr, 15:00 bis 17:00: 15:05 gibt 100, 16:02:30 gibt 55, 17:00 gibt 10.

Annahmen, die ich getroffen habe (alles in `scoring.js` änderbar):

- „Dann nur noch 10 Punkte“ heißt: Die Kurve endet bei 10, danach bleibt es bei 10. So gibt es keinen Sprung.
- Fenster: Fajr bis Sonnenaufgang, Dhuhr bis Asr, Asr bis Maghrib, Maghrib bis Isha, Isha bis Mitternacht.
- Serie: Tage in Folge mit allen 5 Gebeten. Ein noch offener heutiger Tag bricht sie nicht.

---

## 5. Bilderkennung für den Gebetsteppich

Drei Stufen, die zusammen arbeiten:

1. **MobileNet im Browser.** Das vortrainierte ImageNet-Modell kennt die Klasse „prayer rug“. `rug.js` wertet die Top 5 aus: ab 20 % „ok“, ab 8 % „vielleicht“, sonst „nein“. Das Modell lädt erst beim ersten Foto (mehrere MB, danach im Browser-Cache).
2. **Eigenes Modell, falls die Trefferquote schlecht ist.** Mit Teachable Machine (kostenlos, von Google) 30 Fotos „Teppich“ und 30 „kein Teppich“ von euren vier Teppichen aufnehmen, als TensorFlow.js exportieren und in `checkRug` statt MobileNet laden.
3. **Immer aktiv: soziale Kontrolle.** Das Foto liegt 30 Tage im Profil, die Freunde sehen es über „Gebete ansehen“. Ein „nein“ sperrt niemanden, die Erkennung ist eine Hilfe. Die Kontrolle bleibt bei Menschen.

Kalibrieren: `?debug` an die URL hängen, 10 Fotos eurer Teppiche machen, die Top 5 in der Konsole ansehen und `THRESH` anpassen. Beim Verkleinern werden EXIF-Daten mit Fotostandort entfernt.

---

## 6. Umsetzungsplan

| Stufe | Inhalt | Fertig, wenn |
|---|---|---|
| 0 Prototyp | Ordner auf Netlify ziehen. Demo-Modus ohne Firebase: Hero mit Motion, Uhr, echte Zeiten, Punkte, Moschee-Check, Sensor-Test | Bewegung und Uhr gefallen dir auf dem Handy |
| 1 MVP | Firebase-Projekt (Spark), 4 Konten, Regeln, Rangliste live | Alle 4 können sich anmelden, Rangliste zeigt echte Punkte |
| 2 Zuhause-Ablauf | Foto, Teppich-Check, Stillstand. Pro Handy 10 Testläufe, Schwellen `calmSd`, `moveDev` anpassen | Beginn und Ende werden zuverlässig erkannt |
| 3 Feinschliff | Icons, Offline, Kalenderexport (.ics), Zweifel-Knopf mit Abstimmung, Namen im Profil ändern, Wochenansicht, Google Fonts selbst hosten | Fühlt sich fertig an |
| 4 optional | Android-Hülle (Capacitor) mit echtem Hintergrund-Geofencing und Push | Moschee wird auch bei geschlossener App erkannt |

---

## 7. Design und Motion

**Farben** (nur deine zwei, plus Abstufungen)

| Variable | Wert | Einsatz |
|---|---|---|
| `--deep` | `#004E64` | Bühne, Handy-Screen, Text im App-Bereich |
| `--deep-900` | `#00303D` | Gehäuse, Dialoge |
| `--deep-500` | `#437B8C` | mittlere Stufe |
| `--mist` | `#E0E5E9` | Text auf der Bühne, Fläche des App-Bereichs |
| `--mist-300` | `#B7C2CA` | Nebenton |

Haarlinien sind Nebel mit 20 bis 50 % Deckkraft. „Aktiv“ heißt heller, nie bunt, nie rot.

**Schrift:** Archivo, weit gezogen (`font-stretch: 125%`) und hauchdünn (200) für Überschriften, normale Breite für Text. Arabisch in Noto Kufi Arabic (200 bis 400).

**Die Uhr:** 24-Stunden-Zifferblatt, 12 Uhr oben, Mitternacht unten. Statt Zahlen nur 24 feine Striche. Die fünf arabischen Namen stehen an der echten Beginn-Uhrzeit ihres Gebets, ein dünner Bogen zeigt das Zeitfenster, das laufende leuchtet. Drei Zeiger: Stunde (eine Umdrehung pro Tag), Minute, gleitende Sekunde. Liegen zwei Namen näher als 28 Grad beieinander (Maghrib und Isha im Winter), springt einer auf den inneren Ring.

**Motion-Drehbuch** (Bühne gepinnt, 520 % Scrollweg, 7 Zeiteinheiten)

| Einheit | Was passiert |
|---|---|
| 0 bis 1 | Handy steigt von unten auf (Größe 0,8 auf 1), Titel blendet aus |
| 1 bis 3 | Handy wandert nach rechts, Text 1 links |
| 3 bis 5 | Handy wandert nach links, Text 2 rechts |
| 5 bis 7 | Handy in die Mitte, 10 % größer, Text 3 darunter |

- Der Winkel (−9°) liegt in `.tilt` im CSS. GSAP bewegt nur `x`, `y`, `scale`, deshalb kann er nicht driften.
- Lag: `.halo` (Hintergrundringe) läuft mit `scrub: 1.8` hinter dem Handy her. Die vier Ranglisten-Zeilen bekommen 0,12 bis 0,54 s Lag über `smoother.effects`.
- Parallax: `data-speed="0.94"` auf den Überschriften.
- Performance: nur `transform` und `opacity`, kein `backdrop-filter`, keine Blend-Modi. `will-change` nur am Handy. Die Uhr-Schleife pausiert außerhalb des Bildschirms und bei versteckter Seite.
- Bei „Bewegung reduzieren“ entfallen Smoother und Pinning, die Seite ist statisch, die Sekunde tickt statt zu gleiten.

**Ton der Oberfläche:** barmherzig. Ein Gebet nach dem Fenster heißt „nachholbar“, nicht „verpasst“. Die Serie überlebt einen noch offenen Tag. Nichts wird rot.

---

## 8. Datenschutz und Sicherheit

- **Zugriff:** Firestore-Regeln lassen nur die vier UIDs zu. Wer sich sonst über den öffentlichen API-Key registriert, sieht und schreibt nichts. Jeder schreibt nur eigene Daten, Gebets-Einträge sind unveränderlich, Punkte dürfen nur steigen (höchstens 450 pro Schreibvorgang), Einträge sind höchstens 24 Stunden alt.
- **Ehrlich gesagt:** Es gibt keinen Server, der nachrechnet (das wäre Cloud Functions, also Blaze). GPS und Uhr lassen sich am Handy fälschen. Für vier Freunde reichen Sichtbarkeit und Vertrauen, genau dafür sind die Fotos da.
- **Der Firebase-API-Key ist kein Geheimnis.** Den Schutz liefern Auth und Regeln. Zusätzlich in der Google Cloud Console den Key auf deine Domain beschränken.
- **Religiöse Daten sind besonders geschützt** (Art. 9 DSGVO). Bei vier privaten Freunden greift meist die Haushaltsausnahme, ich bin aber kein Anwalt. Sprecht offen ab, was gespeichert wird, und jeder muss seine Daten löschen können.
- **Datensparsam:** Es wird nur die Distanz zur Moschee gespeichert, keine Bewegungsdaten. Moschee-Koordinaten sind privat. Fotos werden neu gezeichnet (EXIF weg) und nach 30 Tagen gelöscht. Kein Analytics-SDK, keine Tracker.
- **Google Fonts** übertragen die IP-Adresse an Google. Für die Vollversion Archivo und Noto Kufi Arabic selbst hosten.
- **Konten:** lange Passwörter, am besten im Passwort-Manager. HTTPS ist Pflicht (Standort und Sensoren funktionieren sonst nicht).

**Bekannte Grenzen:** Nach Mitternacht gilt noch die Isha des Vortags, die App zeigt dann „nächstes Gebet: Fajr“. Zeiten werden in der Zeitzone des Handys gelesen, der Fallback-Ort ist nur zum Anschauen. In Polarnächten liefert Aladhan Ersatzwerte.

---

## 9. Einrichten

1. Ordner `waqt` auf Netlify ziehen (oder lokal `npx serve`). Es läuft sofort im Demo-Modus ohne Firebase. Mit `?debug` an der URL siehst du Sensor- und Teppichwerte.
2. Firebase-Projekt im Spark-Tarif anlegen. Authentication: E-Mail/Passwort aktivieren, 4 Nutzer anlegen, die UIDs notieren.
3. Firestore anlegen (Region in der EU), `firestore.rules` einfügen, die 4 UIDs eintragen, veröffentlichen.
4. Web-App registrieren, die Config in `js/db.js` eintragen. Die Versionsnummer in der Importmap (`index.html`) aus dem CDN-Snippet der Konsole übernehmen.
5. Die Netlify-Domain unter Authentication, Einstellungen, Autorisierte Domains ergänzen.
6. Auf allen vier Handys „Zum Startbildschirm hinzufügen“.
