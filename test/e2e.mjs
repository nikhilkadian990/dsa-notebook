// End-to-end verification of the deployed app:
//   1. anonymous auth works
//   2. an authenticated user can write their own subtree
//   3. the rules reject an unauthenticated write
//   4. the rules reject a write into another user's subtree
// Prints a short report; exits non-zero if anything critical fails.

const WEB_API_KEY = "AIzaSyDILJk0f6ZBlo8Pr0DW1OtFE34kw2CSSwM";
const PROJECT_ID = "dsa-notebook-e65d2";

const timeout = (ms, p) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timed out")), ms))]);

async function signUp() {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${WEB_API_KEY}`,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ returnSecureToken: true }) },
  );
  if (!res.ok) throw new Error("anonymous signUp failed: " + res.status + " " + (await res.text()).slice(0, 120));
  return res.json();
}

async function dbCall(method, path, token, body) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents${path}`;
  const res = await fetch(url, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return res;
}

function docBody(name) {
  return { fields: { name: { stringValue: name } } };
}

const report = [];
const check = (label, ok, extra) => {
  report.push((ok ? "PASS  " : "FAIL  ") + label + (extra ? " — " + extra : ""));
};

const u = await timeout(15000, signUp());
check("anonymous auth returns a uid", !!u.localId, u.localId.slice(0, 10));

// 2. authenticated write into own subtree
let r = await timeout(15000, dbCall(
  "POST", `/users/${u.localId}/notebooks?documentId=verify-probe`, u.idToken, docBody("probe.md"),
));
check("authenticated user can write their own notebook", r.status === 200 || r.status === 409, r.status);

// 3. read it back
r = await timeout(15000, dbCall("GET", `/users/${u.localId}/notebooks/verify-probe`, u.idToken));
check("authenticated user can read their own notebook", r.status === 200, r.status);

// 4. unauthenticated write is rejected
r = await timeout(15000, dbCall(
  "POST", `/users/${u.localId}/notebooks?documentId=should-fail`, null, docBody("x.md"),
));
check("unauthenticated write is rejected", r.status === 401 || r.status === 403, r.status);

// 5. wrong-subtree write is rejected (a user writing under a different uid)
r = await timeout(15000, dbCall(
  "POST", `/users/someone-else/notebooks?documentId=should-fail`, u.idToken, docBody("x.md"),
));
check("write into another user's subtree is rejected", r.status === 401 || r.status === 403, r.status);

// 6. public index is world-readable
r = await timeout(15000, dbCall("GET", `/public/llms`));
check("public index doc is world-readable", r.status === 200 || r.status === 404, r.status + " (404 = doc absent, rules still fine)");

// cleanup: delete the probe doc
await timeout(15000, dbCall("DELETE", `/users/${u.localId}/notebooks/verify-probe`, u.idToken)).catch(() => {});

console.log(report.join("\n"));
console.log("\n" + (report.every((l) => l.startsWith("PASS")) ? "ALL CHECKS PASSED" : "SOME CHECKS FAILED"));
process.exitCode = report.some((l) => l.startsWith("FAIL")) ? 1 : 0;
