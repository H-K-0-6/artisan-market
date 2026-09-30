import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { admin as adminPlugin } from "better-auth/plugins";
import { prisma } from "@/lib/db";
import { ac, roles } from "@/lib/permissions";

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: { enabled: true, minPasswordLength: 8 },
  plugins: [
    adminPlugin({ ac, roles, defaultRole: "buyer", adminRoles: ["admin"] }),
    nextCookies(), // must stay last
  ],
});

export type Session = typeof auth.$Infer.Session;
