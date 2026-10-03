// Firebase bootstrap: anonymous auth (no visible login wall) + offline-first
// Firestore. Everything the app stores lives under users/{uid}/ so the security
// rules can keep each anonymous account private.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  getFirestore,
  collection,
  doc,
  onSnapshot,
  setDoc,
  deleteDoc,
  writeBatch,
  query,
  orderBy,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  updatePassword,
  updateEmail,
  linkWithCredential,
  EmailAuthProvider,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

export const firebaseConfig = {
  apiKey: "AIzaSyDILJk0f6ZBlo8Pr0DW1OtFE34kw2CSSwM",
  authDomain: "dsa-notebook-e65d2.firebaseapp.com",
  projectId: "dsa-notebook-e65d2",
  storageBucket: "dsa-notebook-e65d2.firebasestorage.app",
  messagingSenderId: "68360283864",
  appId: "1:68360283864:web:160de3702aa3bacd0b59ad",
  measurementId: "G-BLWMY8ECFD",
};

export const app = initializeApp(firebaseConfig);

// Offline-first: every read/write is served from the local IndexedDB cache and
// pushed to the server when connectivity returns.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

export const auth = getAuth(app);
export { collection, doc, onSnapshot, setDoc, deleteDoc, writeBatch, query, orderBy };

let ready;
export const authReady = new Promise((res) => (ready = res));

let firstSignIn = true;
onAuthStateChanged(auth, async (u) => {
  if (u) {
    // Ensure the user document exists so the subtree is never empty.
    try {
      await setDoc(doc(db, "users", u.uid), { at: Date.now() }, { merge: true });
    } catch (e) {
      /* offline queue will retry */
    }
    ready(u);
  } else if (firstSignIn) {
    firstSignIn = false;
    try {
      await signInAnonymously(auth);
    } catch (e) {
      console.error("anonymous sign-in failed", e);
      ready(null);
    }
  } else {
    ready(null);
  }
});

/** Upgrade the throwaway anonymous account to a real email/password login so the
 *  notebook survives clearing browser data and works on other devices. */
export async function linkEmail(email, password) {
  const cred = EmailAuthProvider.credential(email, password);
  const res = await linkWithCredential(auth.currentUser, cred);
  return res.user;
}
export { updateEmail, updatePassword };
