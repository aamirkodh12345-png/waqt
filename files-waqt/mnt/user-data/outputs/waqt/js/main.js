// Verdrahtung: Standort → Gebetszeiten → Uhr → Liste → Aktionen → Speichern
import { initFx } from './fx.js';
import { mountClock } from './clock.js';
import { loadTimes, pickWindows, LABEL, AR } from './prayer-times.js';
import { calcPoints, calcStreak, dayKey } from './scoring.js';
import { getPosition, checkMosque, watchMosque } from './geo.js';
import { askMotionPermission, StillnessWatcher, keepAwake } from './sensors.js';
import { fileToCanvas, checkRug } from './rug.js';
import * as db from './db.js';

const $ = s => document.querySelector(s);
const hhmm = d => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const ms = t => (t?.toMillis ? t.toMillis() : +t);                       // Firestore-Timestamp oder Zahl
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const load = (k, d) => JSON.parse(localStorage.getItem('gp:' + k) || 'null') ?? d;
const store = (k, v) => localStorage.setItem('gp:' + k, JSON.stringify(v));
const DEBUG = new URLSearchParams(location.search).has('debug');

const FALLBACK = { lat: 36.7213, lon: -4.4214 };   // Málaga: nur zum Anschauen, bis du den Standort freigibst
const MIN_PRAYER_SEC = 90;                          // kürzer = versehentlich bewegt, dann wartet die App weiter

const S = {
  pos: load('pos', FALLBACK), ws: [], done: {}, hist: [], uid: null, online: false,
  me: { name: 'Ich', totalPoints: 0, streak: 0, mosque: null, method: null, school: null },
};
const fx = initFx();
const dial = mountClock($('#dial'));

function toast(m) {
  const t = $('#toast'); t.textContent = m; t.hidden = false;
  clearTimeout(toast.id); toast.id = setTimeout(() => { t.hidden = true; }, 4500);
}

// ── Standort und Gebetszeiten ──
async function refreshTimes() {
  try { S.ws = await loadTimes({ ...S.pos, method: S.me.method, school: S.me.school }); }
  catch { if (!S.ws.length) toast('Gebetszeiten konnten nicht geladen werden. Prüfe die Internetverbindung.'); }
  dial.setTimes(S.ws);
  renderToday();
}

async function locate() {
  try {
    const p = await getPosition({ enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 });
    S.pos = { lat: p.lat, lon: p.lon }; store('pos', S.pos);
  } catch { toast('Standort nicht freigegeben. Ich nutze den zuletzt gespeicherten Ort.'); }
  await refreshTimes();
}

// ── Verlauf, heutige Einträge, Serie ──
async function loadHistory() {
  const from = dayKey(new Date(Date.now() - 60 * 864e5));
  S.hist = S.online
    ? await db.recentPrayers(S.uid, from)
    : Object.values(load('demo', { days: {} }).days).flatMap(d => Object.values(d));
  const today = dayKey(new Date());
  S.done = Object.fromEntries(S.hist.filter(h => h.day === today).map(h => [h.prayer, h]));
  const byDay = {};
  for (const h of S.hist) (byDay[h.day] ??= new Set()).add(h.prayer);
  S.me.streak = calcStreak(new Set(Object.keys(byDay).filter(d => byDay[d].size >= 5)));
}

// ── Darstellung ──
function renderToday() {
  const now = new Date(), { cur } = pickWindows(S.ws, now);
  $('#today').innerHTML = S.ws.map(w => {
    const r = S.done[w.id], live = cur?.id === w.id, past = now >= w.end;
    const status = r ? `${r.points} Punkte, ${r.place === 'mosque' ? 'Moschee' : 'Zuhause'}` : live ? 'jetzt' : past ? 'nachholbar' : 'kommt noch';
    const acts = !r && (live || past)
      ? `<span class="act">${live ? `<button data-act="mosque" data-id="${w.id}">Ich bin in der Moschee</button>` : ''}
           <button data-act="home" data-id="${w.id}">${past ? 'Nachholen' : 'Zuhause gebetet'}</button></span>`
      : '';
    return `<li class="row${live ? ' live' : ''}">
      <span class="ar" lang="ar">${AR[w.id]}</span>
      <span class="nm">${LABEL[w.id]}<small>${hhmm(w.start)} bis ${hhmm(w.end)}</small></span>
      <span class="st">${status}</span>${acts}</li>`;
  }).join('') || '<li class="row muted">Noch keine Gebetszeiten. Gib den Standort frei oder prüfe die Verbindung.</li>';
  fx.refresh();
}

