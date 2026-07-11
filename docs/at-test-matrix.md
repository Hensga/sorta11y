# AT-Testmatrix

Verbindliche Assistive-Technology-Kombinationen für die manuelle A11y-Verifikation.
Es sind die drei verbreitetsten Stacks. Die automatisierte Prüfung mit axe-core
ergänzt diese Matrix — ersetzt sie aber **nicht**, weil das Live-Region-Timing je
AT/Browser variiert und nicht voll automatisierbar ist.

## Kombinationen

| #   | Screenreader | Browser | OS      | Status       |
| --- | ------------ | ------- | ------- | ------------ |
| 1   | NVDA         | Firefox | Windows | ☐ ausstehend |
| 2   | JAWS         | Chrome  | Windows | ☐ ausstehend |
| 3   | VoiceOver    | Safari  | macOS   | ☐ ausstehend |

## Testszenarien (je Kombination)

Jede Kombination durchläuft jedes Szenario einzeln; Ergebnisse werden protokolliert.

| #   | Szenario                         | Erwartung                                                                                                                                                                   |
| --- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | Liste durchlaufen (Tab)          | **Jedes** Item ist ein Tab-Stopp (Tab/Shift+Tab); aktiver Griff angesagt inkl. „Position X von Y".                                                                          |
| S2  | Aufnehmen (Leertaste/Enter)      | Im **Browse-Modus** greift der Griff-Button ohne manuelles Umschalten; Ansage „aufgenommen" + Pfeiltasten-Hinweis; `aria-pressed=true`.                                     |
| S3  | Bewegen (Pfeil ↑/↓)              | Nach jeder Bewegung neue Position angesagt; Fokus bleibt am bewegten Item.                                                                                                  |
| S4  | An den Rand (Home/End)           | Sprung an Anfang/Ende mit korrekter Positionsansage.                                                                                                                        |
| S5  | Ablegen (Leertaste/Enter)        | Ansage „abgelegt an Position X von Y"; `aria-pressed=false`; Reihenfolge committet (onChange).                                                                              |
| S6  | Abbrechen (Esc)                  | Ausgangsreihenfolge wiederhergestellt; passende Ansage; Fokus zurück am Item.                                                                                               |
| S7  | Auto-Abbruch                     | Maus/Touch/scroll/resize/Tab-Wechsel während Grab → sauberer Abbruch ohne „hängenden" Zustand.                                                                              |
| S8  | Fokus-Restore                    | Nach Umordnung bleibt der Fokus am selben Item (per `data-id`), springt nicht auf `<body>`.                                                                                 |
| S9  | Keine verschluckte/Doppel-Ansage | Erste Ansage nach Init nicht verschluckt; identische Folgetexte werden zuverlässig erneut angesagt.                                                                         |
| S10 | Fokusmodus nur beim Grab         | Im Ruhezustand ist die Liste normal lesbar (Browse-Modus); `role="application"` liegt **nur während** des Grabs am Wrapper an und ist nach Ablegen/Abbruch wieder entfernt. |

## Automatisierte Prüfung (axe-core)

`test/axe.test.js` lässt **axe-core** gegen die enhanced Liste laufen (im
Leerlauf, während eines Grabs und im Handle-Modus) und ist Teil der CI-Suite.
Layout-abhängige Regeln (Farbkontrast) brauchen einen echten Renderer und sind
unter jsdom deaktiviert — Kontrast + echtes Screenreader-Verhalten bleiben dieser
manuellen Matrix vorbehalten.

**ARIA-Entscheidung aus dem axe-Gegentest:** `role="button"` ist auf einem `<li>`
(in einer `<ul>`) nicht gültig, und `aria-pressed` setzt `role="button"` voraus.
Daraus folgt:

- **Mit Handle** (empfohlen): `<ul>` Liste, `<li>` listitem, der Handle ein
  Button mit `aria-pressed` — voll axe-clean und reichster Screenreader-Zustand.
- **Ohne Handle**: das `<li>` bleibt ein natives listitem (fokussierbar,
  `aria-describedby`-Anleitung); der Greif-Zustand wird über die Live-Region und
  die `--grabbed`-Klasse getragen (kein `aria-pressed`). Ebenfalls axe-clean.

**Fokusmodus / `role="application"`:** NVDA/JAWS verschlucken Leertaste und
Pfeiltasten im Browse-Modus, deshalb schaltet sorta11y — nach dem Muster von
GitHubs eigener Sortierliste und MDNs „kleinstmöglich, letztes Mittel"-Hinweis —
`role="application"` **nur während eines aktiven Grabs** auf einem umschließenden
`<div>` ein (nicht auf der `<ul>`, wo es ungültig wäre und die listitem-Semantik
zerstörte) und nach dem Ablegen/Abbrechen wieder aus. Der Pickup läuft über die
**Aktivierung des Griff-Buttons** (ein `click`, der auch im Browse-Modus ankommt),
nicht über ein rohes Leertaste-`keydown`. Abschaltbar über `applicationRole:false`
bzw. `data-application-role="false"`. axe bleibt im Ruhe- **und** im Greif-Zustand
sauber (Test: `test/application.test.js`).

