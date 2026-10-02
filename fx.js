// Motion und Hintergrund-Szenen.
// Vier Videos liegen fest hinter der Seite (.bg). Pro Abschnitt ist eines aktiv. Es kommt unscharf herein und wird
// beim Scrollen scharf. Die Bühne (.hero) ist gepinnt: Das Nacht-Video löst sich aus dem Blur, die Buchstaben J, N, N, H
// driften mit unterschiedlichem Lag nach oben und verblassen, die Textzeilen wechseln.
export function initFx() {
  const api = { refresh() {}, lagRows() {} };                     // Standard: tut nichts (z. B. ohne GSAP)
  const { gsap, ScrollTrigger, ScrollSmoother } = window;
  const vids = [...document.querySelectorAll('.bg video')];
  const root = document.documentElement;
  const BLUR = [30, 16, 16, 14];                                  // Start-Unschärfe je Szene in px (0 = Nacht, 1 = Moschee, 2 = Abend, 3 = Wolken)
  const VEIL = [0.92, 0.8, 0.82, 0.78];                           // Abdunklung je Szene (Nacht: wird beim Scrollen von 0,92 auf 0,5 gesteuert)
  const out = p => 1 - (1 - p) ** 2;                              // schnell scharf, dann sanft
  let cur = -1, reduced = false;

  // Blur in 0,5-px-Schritten: weniger Neuberechnung, bei 0 entfällt der Filter ganz
  const setBlur = (i, px) => {
    const v = vids[i]; if (!v) return;
    const b = Math.round(px * 2) / 2;
    if (v._b !== b) { v._b = b; v.style.filter = b ? `blur(${b}px)` : ''; }
  };
  const setVeil = x => {
    const v = Math.round(x * 50) / 50;
    if (setVeil._v !== v) { setVeil._v = v; root.style.setProperty('--veil', v); }
  };

  // Szene wechseln: ein Video blendet ein, das alte läuft noch aus und pausiert dann (spart Akku), das nächste lädt vor
  function scene(i) {
    if (i === cur || !vids[i]) return;
    const prev = vids[cur]; cur = i;
    vids.forEach((v, k) => v.classList.toggle('on', k === i));
    if (!reduced) {
      vids[i].play()?.catch(() => {});                            // ohne Autoplay bleibt das Poster stehen
      if (prev) setTimeout(() => { if (vids[cur] !== prev) prev.pause(); }, 1600);
    }
    const next = vids[i + 1];
    if (next && next.preload === 'none') { next.preload = 'auto'; next.load(); }
    if (i > 0) setVeil(VEIL[i]);
  }

  // Abschnitte mit data-scene: aktiv ab 60 % Bildhöhe, Blur löst sich zwischen 90 % und 15 % auf
  const sectionScenes = () => document.querySelectorAll('[data-scene]').forEach(sec => {
    const i = +sec.dataset.scene;
    setBlur(i, reduced ? 0 : BLUR[i]);
    ScrollTrigger.create({ trigger: sec, start: 'top 60%', end: 'bottom 60%', onToggle: s => { if (s.isActive) scene(i); } });
    if (!reduced) ScrollTrigger.create({ trigger: sec, start: 'top 90%', end: 'top 15%', onUpdate: s => setBlur(i, BLUR[i] * (1 - out(s.progress))) });
  });

  if (!gsap || !ScrollSmoother) { scene(0); setBlur(0, 0); return api; }   // CDN weg: statische Seite, scharfes Video
  gsap.registerPlugin(ScrollTrigger, ScrollSmoother);
  const mm = gsap.matchMedia();

  mm.add('(prefers-reduced-motion: no-preference)', () => {
    reduced = false;
    root.classList.add('motion');                                 // schaltet Textwechsel und gepinntes Layout im CSS ein
    const smoother = ScrollSmoother.create({
      wrapper: '#smooth-wrapper', content: '#smooth-content',
      smooth: 1.2, smoothTouch: 0.1, effects: true,               // effects: data-speed und data-lag im Markup
    });
    setBlur(0, BLUR[0]); setVeil(VEIL[0]); scene(0);

    const R = { trigger: '.hero', start: 'top top', end: '+=300%' };   // 3 Bildschirmhöhen Scrollweg
    // Reihenfolge ist wichtig: Trigger auf demselben Element, die NACH einem Pin angelegt werden, starten um die
    // Pin-Länge zu spät. Darum zuerst alles ohne Pin, der Pin steckt zuletzt in der Textzeilen-Zeitleiste.
    ScrollTrigger.create({ ...R, onToggle: s => { if (s.isActive) scene(0); } });

    // Buchstaben: jeder driftet etwas anders (Lag 0,3 bis 1,8 s) und wird zum Ghost, damit das Video durchscheint
    ['.Lj', '.Ln1', '.Ln2', '.Lh'].forEach((s, i) => gsap.to(s, {
      yPercent: -4 - i * 3, xPercent: (i % 2 ? 1 : -1) * (2 + i), opacity: 0.2, ease: 'none',
      scrollTrigger: { ...R, scrub: 0.3 + i * 0.5 },
    }));

    sectionScenes();

    gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        ...R, scrub: true, pin: true, anticipatePin: 1,
        onUpdate: s => { setBlur(0, BLUR[0] * (1 - out(Math.min(1, s.progress / 0.85)))); setVeil(VEIL[0] - 0.42 * s.progress); },
      },
    })
      .to('.c1', { autoAlpha: 0, y: -24, duration: 0.07 }, 0.26)
      .fromTo('.c2', { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.08 }, 0.36)
      .to('.c2', { autoAlpha: 0, y: -24, duration: 0.07 }, 0.62)
      .fromTo('.c3', { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.08 }, 0.72)
      .set({}, {}, 1);

    // Ranglisten-Zeilen: jede hinkt etwas mehr hinterher (vier Freunde, vier Lags)
    let effects = [];
    api.lagRows = els => {
      effects.forEach(t => t?.kill?.());
      effects = els.flatMap((el, i) => smoother.effects(el, { speed: 1, lag: 0.12 + i * 0.14 }) || []);
    };
    api.refresh = () => { clearTimeout(api.t); api.t = setTimeout(() => ScrollTrigger.refresh(), 150); };   // Inhalte ändern die Seitenhöhe

    return () => root.classList.remove('motion');
  });

  // Bewegung reduziert: kein Smoother, kein Pin, Videos stehen still (Poster oder erstes Bild), ohne Blur
  mm.add('(prefers-reduced-motion: reduce)', () => {
    reduced = true;
    vids.forEach(v => v.pause());
    setBlur(0, 0); setVeil(0.7); scene(0);
    sectionScenes();
    api.refresh = () => { clearTimeout(api.t); api.t = setTimeout(() => ScrollTrigger.refresh(), 150); };
  });

  return api;
}
