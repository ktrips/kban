import { NextRequest, NextResponse } from "next/server";
import { me } from "@/lib/access";
import { publicOrigin } from "@/lib/origin";
import { saveUser, seal } from "@/lib/store";
import { githubLogin } from "@/lib/github";

/** GitHub sends the user back here; store the token sealed on the Google user. */
export async function GET(req: NextRequest) {
  const back = (q: string) => NextResponse.redirect(new URL(`/?github=${q}`, publicOrigin(req)));
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!code || !state || state !== req.cookies.get("kban_gh_state")?.value) return back("error");
  const r = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ client_id: process.env.GITHUB_CLIENT_ID, client_secret: process.env.GITHUB_CLIENT_SECRET, code }),
  });
  const j = (await r.json().catch(() => ({}))) as { access_token?: string };
  if (!j.access_token) return back("error");
  const u = await me();
  u.github = { login: await githubLogin(j.access_token), token: seal(j.access_token) };
  await saveUser(u);
  const res = back("linked");
  res.cookies.delete("kban_gh_state");
  return res;
}
