import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, type Session } from "@/lib/auth";
import type { Role } from "@/lib/permissions";

export class AuthError extends Error {
  constructor(public code: "UNAUTHENTICATED" | "FORBIDDEN") {
    super(code);
  }
}

export async function getSession(): Promise<Session | null> {
  return auth.api.getSession({ headers: await headers() });
}

/** For server actions and route handlers: throws instead of redirecting. */
export async function requireRole(...allowed: Role[]): Promise<Session> {
  const session = await getSession();
  if (!session || session.user.banned) throw new AuthError("UNAUTHENTICATED");
  if (allowed.length && !allowed.includes(session.user.role as Role)) {
    throw new AuthError("FORBIDDEN");
  }
  return session;
}

/** For layouts and pages: redirects instead of throwing. */
export async function requireRolePage(...allowed: Role[]): Promise<Session> {
  const session = await getSession();
  if (!session || session.user.banned) redirect("/sign-in");
  if (allowed.length && !allowed.includes(session.user.role as Role)) redirect("/");
  return session;
}
