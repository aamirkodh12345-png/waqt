// Firebase: Auth (E-Mail/Passwort) + Firestore.
// Fotos liegen als kleine JPEGs in Firestore: Cloud Storage for Firebase verlangt inzwischen den Blaze-Tarif
// (Zahlungsmittel hinterlegt), Firestore bleibt im kostenlosen Spark-Tarif.
export const firebaseConfig = {           // ← aus Firebase-Konsole → Projekteinstellungen → Web-App kopieren
  apiKey: 'DEIN_API_KEY',
  authDomain: 'DEIN_PROJEKT.firebaseapp.com',
  projectId: 'DEIN_PROJEKT',
  appId: 'DEINE_APP_ID',
};
export const DEMO = firebaseConfig.apiKey.startsWith('DEIN');   // solange nichts eingetragen ist: lokaler Demo-Modus

let X = null;                              // { A: Auth-SDK, F: Firestore-SDK, auth, db }

/** Verbindet Firebase. false = Demo-Modus oder nicht erreichbar (die App läuft dann lokal weiter). */
export async function connect() {
  if (DEMO) return false;
  try {
    const [{ initializeApp }, A, F] = await Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore')]);
    const app = initializeApp(firebaseConfig);
    const db = F.initializeFirestore(app, {
      ignoreUndefinedProperties: true,
      localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }),   // Offline-Cache
    });
    X = { A, F, db, auth: A.getAuth(app) };
    return true;
  } catch (e) {
    console.warn('Firebase nicht erreichbar, lokaler Modus', e);
    return false;
  }
}

export const onUser = cb => X.A.onAuthStateChanged(X.auth, cb);
export const login = (email, pw) => X.A.signInWithEmailAndPassword(X.auth, email, pw);
export const logout = () => X.A.signOut(X.auth);

const ref = (...path) => X.F.doc(X.db, ...path);

// ── Profil: öffentlich für die 4 Freunde (users/{uid}) und privat (users/{uid}/private/prefs) ──
const PUBLIC = ['name', 'totalPoints', 'streak'];

export async function ensureProfile(user) {
  const [pub, prv] = await Promise.all([X.F.getDoc(ref('users', user.uid)), X.F.getDoc(ref('users', user.uid, 'private', 'prefs'))]);
  const prefs = prv.exists() ? prv.data() : {};                 // mosque, method, school: nur du siehst das
  if (pub.exists()) return { ...pub.data(), ...prefs };
  const p = { name: user.displayName || user.email.split('@')[0], totalPoints: 0, streak: 0 };
  await X.F.setDoc(ref('users', user.uid), { ...p, createdAt: X.F.serverTimestamp() });
  return { ...p, ...prefs };
}

export async function saveProfile(uid, patch) {
  const pub = {}, prv = {};
  for (const k in patch) (PUBLIC.includes(k) ? pub : prv)[k] = patch[k];
  if (Object.keys(pub).length) await X.F.updateDoc(ref('users', uid), pub);
  if (Object.keys(prv).length) await X.F.setDoc(ref('users', uid, 'private', 'prefs'), prv, { merge: true });
}

/** Rangliste live: sortiert nach Punkten */
export const watchBoard = cb => X.F.onSnapshot(
  X.F.query(X.F.collection(X.db, 'users'), X.F.orderBy('totalPoints', 'desc')),
  snap => cb(snap.docs.map(d => ({ uid: d.id, ...d.data() }))));

// ── Gebete ──
/** Eintrag + (Foto) + Punkte in EINEM Batch. Die feste ID erlaubt pro Gebet und Tag nur einen Eintrag. */
export async function savePrayer(uid, r, photoDataUrl) {
  const { F, db } = X, id = `${uid}_${r.day}_${r.prayer}`, b = F.writeBatch(db);
  const T = d => F.Timestamp.fromDate(d);
  b.set(ref('prayers', id), { ...r, uid, at: T(r.at), start: T(r.start), end: T(r.end), hasPhoto: !!photoDataUrl, createdAt: F.serverTimestamp() });
  if (photoDataUrl) b.set(ref('photos', id), { uid, dataUrl: photoDataUrl, createdAt: F.serverTimestamp() });
  b.update(ref('users', uid), { totalPoints: F.increment(r.points) });
  await b.commit();
}

/** Gebete eines Nutzers ab einem Tag (YYYY-MM-DD). Bereichsabfrage über die Dokument-ID → kein Extra-Index nötig. */
export async function recentPrayers(uid, fromDay) {
  const { F, db } = X;
  const snap = await F.getDocs(F.query(F.collection(db, 'prayers'),
    F.where(F.documentId(), '>=', `${uid}_${fromDay}`), F.where(F.documentId(), '<', `${uid}_~`)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ── Fotos (soziale Kontrolle) ──
export async function getPhoto(id) {
  const s = await X.F.getDoc(ref('photos', id));
  return s.exists() ? s.data().dataUrl : null;
}

/** Eigene Fotos nach `days` Tagen löschen (Datensparsamkeit, hält Firestore klein) */
export async function pruneOldPhotos(uid, days = 30) {
  const { F, db } = X, cut = new Date(Date.now() - days * 864e5).toLocaleDateString('sv-SE');
  const snap = await F.getDocs(F.query(F.collection(db, 'photos'),
    F.where(F.documentId(), '>=', `${uid}_`), F.where(F.documentId(), '<', `${uid}_${cut}`)));
  await Promise.all(snap.docs.map(d => F.deleteDoc(d.ref)));
}
