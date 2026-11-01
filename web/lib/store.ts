import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { Target } from "./stages";
import type { ClaudeLimits } from "./limits";

/**
 * Persistent data, in Firestore (collection "kban", one document per key below, encoded with encodeURIComponent).
 * Values live in field `v` (JSON), id sets in field `m` (array).
 *   user:{uid}            User
 *   user:{uid}:boards     set of board ids the user owns
 *   member:{email}        set of board ids shared with that email
 *   board:{id}            Board
 * On Firebase App Hosting the default credentials are used. In local dev an in-memory map is used (lost on restart)
 * unless FIRESTORE_EMULATOR_HOST or GOOGLE_APPLICATION_CREDENTIALS is set.
 */
export type Role = "editor" | "viewer";
export type RepoSettings = { full: string; name: string; target: Target; about: string };
export type Board = {
  id: string;
  name: string;
  owner: string; // uid
  ownerEmail: string;
  repos: RepoSettings[];
  members: Record<string, Role>; // email → role
  /** 月ごとのトークン予算(目安。Claude の契約の上限そのものではなく、自分で決める枠) */
  budgetTokens?: number;
  /** 週のトークン上限(スプリントの見積もりの分母。Claude の契約の週の枠を自分で入れる。API では取れない) */
  weekTokens?: number;
  createdAt: string;
};
export type User = {
  uid: string; email: string; name: string;
  github?: { login: string; token: string };
  /** iPhone の共有シート/アプリから投稿するための個人トークン(ハッシュだけ保存)と、前回の投稿先 */
  capture?: { hash: string; last?: { board: string; repo: string } };
  /** 手元の Claude Code のステータスラインが送る使用率(lib/limits.ts)と、その送信用トークンのハッシュ */
  limits?: ClaudeLimits;
  limitsHash?: string;
};

type KV = {
  get<T>(k: string): Promise<T | null>;
  set(k: string, v: unknown): Promise<unknown>;
  del(k: string): Promise<unknown>;
  sadd(k: string, m: string): Promise<unknown>;
  srem(k: string, m: string): Promise<unknown>;
  smembers(k: string): Promise<string[]>;
};

function memoryKV(): KV {
  const g = globalThis as unknown as { __kbanMem?: Map<string, unknown> };
  const m = (g.__kbanMem ??= new Map());
  const set = (k: string) => { if (!m.has(k)) m.set(k, new Set<string>()); return m.get(k) as Set<string>; };
  return {
    async get<T>(k: string) { return (m.has(k) ? structuredClone(m.get(k)) : null) as T | null; },
    async set(k, v) { m.set(k, structuredClone(v)); },
    async del(k) { m.delete(k); },
    async sadd(k, v) { set(k).add(v); },
    async srem(k, v) { set(k).delete(v); },
    async smembers(k) { return [...set(k)]; },
  };
}

function firestoreKV(): KV {
  const app = getApps()[0] ?? initializeApp();
  const col = getFirestore(app).collection("kban");
  const ref = (k: string) => col.doc(encodeURIComponent(k));
  return {
    async get<T>(k: string) {
      const d = await ref(k).get();
      return d.exists ? ((JSON.parse(d.get("v")) as T) ?? null) : null;
    },
    async set(k, v) { await ref(k).set({ v: JSON.stringify(v) }); },
    async del(k) { await ref(k).delete(); },
    async sadd(k, m) { await ref(k).set({ m: FieldValue.arrayUnion(m) }, { merge: true }); },
    async srem(k, m) { await ref(k).set({ m: FieldValue.arrayRemove(m) }, { merge: true }); },
    async smembers(k) {
      const d = await ref(k).get();
      return (d.get("m") as string[] | undefined) ?? [];
    },
  };
}

let kv: KV | null = null;
function db(): KV {
  if (kv) return kv;
  const useFirestore = process.env.NODE_ENV === "production" || process.env.FIRESTORE_EMULATOR_HOST || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  kv = useFirestore ? firestoreKV() : memoryKV();
  return kv;
}

/* ---------- token encryption (AES-256-GCM, key from AUTH_SECRET) ---------- */
const key = () => createHash("sha256").update(`kban:${process.env.AUTH_SECRET || "dev-secret"}`).digest();
export function seal(plain: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64url")).join(".");
}
export function open(sealed: string) {
  const [iv, tag, enc] = sealed.split(".").map((s) => Buffer.from(s, "base64url"));
  const d = createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}

/* ---------- users ---------- */
export async function getUser(uid: string) { return db().get<User>(`user:${uid}`); }
export async function saveUser(u: User) { await db().set(`user:${u.uid}`, u); }
export async function ensureUser(uid: string, email: string, name: string) {
  const u = (await getUser(uid)) || { uid, email, name };
  if (u.email !== email || u.name !== name) { u.email = email; u.name = name; }
  await saveUser(u);
  return u;
}
export async function githubToken(uid: string) {
  const u = await getUser(uid);
  if (!u?.github) return null;
  try { return open(u.github.token); } catch { return null; } // AUTH_SECRET を変えると復号できない。連携し直してもらう
}

