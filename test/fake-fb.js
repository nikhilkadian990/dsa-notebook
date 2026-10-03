// In-memory stand-in for public/js/fb.js used by the DOM smoke test. It never
// touches the network: auth resolves immediately and onSnapshot fires every
// listener with an empty snapshot so app boot completes deterministically.

export const firebaseConfig = { projectId: "test-project" };
export const app = {};
export const db = {};

export const auth = {
  currentUser: { uid: "test-user", isAnonymous: true },
};

export const authReady = Promise.resolve(auth.currentUser);

export function collection() { return {}; }
export function doc() { return {}; }
export function query() { return {}; }
export function orderBy() { return {}; }
export function writeBatch() { return { set() {}, commit() {} }; }
export async function setDoc() {}
export async function deleteDoc() {}
export async function linkEmail() { return { user: auth.currentUser }; }
export async function updateEmail() {}
export async function updatePassword() {}

/** Dispatches both the 2-arg and 4-arg onSnapshot forms with an empty snapshot. */
export function onSnapshot(ref, opts, cb, errCb) {
  const fn = typeof opts === "function" ? opts : cb;
  const snapshot = {
    docs: [],
    exists: false,
    data: () => ({}),
    metadata: { fromCache: false, hasPendingWrites: false },
  };
  Promise.resolve().then(() => fn(snapshot));
  void errCb;
  return () => {};
}
