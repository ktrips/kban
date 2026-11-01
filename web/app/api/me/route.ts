import { me } from "@/lib/access";
import { handle } from "@/lib/route";
import { saveUser } from "@/lib/store";
import { current } from "@/lib/limits";

export const dynamic = "force-dynamic";

export const GET = () =>
  handle(async () => {
    const u = await me();
    return { user: { email: u.email, name: u.name }, github: u.github ? { login: u.github.login } : null, limits: current(u.limits), limitsLinked: !!u.limitsHash };
  });

/** Unlink GitHub. */
export const DELETE = () =>
  handle(async () => {
    const u = await me();
    delete u.github;
    await saveUser(u);
  });
