// Motion: ScrollSmoother + gepinnte Bühne.
// Das Handy wandert (x, y, scale). Sein Winkel liegt fest im CSS (.tilt) und wird NIE animiert.
export function initFx() {
  const api = { refresh() {}, lagRows() {} };                    // Standard: tut nichts (z. B. bei reduzierter Bewegung)
  const { gsap, ScrollTrigger, ScrollSmoother } = window;
  if (!gsap || !ScrollSmoother) return api;                      // CDN nicht erreichbar → Seite bleibt statisch nutzbar
  gsap.registerPlugin(ScrollTrigger, ScrollSmoother);

  gsap.matchMedia().add('(prefers-reduced-motion: no-preference)', () => {
    document.documentElement.classList.add('motion');            // schaltet das absolute Bühnen-Layout im CSS ein

    const smoother = ScrollSmoother.create({
      wrapper: '#smooth-wrapper', content: '#smooth-content',
      smooth: 1.2, smoothTouch: 0.1, effects: true,              // effects: data-speed / data-lag im Markup
    });

    const range = { trigger: '.stage', start: 'top top', end: '+=520%' };   // ≈ 5 Bildschirmhöhen Scrollweg
    const dx = () => {                                                      // Wanderweg: nie so weit, dass das schräge Handy aus dem Bild ragt
      const p = document.querySelector('.phone');
      const a = Math.abs(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tilt'))) * Math.PI / 180;
      const half = (p.offsetWidth * Math.cos(a) + p.offsetHeight * Math.sin(a)) / 2;   // halbe Breite inkl. Schräglage
      return Math.max(0, Math.min(innerWidth * 0.28, 340, innerWidth / 2 - half - 6));
    };

    // Reihenfolge ist wichtig: Trigger auf demselben Element, die NACH einem Pin angelegt werden, starten um die Pin-Länge
    // zu spät (Handy und Texte rührten sich dann nicht). Darum: Halo zuerst, Pin steckt in der Handy-Zeitleiste.
    // Lag: die Hintergrundringe folgen dem Scroll mit sichtbarer Verzögerung (scrub 1.8 s statt direkt)
    gsap.to('.halo', { xPercent: -16, yPercent: 10, scale: 1.3, ease: 'none', scrollTrigger: { ...range, scrub: 1.8 } });

    // Drehbuch: 7 Zeiteinheiten = 520 % Scrollweg
    //  0–1 Auftritt · 1–3 rechts (Text links) · 3–5 links (Text rechts) · 5–7 Mitte, größer (Text unten)
    // scrub: true genügt, ScrollSmoother glättet bereits
    gsap.timeline({ defaults: { ease: 'power1.inOut' }, scrollTrigger: { ...range, scrub: true, pin: true, anticipatePin: 1, invalidateOnRefresh: true } })
      .fromTo('.phone', { y: 120, scale: 0.8 }, { y: 0, scale: 1, duration: 1, ease: 'power2.out' }, 0)
      .to('.brand', { autoAlpha: 0, duration: 0.6, ease: 'none' }, 0.4)
      .to('.phone', { x: dx, y: -24, duration: 1 }, 1)
      .fromTo('.c1', { autoAlpha: 0, y: 30 }, { autoAlpha: 1, y: 0, duration: 0.6 }, 1.5)
      .to('.c1', { autoAlpha: 0, y: -30, duration: 0.5 }, 2.6)
      .to('.phone', { x: () => -dx(), y: 24, duration: 1 }, 3)
      .fromTo('.c2', { autoAlpha: 0, y: 30 }, { autoAlpha: 1, y: 0, duration: 0.6 }, 3.5)
      .to('.c2', { autoAlpha: 0, y: -30, duration: 0.5 }, 4.6)
      .to('.phone', { x: 0, y: 0, scale: 1.1, duration: 1 }, 5)
      .fromTo('.c3', { autoAlpha: 0, y: 30 }, { autoAlpha: 1, y: 0, duration: 0.6 }, 5.5)
      .set({}, {}, 7);                                                       // Ende: Halten bis 7

    // Ranglisten-Zeilen: jede hinkt etwas mehr hinterher (vier Freunde, vier Lags)
    let effects = [];
    api.lagRows = els => {
      effects.forEach(t => t?.kill?.());
      effects = els.flatMap((el, i) => smoother.effects(el, { speed: 1, lag: 0.12 + i * 0.14 }) || []);
    };
    // Inhalte ändern die Seitenhöhe → Trigger neu messen (gebündelt)
    api.refresh = () => { clearTimeout(api.t); api.t = setTimeout(() => ScrollTrigger.refresh(), 150); };

    return () => document.documentElement.classList.remove('motion');
  });

  return api;
}
