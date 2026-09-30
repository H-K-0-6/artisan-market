const B = "http://localhost:3000";
const r = await fetch(B + "/api/auth/sign-in/email", { method: "POST", headers: { "content-type": "application/json", origin: B }, body: JSON.stringify({ email: "artisan@demo.test", password: "Password123!" }) });
const cookie = r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
const res = await fetch(B + "/api/uploadthing?actionType=upload&slug=productImage", {
  method: "POST",
  headers: { "content-type": "application/json", cookie, "x-uploadthing-package": "@uploadthing/react", "x-uploadthing-version": "7.7.4" },
  body: JSON.stringify({ files: [{ name: "a.jpg", size: 1000, type: "image/jpeg", lastModified: Date.now() }], input: null }),
});
console.log(res.status, (await res.text()).slice(0, 1500));
