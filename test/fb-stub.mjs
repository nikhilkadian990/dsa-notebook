// Test-only ESM loader: stubs the browser-only Firebase SDK imports so the pure
// helpers in ai.js can be exercised under Node. Also stubs the store module's
// Firestore writes so nothing touches a real database.
const STUB = [
  "export default (()=>{});",
  "export const initializeApp=()=>({});",
  "export const initializeFirestore=()=>({});",
  "export const getAuth=()=>({});",
  "export const onAuthStateChanged=()=>{};",
  "export const signInAnonymously=()=>{};",
  "export const updatePassword=()=>{};",
  "export const updateEmail=()=>{};",
  "export const linkWithCredential=()=>{};",
  "export const EmailAuthProvider={credential:()=>({})};",
  "export const persistentLocalCache=()=>({});",
  "export const persistentMultipleTabManager=()=>({});",
  "export const getFirestore=()=>({});",
  "export const collection=()=>({});",
  "export const doc=()=>({});",
  "export const onSnapshot=()=>{};",
  "export const setDoc=()=>{};",
  "export const deleteDoc=()=>{};",
  "export const writeBatch=()=>({});",
  "export const query=()=>({});",
  "export const orderBy=()=>({});",
].join("\n");

export async function load(url, _context, nextLoad) {
  if (url.startsWith("https://www.gstatic.com/firebasejs/"))
    return { format: "module", shortCircuit: true, source: STUB };
  // store.js touches Firestore at import time; stub it wholesale. ai.js only
  // reads the two label maps from it, and state.js re-exports helpers.
  if (/\/public\/js\/store\.js$/.test(url)) {
    return {
      format: "module",
      shortCircuit: true,
      source: [
        "export const STRENGTHS=[\"learning\",\"familiar\",\"strong\",\"mastered\"];",
        "export const STATUSES=[\"unsolved\",\"solved\",\"revised\",\"strong\"];",
        "export const STRENGTH_LABEL={learning:\"Learning\",familiar:\"Getting Familiar\",strong:\"Strong\",mastered:\"Mastered\"};",
        "export const STATUS_LABEL={unsolved:\"Unsolved\",solved:\"Solved\",revised:\"Revised\",strong:\"Strong\"};",
        "export const INTERVAL={learning:1,familiar:3,strong:7,mastered:21};",
        "export function freshNotebook(n=\"Untitled.md\",g=null){return{id:\"x\",name:n,group:g,order:1,tags:[],meta:{url:\"\",source:\"\",difficulty:\"\",status:\"unsolved\",strength:\"learning\",related:[]},mistakes:[],reviews:[],dueAt:0,blocks:[{t:\"text\",v:\"\"}],createdAt:1,updatedAt:1};}",
        "export function normalize(n){return n||{};}",
        "export function start(){}",
        "export function save(){}",
        "export async function saveNow(){}",
        "export async function saveProfile(){}",
        "export async function remove(){}",
        "export async function writeAll(){}",
        "export function recordReview(){}",
        "export const dueNow=()=>true;",
        "export const path=()=>({});",
      ].join("\n"),
    };
  }
  return nextLoad(url);
}
