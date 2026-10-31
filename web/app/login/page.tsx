import { signIn } from "@/auth";

export const metadata = { title: "kban にログイン" };

export default function Login() {
  return (
    <div className="wrap" style={{ minHeight: "100%", justifyContent: "center", alignItems: "center" }}>
      <div className="section" style={{ maxWidth: 420, width: "100%", gap: 16, padding: 24 }}>
        <div className="logo">k<b>ban</b></div>
        <p style={{ margin: 0 }}>リポジトリごとのバックログから、AI で実装・テスト・デプロイ・確認までを1枚のボードで進めます。</p>
        <form action={async () => { "use server"; await signIn("google", { redirectTo: "/" }); }}>
          <button className="btn primary" type="submit" style={{ width: "100%", justifyContent: "center", padding: "10px 14px" }}>Google でログイン</button>
        </form>
        <p className="note" style={{ margin: 0 }}>ログイン後、GitHub を連携するとリポジトリを選べます。共有されたボードは GitHub の連携なしで見られます。</p>
      </div>
    </div>
  );
}
