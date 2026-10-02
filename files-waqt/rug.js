// Teppich-Check im Browser: TensorFlow.js + MobileNet (ImageNet kennt die Klasse „prayer rug“).
// Wird erst beim ersten Foto nachgeladen, belastet den Start also nicht.
const TFJS = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4/dist/tf.min.js';
const MOBILENET = 'https://cdn.jsdelivr.net/npm/@tensorflow-models/mobilenet@2/dist/mobilenet.min.js';
export const THRESH = { ok: 0.20, maybe: 0.08 };     // mit euren echten Teppichen kalibrieren (?debug zeigt die Top 5)

const script = src => new Promise((res, rej) => {
  const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.append(s);
});
let model;

/** Foto → kleines Canvas (max. 640 px). Beim Neuzeichnen gehen EXIF-Daten inkl. Fotostandort verloren. */
export async function fileToCanvas(file, max = 640) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  return c;
}

/**
 * @returns {Promise<{verdict: 'ok'|'maybe'|'no'|'unavailable', score: number, top: string[]}>}
 * „unavailable“ (Modell nicht ladbar, offline) → Fallback: soziale Kontrolle, das Foto bleibt für die Freunde sichtbar.
 */
export async function checkRug(canvas) {
  try {
    if (!model) {
      await script(TFJS); await script(MOBILENET);
      model = await window.mobilenet.load({ version: 2, alpha: 1.0 });
    }
    const top = await model.classify(canvas, 5);
    const rug = top.find(t => /prayer rug/i.test(t.className))?.probability ?? 0;
    const soft = top.find(t => /doormat|quilt|bath towel|velvet/i.test(t.className))?.probability ?? 0;
    const verdict = rug >= THRESH.ok ? 'ok' : (rug >= THRESH.maybe || soft >= 0.25) ? 'maybe' : 'no';
    if (location.search.includes('debug')) console.table(top);
    return { verdict, score: +rug.toFixed(3), top: top.map(t => `${t.className.split(',')[0]} ${Math.round(t.probability * 100)}%`) };
  } catch (e) {
    return { verdict: 'unavailable', score: 0, top: [], error: String(e) };
  }
}
