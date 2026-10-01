import { prisma } from "@/lib/db";
import { getBoss } from "@/lib/boss";

export const dynamic = "force-dynamic";

/** Liveness/readiness for Fly health checks: the DB answers and the job runner is up. */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    return Response.json({ ok: false, db: false }, { status: 503 });
  }
  const jobs = getBoss() != null;
  return Response.json({ ok: jobs, db: true, jobs }, { status: jobs ? 200 : 503 });
}
