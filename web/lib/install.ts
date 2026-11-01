import { TEMPLATES as T } from "./templates.generated.ts";
import type { Target } from "./stages";

/**
 * scripts/install.sh と同じ内容を、GitHub のリポジトリに入れるファイルの一覧にする。
 * existing: そのパスの今の内容(なければ null)。Fastfile と CLAUDE.md は既存を壊さないために見る。
 */
export async function planInstall(kind: Target, scheme: string, existing: (path: string) => Promise<string | null>) {
  if (kind !== "web" && !/^[\w .-]+$/.test(scheme)) throw new Error("iOS では scheme 名が必要です(例: Komb)");
  const files: Record<string, string> = {};
  const runner = kind === "web" ? "ubuntu-latest" : "macos-15";
  const tools = kind === "web"
    ? "Bash(npm:*),Bash(npx:*),Bash(node:*)"
    : "Bash(npm:*),Bash(npx:*),Bash(xcodebuild:*),Bash(swift:*),Bash(xcrun:*)";

  files[".github/kban/resolve.js"] = T[".github/kban/resolve.js"];
  files[".github/kban/config.json"] = `{\n  "target": "${kind}",\n  "scheme": "${kind === "web" ? "" : scheme}",\n  "simulator": "iPhone 16"\n}\n`;
  files[".github/workflows/kban-flow.yml"] = T[".github/workflows/kban-flow.yml"];
  files[".github/workflows/kban-plan.yml"] = T[".github/workflows/kban-plan.yml"];
  files[".github/workflows/kban-claude.yml"] = T[".github/workflows/kban-claude.yml"].replaceAll("__RUNNER__", () => runner).replaceAll("__TOOLS__", () => tools);
  if (kind === "web") files[".github/workflows/kban-ci.yml"] = T[".github/workflows/kban-ci.web.yml"];
  else if (kind === "ios") files[".github/workflows/kban-ci.yml"] = T[".github/workflows/kban-ci.ios.yml"];
  else {
    files[".github/workflows/kban-ci-web.yml"] = T[".github/workflows/kban-ci.web.yml"];
    files[".github/workflows/kban-ci.yml"] = T[".github/workflows/kban-ci.ios.yml"];
  }
  if (kind !== "web") {
    files[".github/workflows/kban-testflight.yml"] = T[".github/workflows/kban-testflight.yml"];
    if (!(await existing("fastlane/Fastfile"))) files["fastlane/Fastfile"] = T["fastlane/Fastfile"];
  }
  const claudeMd = await existing("CLAUDE.md");
  if (!claudeMd?.includes("## kban のルール")) files["CLAUDE.md"] = `${claudeMd ? `${claudeMd.replace(/\n*$/, "\n")}\n` : ""}${T["CLAUDE.kban.md"]}`;
  return files;
}
