// Firebase setup shared by every page.
// To upgrade the SDK, change FIREBASE_VERSION (see https://firebase.google.com/support/release-notes/js).
import { firebaseConfig } from "./firebase-config.js";

const FIREBASE_VERSION = "13.3.0";
const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;

export const isConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

let authApi = null; // lazily loaded so the landing page renders even without Firebase

async function load() {
  if (authApi) return authApi;
  if (!isConfigured) throw new Error("not-configured");
  const [{ initializeApp }, authMod] = await Promise.all([
    import(`${base}/firebase-app.js`),
    import(`${base}/firebase-auth.js`),
  ]);
  const app = initializeApp(firebaseConfig);
  const auth = authMod.getAuth(app);
  authApi = { app, auth, ...authMod };
  return authApi;
}

export async function signIn() {
  const { auth, GoogleAuthProvider, signInWithPopup } = await load();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return signInWithPopup(auth, provider);
}

export async function signOutUser() {
  const { auth, signOut } = await load();
  return signOut(auth);
}

export async function onUser(callback) {
  if (!isConfigured) { callback(null); return () => {}; }
  const { auth, onAuthStateChanged } = await load();
  return onAuthStateChanged(auth, callback);
}

// Firestore keeps a copy of your data on this device (IndexedDB), so the app opens instantly
// and then syncs in the background.
let dbApi = null;
export function getDb() {
  dbApi ||= (async () => {
    const { app } = await load();
    const fs = await import(`${base}/firebase-firestore.js`);
    let db;
    try {
      db = fs.initializeFirestore(app, { localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) });
    } catch (e) {
      console.warn("Offline cache unavailable", e);
      db = fs.getFirestore(app);
    }
    return { db, ...fs };
  })();
  dbApi.catch(() => { dbApi = null; });
  return dbApi;
}

// On sign-out: remove the device copy of your data.
export async function clearLocalData() {
  if (!dbApi) return;
  try {
    const { db, terminate, clearIndexedDbPersistence } = await dbApi;
    await terminate(db);
    await clearIndexedDbPersistence(db);
  } catch (e) {
    console.warn("Couldn't clear the offline cache", e);
  }
  dbApi = null;
}
