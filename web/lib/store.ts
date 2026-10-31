import { Redis } from "@upstash/redis";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { Target } from "./stages";

/**
 * Persistent data, in Upstash Redis (Vercel → Storage → Upstash for Redis).
 *   user:{uid}            User
 *   user:{uid}:boards     set of board ids the user owns
 *   member:{email}        set of board ids shared with that email
 *   board:{id}            Board
 * Without UPSTASH_REDIS_REST_URL (local dev) an in-memory map is used and is lost on restart.
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
  createdAt: string;
};
export type User = { uid: string; email: string; name: string; github?: { login: string; token: string } };

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

let kv: KV | null = null;
function db(): KV {
  if (kv) return kv;
  if (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL) {
    const r = new Redis({
      url: (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL)!,
      token: (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN)!,
    });
    kv = {
      get: (k) => r.get(k),
      set: (k, v) => r.set(k, v),
      del: (k) => r.del(k),
      sadd: (k, m) => r.sadd(k, m),
      srem: (k, m) => r.srem(k, m),
      smembers: (k) => r.smembers(k),
    };
  } else {
    if (process.env.NODE_ENV === "production") throw new Error("UPSTASH_REDIS_REST_URL / TOKEN を設定してください");
    kv = memoryKV();
  }
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
  return u?.github ? open(u.github.token) : null;
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
