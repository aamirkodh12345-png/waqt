// 24-h-Zifferblatt: 12 Uhr oben, Mitternacht unten. Keine Zahlen: Die fünf Gebete sitzen an ihrer echten Beginn-Uhrzeit.
import { AR } from './prayer-times.js';

const NS = 'http://www.w3.org/2000/svg', C = 200, R = 176;
const el = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  parent?.append(e);
  return e;
};
const deg = d => ((d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600 + 12) % 24) * 15;   // 12:00 → 0° (oben)
const pt = (a, r) => { const t = (a - 90) * Math.PI / 180; return [+(C + r * Math.cos(t)).toFixed(2), +(C + r * Math.sin(t)).toFixed(2)]; };
const arc = (a, b, r) => {
  const [x1, y1] = pt(a, r), [x2, y2] = pt(b, r);
  return `M${x1} ${y1}A${r} ${r} 0 ${(b - a + 360) % 360 > 180 ? 1 : 0} 1 ${x2} ${y2}`;
};
const rot = (e, a) => e.setAttribute('transform', `rotate(${a.toFixed(2)} ${C} ${C})`);
const short = id => AR[id].replace(/^ال/, '');    // auf dem Zifferblatt ohne Artikel: kürzer, ruhiger

/** Baut die Uhr in ein <svg>. Rückgabe: { setTimes(windows) } */
export function mountClock(svg) {
  svg.setAttribute('viewBox', '0 0 400 400');
  const rim = el('g', {}, svg), arcs = el('g', {}, svg), names = el('g', {}, svg), hands = el('g', {}, svg);

  // Rand und 24 feine Stundenstriche (die vier Viertel etwas länger)
  el('circle', { cx: C, cy: C, r: R + 12, class: 'rim' }, rim);
  for (let h = 0; h < 24; h++) {
    const [x1, y1] = pt(h * 15, R + 12), [x2, y2] = pt(h * 15, R + (h % 6 ? 6 : 0));
    el('line', { x1, y1, x2, y2, class: h % 6 ? 'tick' : 'tick big' }, rim);
  }

  // Zeiger: Stunde (eine Umdrehung pro Tag), Minute, dünne Sekunde
  const hh = el('line', { x1: C, y1: C + 14, x2: C, y2: C - 92, class: 'h' }, hands);
  const mh = el('line', { x1: C, y1: C + 18, x2: C, y2: C - 138, class: 'm' }, hands);
  const sh = el('line', { x1: C, y1: C + 26, x2: C, y2: C - 160, class: 's' }, hands);
  el('circle', { cx: C, cy: C, r: 4.5, class: 'cap' }, hands);

  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;   // dann tickt die Sekunde, statt zu gleiten
  let W = [], cur, raf = 0, visible = true, drawn = false;

  function setTimes(ws) {
    W = ws; cur = undefined;
    arcs.replaceChildren(); names.replaceChildren();
    const it = ws.map(w => ({ id: w.id, a: deg(w.start), b: deg(w.end) })).sort((x, y) => x.a - y.a);
    it.forEach((w, i) => {
      el('path', { d: arc(w.a, w.b, R - 4), pathLength: 1, class: 'win', 'data-id': w.id }, arcs);
      const close = i > 0 && w.a - it[i - 1].a < 28;                     // enge Nachbarn: innerer Ring
      const [x, y] = pt(w.a, close ? R - 60 : R - 30);
      const t = el('text', { x, y, class: 'nm', 'data-id': w.id, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, names);
      t.textContent = short(w.id);
    });
    if (!drawn && ws.length) {                                            // Auftritt: Bögen zeichnen sich nacheinander
      drawn = true;
      window.gsap?.from(arcs.children, { strokeDashoffset: 1, duration: 1.6, stagger: 0.15, ease: 'power2.out', clearProps: 'strokeDashoffset' });
    }
  }

  function frame() {
    const t = new Date(), s = t.getSeconds() + (calm ? 0 : t.getMilliseconds() / 1000);
    rot(hh, deg(t)); rot(mh, t.getMinutes() * 6 + s / 10); rot(sh, s * 6);
    const now = W.find(w => t >= w.start && t < w.end)?.id ?? null;      // laufendes Fenster leuchtet
    if (now !== cur) {
      cur = now;
      svg.querySelectorAll('[data-id]').forEach(n => n.classList.toggle('on', n.dataset.id === now));
    }
    raf = visible && !document.hidden
      ? (calm ? setTimeout(frame, 1000 - Date.now() % 1000) : requestAnimationFrame(frame))
      : 0;                                                                // außerhalb des Bildschirms: Schleife ruht
  }

  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !raf) frame(); }).observe(svg);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && visible && !raf) frame(); });
  frame();
  return { setTimes };
}
