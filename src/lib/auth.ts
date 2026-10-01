import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { admin as adminPlugin } from "better-auth/plugins";
import { prisma } from "@/lib/db";
import { ac, roles } from "@/lib/permissions";

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: { enabled: true, minPasswordLength: 8 },
  // On by default in production (sign-in/sign-up: 3 requests per 10s per IP).
  // The E2E server turns it off because it signs several users in back to back.
  rateLimit: { enabled: process.env.NODE_ENV === "production" && process.env.AUTH_RATE_LIMIT !== "off" },
  plugins: [
    adminPlugin({ ac, roles, defaultRole: "buyer", adminRoles: ["admin"] }),
    nextCookies(), // must stay last
  ],
});

export type Session = typeof auth.$Infer.Session;
