import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { makeArtisan, makeProduct, resetDb } from "../helpers/db";

describe("test database", () => {
  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  it("creates fixtures in the test database", async () => {
    const { shop } = await makeArtisan();
    await makeProduct(shop.id);
    expect(await prisma.product.count()).toBe(1);
    const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
    expect(db).toMatch(/_test$/);
  });
});
