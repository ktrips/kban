import { NextResponse } from "next/server";
import { me } from "@/lib/access";
import { issueCaptureToken, makeLoginCode } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * iOS アプリのログイン。アプリは ASWebAuthenticationSession でここを開く(Google のログインは WebView では拒否されるため)。
 * ログイン済みなら、1回きりのコードと共有シート用トークンを kban:// で返す。
 */
export const GET = async () => {
  const u = await me();
  const code = await makeLoginCode(u.uid);
  const token = await issueCaptureToken(u.uid);
  return NextResponse.redirect(`kban://done?code=${encodeURIComponent(code)}&token=${encodeURIComponent(token)}`);
};
