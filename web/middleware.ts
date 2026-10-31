import { NextResponse } from "next/server";
import { auth } from "./auth";

// Signed-out visitors: pages go to /login, API calls get 401.
export default auth((req) => {
  const p = req.nextUrl.pathname;
  if (req.auth?.user || p === "/login" || p.startsWith("/api/auth")) return NextResponse.next();
  if (p.startsWith("/api/")) return NextResponse.json({ error: "ログインしてください" }, { status: 401 });
  return NextResponse.redirect(new URL("/login", req.nextUrl));
});

export const config = { matcher: ["/((?!_next/|manifest.webmanifest|icon.svg).*)"] };
