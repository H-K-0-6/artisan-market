// Read at runtime (not NEXT_PUBLIC_*, which is baked in at build time) so one image
// can be deployed to any domain.
export const appUrl = (path = "") =>
  `${process.env.APP_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000"}${path}`;
