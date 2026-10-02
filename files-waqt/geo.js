// GPS + Moschee-Nähe (Haversine). Gespeichert wird nur die Distanz, keine Bewegungsdaten.
export const RADIUS_M = 100;     // höchstens 100 m um die Hauptmoschee
export const MAX_ACC_M = 80;     // GPS ungenauer als das → ablehnen (sonst zählt auch das Nachbarhaus)

/** Luftlinie in Metern zwischen zwei {lat, lon} */
export const distanceM = (a, b) => {
  const R = 6371000, rad = x => x * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

export const getPosition = (opts = {}) => new Promise((ok, fail) => {
  if (!navigator.geolocation) return fail(new Error('no-geolocation'));
  navigator.geolocation.getCurrentPosition(
    p => ok({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy }),
    fail,
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0, ...opts });
});

/** Einmal-Check per Tipp: bin ich jetzt an meiner Moschee? */
export async function checkMosque(mosque) {
  const p = await getPosition({ maximumAge: 30000, timeout: 20000 });   // ein Fix der letzten 30 s genügt: drinnen dauert ein frischer lange
  const dist = Math.round(distanceM(p, mosque)), acc = Math.round(p.acc);
  if (acc > MAX_ACC_M) return { ok: false, reason: 'weak-gps', dist, acc };
  return dist <= RADIUS_M ? { ok: true, reason: 'ok', dist, acc } : { ok: false, reason: 'too-far', dist, acc };
}

/**
 * Automatischer Check-in: meldet sich, wenn du dwellMs am Stück im Radius warst.
 * Läuft nur, solange die App offen ist – Browser bekommen im Hintergrund keine GPS-Position.
 * Rückgabe: Funktion zum Beenden.
 */
export function watchMosque(mosque, { dwellMs = 3 * 60000, onCheckin }) {
  let since = null, dist = null, fired = false;
  const wid = navigator.geolocation.watchPosition(p => {
    dist = Math.round(distanceM({ lat: p.coords.latitude, lon: p.coords.longitude }, mosque));
    const inside = p.coords.accuracy <= MAX_ACC_M && dist <= RADIUS_M;
    since = inside ? (since ?? Date.now()) : null;
  }, () => {}, { enableHighAccuracy: true, maximumAge: 15000 });
  // Timer statt nur Callback: steht das Handy still, kommen kaum neue Positionen
  const tid = setInterval(() => {
    if (!fired && since && Date.now() - since >= dwellMs) { fired = true; onCheckin(dist); }
  }, 15000);
  return () => { navigator.geolocation.clearWatch(wid); clearInterval(tid); };
}