function renderMe() {
  const m = S.me;
  const last = [...S.hist].sort((a, b) => ms(b.at) - ms(a.at)).slice(0, 5)
    .map(h => `<li>${LABEL[h.prayer]}, ${new Date(ms(h.at)).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}, ${h.points} Punkte</li>`).join('');
  $('#me').innerHTML = `<p class="big">${(m.totalPoints || 0).toLocaleString('de-DE')} Punkte</p>
    <p>${esc(m.name)}, Serie: ${m.streak || 0} ${m.streak === 1 ? 'Tag' : 'Tage'}</p>
    <p>${m.mosque ? `Hauptmoschee: ${esc(m.mosque.name)}` : 'Noch keine Hauptmoschee gespeichert.'}</p>
    ${last ? `<ul class="plain">${last}</ul>` : ''}`;
  $('#logout').hidden = !S.online;
  fx.refresh();
}

function renderBoard(rows) {
  $('#board').innerHTML = rows.map((r, i) => `<li class="row"><span class="pl">${i + 1}</span>
    <span class="nm">${esc(r.name)}${r.streak ? `<small>Serie: ${r.streak} Tage</small>` : ''}</span>
    <span class="pt">${(r.totalPoints || 0).toLocaleString('de-DE')}</span>
    <span class="act"><button class="ghost" data-uid="${esc(r.uid)}" data-name="${esc(r.name)}">Gebete ansehen</button></span></li>`).join('');
  fx.lagRows([...document.querySelectorAll('#board .row')]);
  fx.refresh();
}

// ── Ein Gebet speichern ──
async function finish(w, { place, at, via, photo = null, extra = {} }) {
  const { points, tier } = calcPoints({ start: w.start, end: w.end, at, place });
  if (tier === 'early') return toast('Das Gebetsfenster hat noch nicht begonnen.');
  const r = { day: dayKey(w.start), prayer: w.id, place, at, start: w.start, end: w.end, points, tier, via, ...extra };
  try {
    if (S.online) await db.savePrayer(S.uid, r, photo);
    else {                                                              // Demo-Modus: alles lokal
      const d = load('demo', { total: 0, days: {} });
      (d.days[r.day] ??= {})[r.prayer] = { ...r, at: +at, start: +w.start, end: +w.end };
      d.total += points; store('demo', d);
    }
  } catch (e) {
    return toast(e?.code === 'permission-denied'
      ? 'Nicht gespeichert: Dieses Gebet ist heute schon eingetragen, oder die Regeln lassen es nicht zu.'
      : 'Nicht gespeichert. Prüfe die Verbindung und versuche es noch einmal.');
  }
  S.me.totalPoints += points;
  await loadHistory(); renderToday(); renderMe(); armMosqueWatch();
  if (S.online && Object.keys(S.done).length >= 5) db.saveProfile(S.uid, { streak: S.me.streak }).catch(() => {});
  toast(`+${points} Punkte`);
}

// ── Moschee: Ein-Tipp-Check und Auto-Check bei offener App ──
async function mosqueFlow(w) {
  if (!S.me.mosque) return toast('Speichere zuerst deine Hauptmoschee (unter Profil).');
  toast('Ich prüfe deinen Standort …');
  try {
    const c = await checkMosque(S.me.mosque);
    if (!c.ok) return toast(c.reason === 'weak-gps'
      ? `Das GPS ist zu ungenau (${c.acc} m). Geh kurz ans Fenster oder nach draußen.`
      : `Du bist ${c.dist} m entfernt. Erlaubt sind 100 m.`);
    await finish(w, { place: 'mosque', at: new Date(), via: 'gps', extra: { dist: c.dist } });
  } catch { toast('Standort nicht verfügbar. Erlaube den Zugriff in den Browser-Einstellungen.'); }
}

let stopWatch = null, armSeq = 0;
async function armMosqueWatch() {                 // nur bei offener App: Browser bekommen im Hintergrund kein GPS
  const my = ++armSeq; stopWatch?.(); stopWatch = null;
  const { cur } = pickWindows(S.ws);
  if (!cur || S.done[cur.id] || !S.me.mosque) return;
  const perm = await navigator.permissions?.query({ name: 'geolocation' }).catch(() => null);
  if (my !== armSeq || perm?.state !== 'granted') return;
  stopWatch = watchMosque(S.me.mosque, {
    onCheckin: dist => finish(cur, { place: 'mosque', at: new Date(), via: 'gps-auto', extra: { dist } }),
  });
}

// ── Zuhause: Teppich-Foto, dann Handy weglegen, Stillstand misst Beginn und Ende ──
const sh = { el: $('#sheet'), t: $('#sh-title'), p: $('#sh-text'), img: $('#sh-img'), photo: $('#sh-photo'), go: $('#sh-go'), cancel: $('#sh-cancel') };

