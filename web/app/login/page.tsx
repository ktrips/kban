import { signIn } from "@/auth";

export const metadata = { title: "kban にログイン" };

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const to = next && /^\/(?!\/)/.test(next) ? next : "/"; // 同じサイト内のパスだけ
  return (
    <div className="wrap" style={{ minHeight: "100%" }}>
      <header>
        <span className="logo"><b>K</b>ban</span><span className="tagline">Kanban for Life</span>
      </header>
      <div className="life-hero">
        <h1>人生で、作りたいもの。<br />追いかけたいこと。</h1>
        <p>リポジトリごとに「次に作りたいこと」を積み上げて、AI と一緒に形にしていく。</p>
      </div>
      <div className="section" style={{ maxWidth: 420, width: "100%", gap: 16, padding: 24 }}>
        <form action={async () => { "use server"; await signIn("google", { redirectTo: to }, { prompt: "select_account" }); }}>
          <button className="btn primary" type="submit" style={{ width: "100%", justifyContent: "center", padding: "10px 14px" }}>Google でログイン</button>
        </form>
        <p className="note" style={{ margin: 0 }}>ログイン後、GitHub を連携するとリポジトリを選べます。共有されたボードは GitHub の連携なしで見られます。</p>
      </div>
    </div>
  );
}
