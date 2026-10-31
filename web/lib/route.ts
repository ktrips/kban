import { NextResponse } from "next/server";
import { HttpError } from "./access";

export type Ctx<P extends Record<string, string> = Record<string, string>> = { params: Promise<P> };

export async function handle(fn: () => Promise<unknown>) {
  try {
    return NextResponse.json((await fn()) ?? { ok: true });
  } catch (e) {
    const err = e as Error & { status?: number };
    const gh = err.status === 401 && !(e instanceof HttpError); // GitHub said the token is bad
    const status = gh ? 409 : err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
    const message = gh ? "GitHub の連携が切れています。GitHub を連携し直してください" : err.message;
    return NextResponse.json({ error: message }, { status });
  }
}