function homeFlow(w) {
  let canvas = null, rug = null, watcher = null, stopAwake = null, start = null;
  sh.el.onclose = () => { watcher?.stop(); stopAwake?.(); };            // schließt jeder Weg (auch Esc): Sensor und Wach-Sperre frei
  sh.cancel.onclick = () => sh.el.close();
  sh.t.textContent = `${LABEL[w.id]} zuhause`;
  sh.p.textContent = 'Breite den Teppich aus und fotografiere ihn von oben.';
  sh.img.hidden = true; sh.photo.value = ''; sh.go.disabled = true;
  sh.el.showModal();

  sh.photo.onchange = async () => {
    const f = sh.photo.files[0]; if (!f) return;
    sh.p.textContent = 'Ich prüfe den Teppich …';
    try { canvas = await fileToCanvas(f); }
    catch { sh.p.textContent = 'Das Foto ließ sich nicht öffnen. Versuch es noch einmal.'; return; }
    sh.img.src = canvas.toDataURL('image/jpeg', 0.5); sh.img.hidden = false;
    rug = await checkRug(canvas);
    sh.p.textContent = {
      ok: 'Gebetsteppich erkannt.',
      maybe: 'Vielleicht ein Teppich. Deine Freunde sehen das Foto.',
      no: 'Ich erkenne keinen Gebetsteppich. Fotografiere von oben, sodass er ganz im Bild ist. Du kannst trotzdem weitermachen, deine Freunde sehen das Foto.',
      unavailable: 'Die Erkennung ist gerade nicht verfügbar. Deine Freunde sehen das Foto.',
    }[rug.verdict];
    sh.go.disabled = false;                                             // auch bei „no“: soziale Kontrolle statt Sperre
  };

  sh.go.onclick = async () => {                                         // echter Tipp → iPhones erlauben hier die Sensor-Freigabe
    const photo = canvas.toDataURL('image/jpeg', 0.6);
    const meta = { rug: { verdict: rug.verdict, score: rug.score } };
    const save = (at, via, extra = {}) => { sh.el.close(); return finish(w, { place: 'home', at, via, photo, extra: { ...meta, ...extra } }); };
    if (!(await askMotionPermission())) return save(new Date(), 'manual');
    stopAwake = keepAwake(); sh.go.disabled = true;
    sh.p.textContent = 'Leg das Handy hin. Ich warte auf Ruhe …';
    watcher = new StillnessWatcher({
      onNoData: () => { toast('Kein Bewegungssensor gefunden. Ich speichere ohne Sensor.'); save(new Date(), 'manual'); },
      onSample: sd => { if (DEBUG) sh.t.textContent = `sd ${sd.toFixed(3)}`; },
      onStill: t => { start = t; sh.p.textContent = `Gebet läuft seit ${hhmm(t)}. Nimm das Handy danach einfach wieder hoch.`; },
      onMove: end => {
        const sec = Math.round((end - start) / 1000);
        if (sec < MIN_PRAYER_SEC) { sh.p.textContent = 'Das war kürzer als ein Gebet. Leg das Handy wieder hin, ich warte weiter.'; watcher.start(); return; }
        save(start, 'motion', { durationSec: sec });
      },
    });
    watcher.start();
  };
}

// ── Freunde: Einträge und Fotos ansehen (soziale Kontrolle) ──
async function openFriend(uid, name) {
  $('#fr-name').textContent = name;
  $('#fr-list').innerHTML = '<li class="row muted">Lade …</li>';
  $('#friend').showModal();
  try {
    const rows = (await db.recentPrayers(uid, dayKey(new Date(Date.now() - 7 * 864e5))))
      .sort((a, b) => ms(b.at) - ms(a.at)).slice(0, 12);
    $('#fr-list').innerHTML = rows.map(p => `<li class="row" data-id="${esc(p.id)}">
      <span class="nm">${LABEL[p.prayer]}<small>${esc(p.day)}, ${p.place === 'mosque' ? 'Moschee' : 'Zuhause'}, ${p.points} Punkte</small></span>
      ${p.hasPhoto ? '<span class="act"><button data-act="photo">Foto ansehen</button></span>' : ''}</li>`).join('')
      || '<li class="row muted">Noch keine Einträge.</li>';
  } catch { $('#fr-list').innerHTML = '<li class="row muted">Die Einträge ließen sich nicht laden.</li>'; }
}

