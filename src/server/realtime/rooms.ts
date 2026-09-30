export const rooms = {
  auction: (id: string) => `auction:${id}`,
  user: (id: string) => `user:${id}`,
  admin: "admin",
} as const;
