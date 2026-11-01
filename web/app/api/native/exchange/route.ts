import { NextResponse } from "next/server";
import { encode } from "next-auth/jwt";
import { publicOrigin } from "@/lib/origin";
import { getUser, takeLoginCode } from "@/lib/store";

export const dynamic = "force-dynamic";

/** アプリの WebView が、1回きりのコードを Web のセッション Cookie に交換する。 */
export const GET = async (req: Request) => {
  const url = new URL(req.url);
  const origin = new URL(publicOrigin(req)); // コンテナ内の req.url は 0.0.0.0:8080 なので外向きの URL を使う
  const uid = await takeLoginCode(url.searchParams.get("code") || "");
  const user = uid ? await getUser(uid) : null;
  if (!user) return NextResponse.redirect(new URL("/login", origin));
  const secure = origin.protocol === "https:";
  const name = `${secure ? "__Secure-" : ""}authjs.session-token`;
  const maxAge = 60 * 60 * 24 * 30;
  const jwt = await encode({ token: { uid: user.uid, email: user.email, name: user.name, sub: user.uid }, secret: process.env.AUTH_SECRET!, salt: name, maxAge });
  const res = NextResponse.redirect(new URL("/", origin));
  res.cookies.set(name, jwt, { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge });
  return res;
};
