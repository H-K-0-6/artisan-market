import { io } from "socket.io-client";
const B = "http://localhost:3000";
async function login(email) {
  const r = await fetch(B + "/api/auth/sign-in/email", { method: "POST", headers: { "content-type": "application/json", origin: B }, body: JSON.stringify({ email, password: "Password123!" }) });
  const cookie = r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  return { status: r.status, cookie };
}
const get = (path, cookie) => fetch(B + path, { redirect: "manual", headers: cookie ? { cookie } : {} });
let r = await get("/"); const html = await r.text();
console.log("home", r.status, html.includes("Speckled Stoneware Mug"), html.includes("Live now"));
r = await get("/admin"); console.log("admin anon ->", r.status, r.headers.get("location"));
const buyer = await login("buyer@demo.test"); console.log("buyer login", buyer.status);
r = await get("/admin", buyer.cookie); console.log("admin as buyer ->", r.status, r.headers.get("location"));
r = await get("/dashboard", buyer.cookie); console.log("dashboard as buyer ->", r.status, r.headers.get("location"));
const admin = await login("admin@demo.test");
r = await get("/admin", admin.cookie); const ah = await r.text(); console.log("admin as admin ->", r.status, ah.includes("Admin overview"));
const art = await login("artisan@demo.test");
r = await get("/dashboard", art.cookie); const dh = await r.text(); console.log("dashboard as artisan ->", r.status, dh.includes("Clay Studio"));
const s = io(B, { extraHeaders: { cookie: buyer.cookie }, transports: ["websocket"] });
s.emit("ping", (reply) => { console.log("socket ping", JSON.stringify(reply)); s.close(); });
