import { NextRequest, NextResponse } from "next/server";

/** Single-owner Basic auth. Leave KENBAN_PASSWORD empty only for local dev. */
export function middleware(req: NextRequest) {
  const pass = process.env.KENBAN_PASSWORD;
  if (!pass) {
    if (process.env.NODE_ENV === "production") return new NextResponse("KENBAN_PASSWORD を設定してください", { status: 500 });
    return NextResponse.next();
  }
  const [scheme, encoded] = (req.headers.get("authorization") || "").split(" ");
  if (scheme === "Basic" && encoded) {
    const [user, pw] = atob(encoded).split(":");
    if (user === (process.env.KENBAN_USER || "ken") && pw === pass) return NextResponse.next();
  }
  return new NextResponse("認証が必要です", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="kenban"' } });
}

export const config = { matcher: ["/((?!manifest.webmanifest|icon.svg).*)"] };
