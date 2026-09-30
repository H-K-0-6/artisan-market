import "dotenv/config";
import pg from "pg";
const B = "http://localhost:3000";
const db = new pg.Client({ connectionString: process.env.DATABASE_URL }); await db.connect();
const { rows: [p] } = await db.query(`SELECT id, title, "priceCents", stock, status FROM "Product" WHERE title = 'Ash-glazed Tea Bowl' ORDER BY "createdAt" DESC LIMIT 1`);
const { rows: imgs } = await db.query(`SELECT position, url FROM "ProductImage" WHERE "productId" = $1 ORDER BY position`, [p.id]);
console.log("product", p.title, p.priceCents, p.stock, p.status, "images:", imgs.length, imgs.map((i) => new URL(i.url).hostname).join(","));
async function login(email) {
  const r = await fetch(B + "/api/auth/sign-in/email", { method: "POST", headers: { "content-type": "application/json", origin: B }, body: JSON.stringify({ email, password: "Password123!" }) });
  return r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}
for (const email of ["artisan@demo.test", "artisan2@demo.test"]) {
  const r = await fetch(`${B}/dashboard/products/${p.id}`, { headers: { cookie: await login(email) }, redirect: "manual" });
  console.log(`edit page as ${email} ->`, r.status);
}
await db.end();
