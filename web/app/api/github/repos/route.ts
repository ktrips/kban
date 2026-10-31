import { me, HttpError } from "@/lib/access";
import { handle } from "@/lib/route";
import { githubToken } from "@/lib/store";
import { listUserRepos } from "@/lib/github";

export const dynamic = "force-dynamic";

export const GET = () =>
  handle(async () => {
    const token = await githubToken((await me()).uid);
    if (!token) throw new HttpError(409, "GitHub を連携してください");
    return { repos: await listUserRepos(token) };
  });