// ── Profil und Einstellungen ──
async function patchMe(p) {
  Object.assign(S.me, p);
  if (S.online) await db.saveProfile(S.uid, p); else store('me', S.me);
}
const syncSettings = () => { $('#school').value = S.me.school ?? ''; $('#method').value = S.me.method ?? ''; };

async function afterLogin() {
  await loadHistory(); syncSettings(); renderMe();
  await refreshTimes(); armMosqueWatch();
}

let unwatch = null;
async function boot() {
  S.online = await db.connect();
  if (!S.online) {                                                      // Demo-Modus: alles lokal, keine Rangliste
    Object.assign(S.me, load('me', {})); S.me.totalPoints = load('demo', { total: 0 }).total;
    $('#board').innerHTML = '<li class="row muted">Die Rangliste erscheint, sobald Firebase verbunden ist (siehe KONZEPT.md, Abschnitt 9).</li>';
    return afterLogin();
  }
  $('#main').hidden = true;
  db.onUser(async u => {
    S.uid = u?.uid ?? null; $('#auth').hidden = !!u; $('#main').hidden = !u;
    unwatch?.(); unwatch = null;
    if (!u) return;
    Object.assign(S.me, await db.ensureProfile(u));
    unwatch = db.watchBoard(renderBoard);
    db.pruneOldPhotos(u.uid).catch(() => {});
    await afterLogin(); fx.refresh();
  });
}

// ── Ereignisse ──
$('#locate').onclick = locate;
$('#today').onclick = e => {
  const b = e.target.closest('button[data-act]'); if (!b) return;
  const w = S.ws.find(x => x.id === b.dataset.id);
  if (w) (b.dataset.act === 'mosque' ? mosqueFlow : homeFlow)(w);
};
$('#board').onclick = e => { const b = e.target.closest('button[data-uid]'); if (b) openFriend(b.dataset.uid, b.dataset.name); };
$('#fr-close').onclick = () => $('#friend').close();
$('#fr-list').onclick = async e => {
  const b = e.target.closest('button[data-act="photo"]'); if (!b) return;
  const li = b.closest('li'), url = await db.getPhoto(li.dataset.id).catch(() => null);
  b.remove();
  li.insertAdjacentHTML('beforeend', url ? `<img src="${url}" alt="Foto vom Gebetsteppich">` : '<span class="st">Das Foto ist abgelaufen.</span>');
};
$('#set-mosque').onclick = async () => {
  try {
    const p = await getPosition();
    if (p.acc > 40 && !confirm(`Die GPS-Genauigkeit beträgt nur ${Math.round(p.acc)} m. Trotzdem speichern?`)) return;
    const name = prompt('Wie heißt deine Moschee?', S.me.mosque?.name || 'Hauptmoschee') || 'Hauptmoschee';
    await patchMe({ mosque: { lat: p.lat, lon: p.lon, name } });
    renderMe(); armMosqueWatch(); toast('Moschee gespeichert.');
  } catch { toast('Standort nicht verfügbar. Erlaube den Zugriff in den Browser-Einstellungen.'); }
};
$('#logout').onclick = () => db.logout();
$('#login').onsubmit = async e => {
  e.preventDefault();
  const f = new FormData(e.target);
  try { await db.login(f.get('email'), f.get('pw')); $('#auth-msg').textContent = ''; }
  catch { $('#auth-msg').textContent = 'E-Mail oder Passwort stimmen nicht.'; }
};
for (const id of ['school', 'method']) {
  $('#' + id).onchange = async e => { await patchMe({ [id]: e.target.value === '' ? null : +e.target.value }); refreshTimes(); };
}

// Sekundentakt: Countdown unter der Uhr, Liste neu zeichnen, wenn das Gebetsfenster wechselt
let lastCur;
setInterval(() => {
  const now = new Date(), { cur, next } = pickWindows(S.ws, now);
  const left = t => { const m = Math.max(1, Math.round(t / 60000)); return m >= 60 ? `${Math.floor(m / 60)} Std ${m % 60} Min` : `${m} Min`; };
  $('#next').textContent = cur ? `${LABEL[cur.id]} noch bis ${hhmm(cur.end)}` : next ? `${LABEL[next.id]} in ${left(next.start - now)}` : '';
  if ((cur?.id ?? null) !== lastCur) { lastCur = cur?.id ?? null; renderToday(); armMosqueWatch(); }
}, 1000);

// Start: Standort nur automatisch holen, wenn er schon erlaubt ist (kein Überraschungs-Dialog beim Öffnen)
navigator.permissions?.query({ name: 'geolocation' }).then(p => { if (p.state === 'granted') locate(); }).catch(() => {});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
boot();
refreshTimes();                                                         // sofort mit gespeichertem Ort oder Fallback: der Hero lebt gleich
