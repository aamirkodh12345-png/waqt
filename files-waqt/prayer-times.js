// Gebetszeiten: Aladhan (kostenlos, ohne Key) → Zeitfenster pro Gebet
import { dayKey } from './scoring.js';

export const PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
export const LABEL = { fajr: 'Fajr', dhuhr: 'Dhuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha' };
export const AR = { fajr: 'الفجر', dhuhr: 'الظهر', asr: 'العصر', maghrib: 'المغرب', isha: 'العشاء' };

// "05:41" oder "05:41 (CEST)" → Date am Tag `day`
const atTime = (day, hhmm) => {
  const [, h, m] = /(\d{1,2}):(\d{2})/.exec(hhmm);
  const d = new Date(day); d.setHours(+h, +m, 0, 0); return d;
};

/** Fenster: Fajr→Sonnenaufgang, Dhuhr→Asr, Asr→Maghrib, Maghrib→Isha, Isha→Mitternacht */
export function buildWindows(t, day = new Date()) {
  const s = { fajr: atTime(day, t.Fajr), dhuhr: atTime(day, t.Dhuhr), asr: atTime(day, t.Asr), maghrib: atTime(day, t.Maghrib), isha: atTime(day, t.Isha) };
  const e = { fajr: atTime(day, t.Sunrise), dhuhr: s.asr, asr: s.maghrib, maghrib: s.isha, isha: atTime(day, t.Midnight) };
  if (e.isha <= s.isha) e.isha = new Date(+e.isha + 864e5);          // „00:47“ liegt schon im Folgetag
  return PRAYERS.map(id => ({ id, start: s[id], end: e[id] }));
}

/** Aktuelles Fenster (oder null) und nächster Beginn */
export function pickWindows(ws, now = new Date()) {
  return {
    cur: ws.find(w => now >= w.start && now < w.end) || null,
    next: ws.find(w => w.start > now) || null,
  };
}

/** Lädt die Zeiten für einen Tag; gecacht pro Tag/Ort/Methode, damit die App auch offline die heutigen Zeiten kennt */
export async function loadTimes({ lat, lon, day = new Date(), method, school }) {
  const k = dayKey(day);
  const ck = `gp:pt:${k}:${lat.toFixed(2)},${lon.toFixed(2)}:${method ?? ''}:${school ?? ''}`;
  let t = null;
  try { t = JSON.parse(localStorage.getItem(ck)); } catch { /* kaputter Cache → neu laden */ }
  if (!t) {
    const [y, m, d] = k.split('-');
    const q = new URLSearchParams({ latitude: lat, longitude: lon });
    if (method != null) q.set('method', method);      // ohne Angabe wählt Aladhan selbst
    if (school != null) q.set('school', school);      // 0 = Shafi/Maliki/Hanbali, 1 = Hanafi (nur Asr)
    const r = await fetch(`https://api.aladhan.com/v1/timings/${d}-${m}-${y}?${q}`);
    if (!r.ok) throw new Error('Aladhan ' + r.status);
    t = (await r.json()).data.timings;
    Object.keys(localStorage).filter(x => x.startsWith('gp:pt:') && !x.includes(`:${k}:`)).forEach(x => localStorage.removeItem(x));
    localStorage.setItem(ck, JSON.stringify(t));
  }
  return buildWindows(t, day);
}
