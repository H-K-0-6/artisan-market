import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements, userAc } from "better-auth/plugins/admin/access";

export const ROLES = ["buyer", "artisan", "admin"] as const;
export type Role = (typeof ROLES)[number];

const statement = {
  ...defaultStatements,
  product: ["create", "update", "delete", "moderate"],
  auction: ["create", "cancel", "bid"],
  order: ["read-own", "fulfil", "read-all"],
} as const;

export const ac = createAccessControl(statement);

export const buyer = ac.newRole({
  ...userAc.statements,
  auction: ["bid"],
  order: ["read-own"],
});

export const artisan = ac.newRole({
  ...userAc.statements,
  product: ["create", "update", "delete"],
  auction: ["create", "cancel"],
  order: ["read-own", "fulfil"],
});

export const admin = ac.newRole({
  ...adminAc.statements,
  product: ["moderate"],
  auction: ["cancel"],
  order: ["read-all"],
});

export const roles = { buyer, artisan, admin };
