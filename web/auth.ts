import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

/**
 * Google sign-in. The session carries the Google account id (sub) and email;
 * everything else (GitHub link, boards, sharing) lives in lib/store.ts keyed by that id.
 * Set KBAN_ALLOWED_EMAILS (comma separated) to restrict who may sign in at all.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  callbacks: {
    signIn({ profile }) {
      const allow = (process.env.KBAN_ALLOWED_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
      if (!profile?.email || profile.email_verified === false) return false;
      return !allow.length || allow.includes(profile.email.toLowerCase());
    },
    jwt({ token, profile }) {
      if (profile?.sub) token.uid = `google:${profile.sub}`;
      return token;
    },
    session({ session, token }) {
      if (token.uid) session.user.id = token.uid as string;
      return session;
    },
    authorized({ auth, request }) {
      const p = request.nextUrl.pathname;
      if (p === "/login" || p.startsWith("/api/auth") || p === "/api/native/exchange") return true;
      if (p === "/api/capture" && request.headers.get("authorization")?.startsWith("Bearer kbt_")) return true;
      return !!auth?.user;
    },
  },
});
