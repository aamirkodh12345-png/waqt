// Handy-still-Erkennung (Gebetsbeginn/-ende) + Bildschirm wach halten

/** iPhone: Freigabe nur direkt aus einem Tipp heraus. Android/Chrome: keine Freigabe nötig. */
export async function askMotionPermission() {
  const D = window.DeviceMotionEvent;
  if (!D) return false;
  if (typeof D.requestPermission === 'function') {
    try { return (await D.requestPermission()) === 'granted'; } catch { return false; }
  }
  return true;
}

/**
 * Zustände: waiting → still → moved
 *  - still:  Schwankung (Standardabweichung über ~1 s) bleibt stillMs lang unter calmSd
 *            → onStill(Date) mit dem Moment, in dem es ruhig wurde = Gebetsbeginn
 *  - moved:  Lage weicht > moveDev von der Ruhelage ab oder Schwankung > moveSd, moveHoldMs am Stück
 *            → onMove(Date) mit dem Moment, in dem die Bewegung begann = Gebetsende
 * Die Schwellen (m/s²) sind Startwerte: mit ?debug und ein paar Testläufen pro Handy nachjustieren.
 */
export class StillnessWatcher {
  constructor(o = {}) {
    Object.assign(this, { stillMs: 20000, calmSd: 0.05, moveDev: 0.6, moveSd: 0.25, moveHoldMs: 1500 }, o);
    this._h = e => this._on(e);
  }

  start() {
    this.state = 'waiting'; this.buf = [];
    this.calmSince = this.moveSince = this.rest = null; this.got = false;
    window.addEventListener('devicemotion', this._h);
    clearTimeout(this._nd);
    this._nd = setTimeout(() => { if (!this.got) this.onNoData?.(); }, 3000);   // Desktop/kein Sensor
  }

  stop() {
    window.removeEventListener('devicemotion', this._h);
    clearTimeout(this._nd);
  }

  _on(e) {
    const a = e.accelerationIncludingGravity;
    if (!a || a.x == null) return;
    this.got = true;
    this.buf.push([a.x, a.y, a.z]);
    if (this.buf.length > 45) this.buf.shift();                  // ≈ 0,75 s bei 60 Hz
    if (this.buf.length < 45) return;

    const n = this.buf.length, now = Date.now();
    const mean = [0, 1, 2].map(i => this.buf.reduce((s, v) => s + v[i], 0) / n);
    const sd = Math.sqrt([0, 1, 2].reduce((s, i) => s + this.buf.reduce((q, v) => q + (v[i] - mean[i]) ** 2, 0) / n, 0));
    this.onSample?.(sd);

    if (this.state === 'waiting') {
      if (sd >= this.calmSd) { this.calmSince = null; return; }
      this.calmSince ??= now;
      if (now - this.calmSince >= this.stillMs) {
        this.state = 'still'; this.rest = mean;
        this.onStill?.(new Date(this.calmSince));
      }
    } else if (this.state === 'still') {
      const dev = Math.hypot(mean[0] - this.rest[0], mean[1] - this.rest[1], mean[2] - this.rest[2]);
      if (dev < this.moveDev && sd < this.moveSd) { this.moveSince = null; return; }   // kurzer Stups zählt nicht
      this.moveSince ??= now;
      if (now - this.moveSince >= this.moveHoldMs) {
        this.state = 'moved'; this.stop();
        this.onMove?.(new Date(this.moveSince));
      }
    }
  }
}

/** Bildschirm anlassen (sonst friert die Seite ein und der Sensor schweigt). Rückgabe: Funktion zum Freigeben. */
export function keepAwake() {
  if (!('wakeLock' in navigator)) return () => {};
  let lock = null, on = true;
  const grab = async () => { try { lock = await navigator.wakeLock.request('screen'); } catch { /* Akku-Sparmodus o. ä. */ } };
  const vis = () => { if (on && document.visibilityState === 'visible') grab(); };   // Sperre fällt beim Verstecken weg
  document.addEventListener('visibilitychange', vis);
  grab();
  return () => { on = false; document.removeEventListener('visibilitychange', vis); lock?.release().catch(() => {}); };
}
