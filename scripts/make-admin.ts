// Promotes an existing account to admin.
// Usage: npx tsx scripts/make-admin.ts you@example.com
import "dotenv/config";
import { prisma } from "../src/lib/db";

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) throw new Error("Usage: npx tsx scripts/make-admin.ts <email>");
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`No account for ${email}. Sign up on the site first.`);
  await prisma.user.update({ where: { id: user.id }, data: { role: "admin" } });
  console.log(`${email} is now an admin (was ${user.role}).`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