/* ---------- boards ---------- */
const norm = (e: string) => e.trim().toLowerCase();
export async function getBoard(id: string) { return db().get<Board>(`board:${id}`); }
export async function saveBoard(b: Board) { await db().set(`board:${b.id}`, b); }

export async function createBoard(owner: User, name: string): Promise<Board> {
  const b: Board = { id: randomBytes(6).toString("base64url"), name, owner: owner.uid, ownerEmail: owner.email, repos: [], members: {}, createdAt: new Date().toISOString() };
  await saveBoard(b);
  await db().sadd(`user:${owner.uid}:boards`, b.id);
  return b;
}
export async function deleteBoard(b: Board) {
  for (const email of Object.keys(b.members)) await db().srem(`member:${email}`, b.id);
  await db().srem(`user:${b.owner}:boards`, b.id);
  await db().del(`board:${b.id}`);
}
export async function boardsFor(uid: string, email: string) {
  const [own, shared] = await Promise.all([db().smembers(`user:${uid}:boards`), db().smembers(`member:${norm(email)}`)]);
  const load = async (ids: string[]) => (await Promise.all(ids.map(getBoard))).filter((b): b is Board => !!b);
  return { own: await load(own), shared: (await load(shared)).filter((b) => b.members[norm(email)] && b.owner !== uid) };
}
export async function setMember(b: Board, email: string, role: Role | null) {
  const e = norm(email);
  if (role) { b.members[e] = role; await db().sadd(`member:${e}`, b.id); }
  else { delete b.members[e]; await db().srem(`member:${e}`, b.id); }
  await saveBoard(b);
}

/* ---------- per-card completion token (手元の Claude が作業後に kban へ報告する) ---------- */
type DoneGrant = { uid: string; board: string; repo: string; number: number; exp: number };
const doneKey = (raw: string) => `done:${createHash("sha256").update(raw).digest("hex")}`;
export async function makeDoneToken(g: Omit<DoneGrant, "exp">) {
  const raw = `kbc_${randomBytes(24).toString("base64url")}`;
  await db().set(doneKey(raw), { ...g, exp: Date.now() + 14 * 86_400_000 });
  return raw;
}
export async function readDoneToken(raw: string) {
  const g = await db().get<DoneGrant>(doneKey(raw));
  return g && g.exp > Date.now() ? g : null;
}
export async function dropDoneToken(raw: string) { await db().del(doneKey(raw)); }

/* ---------- iPhone capture token / native login code ---------- */
const sha = (t: string) => createHash("sha256").update(t).digest("hex");
/** Issue a new capture token (the previous one stops working). The raw token is returned once. */
export async function issueCaptureToken(uid: string) {
  const u = await getUser(uid);
  if (!u) throw new Error("ユーザーが見つかりません");
  if (u.capture) await db().del(`capture:${u.capture.hash}`);
  const raw = `kbt_${randomBytes(24).toString("base64url")}`;
  u.capture = { hash: sha(raw), last: u.capture?.last };
  await saveUser(u);
  await db().set(`capture:${u.capture.hash}`, uid);
  return raw;
}
export async function userByCaptureToken(raw: string) {
  const uid = await db().get<string>(`capture:${sha(raw)}`);
  return uid ? getUser(uid) : null;
}
export async function setLastCapture(uid: string, board: string, repo: string) {
  const u = await getUser(uid);
  if (u?.capture) { u.capture.last = { board, repo }; await saveUser(u); }
}
/* ---------- Claude の使用率を送るトークン(ステータスライン用。iPhone のトークンとは別) ---------- */
/** 新しいトークンを作る(前のものは使えなくなる)。生のトークンはこのときだけ返す */
export async function issueLimitsToken(uid: string) {
  const u = await getUser(uid);
  if (!u) throw new Error("ユーザーが見つかりません");
  if (u.limitsHash) await db().del(`limits:${u.limitsHash}`);
  const raw = `kbl_${randomBytes(24).toString("base64url")}`;
  u.limitsHash = sha(raw);
  await saveUser(u);
  await db().set(`limits:${u.limitsHash}`, uid);
  return raw;
}
export async function saveLimitsByToken(raw: string, limits: ClaudeLimits) {
  const uid = await db().get<string>(`limits:${sha(raw)}`);
  const u = uid ? await getUser(uid) : null;
  if (!u) return false;
  u.limits = limits;
  await saveUser(u);
  return true;
}

/** One-time code (2 min) the iOS app trades for a web session cookie. */
export async function makeLoginCode(uid: string) {
  const code = randomBytes(24).toString("base64url");
  await db().set(`logincode:${sha(code)}`, { uid, exp: Date.now() + 120_000 });
  return code;
}
export async function takeLoginCode(code: string) {
  const k = `logincode:${sha(code)}`;
  const v = await db().get<{ uid: string; exp: number }>(k);
  await db().del(k);
  return v && v.exp > Date.now() ? v.uid : null;
}
