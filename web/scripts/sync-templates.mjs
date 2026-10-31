// ../templates をコードに埋め込む(Firebase の build が web/ だけでも、kban がリポジトリにワークフローを入れられるように)。
// 結果の lib/templates.generated.ts はコミットする。lib/templates.test.ts が最新かを確認する。
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "templates");
if (!existsSync(root)) process.exit(0); // web/ だけの環境ではコミット済みのものを使う

const FILES = [
  ".github/kban/resolve.js",
  ".github/workflows/kban-ci.ios.yml",
  ".github/workflows/kban-ci.web.yml",
  ".github/workflows/kban-claude.yml",
  ".github/workflows/kban-flow.yml",
  ".github/workflows/kban-testflight.yml",
  "CLAUDE.kban.md",
  "fastlane/Fastfile",
];
const out = Object.fromEntries(FILES.map((f) => [f, readFileSync(join(root, f), "utf8")]));
writeFileSync(
  join(here, "..", "lib", "templates.generated.ts"),
  `// 自動生成: npm run sync-templates(../templates から)。手で編集しない。\nexport const TEMPLATES: Record<string, string> = ${JSON.stringify(out, null, 2)};\n`,
);
