import { NextResponse } from "next/server";
import { auth } from "./auth";

// Signed-out visitors: pages go to /login, API calls get 401.
export default auth((req) => {
  const p = req.nextUrl.pathname;
  // 別名のドメイン(kban.ktrips.net など)は正規のホストへ寄せる。GitHub OAuth App のコールバックが1つしか登録できないため
  const canonical = process.env.KBAN_CANONICAL_HOST;
  const host = req.headers.get("x-forwarded-host") ?? req.nextUrl.host;
  if (canonical && host !== canonical && !host.startsWith("localhost")) {
    const to = new URL(req.nextUrl);
    to.protocol = "https";
    to.host = canonical;
    to.port = "";
    return NextResponse.redirect(to, 308);
  }
  if (req.auth?.user || p === "/login" || p.startsWith("/api/auth") || p === "/api/native/exchange" || (p === "/api/capture" && req.headers.get("authorization")?.startsWith("Bearer kbt_")) || (p === "/api/done" && req.headers.get("authorization")?.startsWith("Bearer kbc_"))) return NextResponse.next();
  if (p === "/api/native/start") return NextResponse.redirect(new URL("/login?next=/api/native/start", req.nextUrl));
  if (p.startsWith("/api/")) return NextResponse.json({ error: "ログインしてください" }, { status: 401 });
  return NextResponse.redirect(new URL("/login", req.nextUrl));
});

export const config = { matcher: ["/((?!_next/|manifest.webmanifest|icon.svg).*)"] };
