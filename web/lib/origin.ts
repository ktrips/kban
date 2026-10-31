/**
 * 外向きの URL の origin。App Hosting のコンテナは内部アドレス(0.0.0.0:8080)で動くため、
 * req.url をそのまま使うと GitHub の redirect_uri などが合わなくなる。
 * AUTH_URL(本番は標準URLに固定)を優先し、なければプロキシのヘッダー、最後に req.url。
 */
export function publicOrigin(req: Request): string {
  const fixed = process.env.AUTH_URL;
  if (fixed) return new URL(fixed).origin;
  const host = req.headers.get("x-forwarded-host");
  if (host) return `${req.headers.get("x-forwarded-proto") ?? "https"}://${host}`;
  return new URL(req.url).origin;
}
