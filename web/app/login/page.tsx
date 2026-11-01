import { signIn } from "@/auth";

export const metadata = { title: "kban にログイン" };

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const to = next && /^\/(?!\/)/.test(next) ? next : "/"; // 同じサイト内のパスだけ
  return (
    <div className="wrap" style={{ minHeight: "100%", justifyContent: "center", alignItems: "center" }}>
      <div className="section" style={{ maxWidth: 420, width: "100%", gap: 16, padding: 24 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}><div className="logo"><b>K</b>ban</div><span className="tagline">Kanban for Life</span></div>
        <form action={async () => { "use server"; await signIn("google", { redirectTo: to }); }}>
          <button className="btn primary" type="submit" style={{ width: "100%", justifyContent: "center", padding: "10px 14px" }}>Google でログイン</button>
        </form>
        <p className="note" style={{ margin: 0 }}>ログイン後、GitHub を連携するとリポジトリを選べます。共有されたボードは GitHub の連携なしで見られます。</p>
      </div>
    </div>
  );
}