> **Manuell zu prüfen (S2/S3):** Die „aufgenommen"/„verschoben"-Ansagen der
> Live-Region feuern, _während_ der Vorfahr `role="application"` trägt. NVDA/JAWS
> behandeln Live-Regionen innerhalb einer Application-Region uneinheitlich —
> deshalb explizit gegenprüfen, dass diese Ansagen im Fokusmodus tatsächlich
> ankommen (nicht nur der Fokuswechsel).

**Gemessener Befund (2026-07-08, AT-SPI „press" gegen beide Engines — derselbe
Engine-Pfad, den NVDA/JAWS unter Windows über IAccessible2/UIA treiben):** Die
AT-Aktivierung eines Griff-Buttons kommt **nicht** als Tastatur-Klick
(`detail 0`) an, sondern:

- **Chromium:** `pointerdown(0) → mousedown(0) → pointerup(0) → mouseup(0) →
click(detail 1)` — die synthetische Pointer-Sequenz macht die Aktivierung von
  einem echten Maus-Tap ununterscheidbar.
- **Gecko:** `mousedown(1) → mouseup(1) → click(detail 1)` — ohne Pointer-Events.

Der Pickup verlangt deshalb kein `detail === 0` mehr: Ein Klick zählt als
Aktivierung, sofern ihn keine jüngste Pointer-Aktivität auf demselben Item
erklärt. Regressionstests spielen beide gemessenen Sequenzen nach
(`test/pointer.test.js`, „assistive-technology activation clicks"). Damit nimmt
auch ein `<span role="button">`-Griff den Browse-Modus-Pickup über denselben
Klick-Pfad (unit-getestet; manuell gegenprüfen). Einschränkung: Mit
`clickToGrab: false` bleibt der Browse-Modus-Pickup in Chromium gated (die
AT-Aktivierung sieht dort wie ein Maus-Tap aus) — dort in den Fokusmodus
wechseln.

**Moduswechsel via Fokus-Umzug (2026-07-09, nach manueller NVDA-Verifikation
von S3):** NVDA wertet Browse- vs. Fokusmodus nur bei **Fokus-Ereignissen**
neu aus. Beim Pickup sitzt der Fokus aber bereits auf dem Grab-Target — ein
einfaches `focus()` ist ein No-op, und auch ein `blur()`+`focus()` hilft
nicht: Die Engines bündeln Accessibility-Updates zu Diffs, ein Refocus
desselben Knotens ist netto null und wird wegkoalesziert (per AT-SPI
gemessen: kein `focused`-Gain erreicht je den Bus). Deshalb zieht der Grab
den Fokus **auf die Liste selbst** um (temporäres `tabindex="-1"`, wird beim
Loslassen wieder entfernt) — ein echter, dauerhafter Fokuswechsel in die
Application-Region, der die Koaleszierung überlebt (Bus-verifiziert:
`focused d1=1` auf der Liste). Die Pfeiltasten funktionieren weiter, weil der
Listen-Keydown-Handler das gegriffene Item unabhängig vom Event-Ziel bewegt;
Drop/Escape geben den Fokus ans Grab-Target zurück. Hörbarer Nebeneffekt:
NVDA sagt beim Aufnehmen kurz den Listennamen an, dann folgt die
„aufgenommen"-Ansage. S2/S3/S9 nach diesem Fix erneut manuell verifizieren.

## Ergebnis-Protokoll (manuell)

Pro Lauf wird hier (oder in einer verlinkten Datei) eine Tabelle
Kombination × Szenario mit ✅ / ⚠️ / ❌ + Notiz festgehalten — als Portfolio-Beleg
und Regressionsbasis.

| Datum      | Screenreader + Browser         | Szenarien      | Ergebnis | Notiz                                                                                                                                                                                                                                    |
| ---------- | ------------------------------ | -------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-07-09 | NVDA + Chrome/Edge (Windows)\* | S2, S3, S5, S6 | ✅       | Browse-Modus-Pickup per Leertaste/Enter am Handle, Pfeiltasten bewegen nach automatischem Fokusmodus-Wechsel, Ablegen + Escape ok. Getestet auf einer Produktions-Formularintegration (Handles via `fromSelect`, `clickToGrab` Default). |

\* Nicht identisch mit Matrix-Kombination #1/#2 — die offiziellen Läufe
(NVDA + Firefox, JAWS + Chrome, VoiceOver + Safari) stehen weiterhin aus.
