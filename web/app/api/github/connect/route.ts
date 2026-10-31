import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { me } from "@/lib/access";

/** Start the GitHub OAuth flow for the signed-in Google user. */
export async function GET(req: Request) {
  await me();
  const id = process.env.GITHUB_CLIENT_ID;
  if (!id) return NextResponse.json({ error: "GITHUB_CLIENT_ID を設定してください" }, { status: 500 });
  const state = randomBytes(16).toString("base64url");
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", id);
  url.searchParams.set("scope", "repo workflow read:user");
  url.searchParams.set("state", state);
  url.searchParams.set("redirect_uri", new URL("/api/github/callback", req.url).toString());
  const res = NextResponse.redirect(url);
  res.cookies.set("kban_gh_state", state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" });
  return res;
}
