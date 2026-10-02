// Punkte-Logik: reine Funktionen ohne Abhängigkeiten (leicht testbar)
export const RULES = {
  MAX: 100,           // pünktlich
  GRACE_MIN: 5,       // die ersten 5 Minuten geben die vollen Punkte
  MIN_IN_WINDOW: 10,  // Punkte am Fensterende (dorthin sinkt es linear)
  LATE: 10,           // nach Fensterende (nachgeholt)
  MOSQUE: 450,        // Moschee: fest, egal wann im Fenster (Gemeinschaftsgebet kann 30 Min später liegen)
};

export const dayKey = d => d.toLocaleDateString('sv-SE');   // YYYY-MM-DD in lokaler Zeit

/**
 * @param {{start: Date, end: Date, at: Date, place: 'home'|'mosque'}} p
 *   start/end = Gebetsfenster, at = Gebetsbeginn (Handy still / Check-in)
 * @returns {{points: number, tier: 'early'|'mosque'|'ontime'|'fading'|'late'}}
 */
export function calcPoints({ start, end, at, place }) {
  const s = +start, e = +end, t = +at;
  if (t < s) return { points: 0, tier: 'early' };            // vor Gebetsbeginn zählt nichts
  if (t > e) return { points: RULES.LATE, tier: 'late' };
  if (place === 'mosque') return { points: RULES.MOSQUE, tier: 'mosque' };
  const full = s + RULES.GRACE_MIN * 60000;
  if (t <= full) return { points: RULES.MAX, tier: 'ontime' };
  const k = (t - full) / Math.max(1, e - full);              // 0…1 über den Rest des Fensters
  return { points: Math.round(RULES.MAX - k * (RULES.MAX - RULES.MIN_IN_WINDOW)), tier: 'fading' };
}

/** Serie = Tage in Folge mit allen 5 Gebeten. Ein noch offener heutiger Tag bricht sie nicht. */
export function calcStreak(fullDays /* Set<'YYYY-MM-DD'> */, today = new Date()) {
  const d = new Date(today); d.setHours(12, 0, 0, 0);
  if (!fullDays.has(dayKey(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (fullDays.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
