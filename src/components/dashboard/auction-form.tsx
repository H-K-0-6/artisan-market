"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { createAuction } from "@/server/actions/auction";
import { UploadDropzone } from "@/lib/uploadthing";
import { parseDollars } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Img = { key: string; url: string };

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** "YYYY-MM-DDTHH:mm" in the browser's local time, for datetime-local inputs. */
function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AuctionForm({
  products,
  categories,
}: {
  products: { id: string; title: string }[];
  categories: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<"existing" | "new">(products.length ? "existing" : "new");
  const [images, setImages] = useState<Img[]>([]);
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const startRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLInputElement>(null);

  // Defaults (start in 5 minutes, run for 1 day) use the browser's time zone, so
  // they're filled in after mount rather than during the server render.
  useEffect(() => {
    const start = new Date(Date.now() + 5 * 60_000);
    start.setSeconds(0, 0);
    if (startRef.current && !startRef.current.value) startRef.current.value = toLocalInput(start);
    if (endRef.current && !endRef.current.value) endRef.current.value = toLocalInput(new Date(start.getTime() + 24 * 3600_000));
  }, []);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const money = (name: string) => {
      const raw = String(f.get(name) ?? "").trim();
      return raw === "" ? null : parseDollars(raw);
    };
    const startPriceCents = money("startPrice");
    const minIncrementCents = money("minIncrement");
    const reserveRaw = String(f.get("reserve") ?? "").trim();
    const reservePriceCents = reserveRaw === "" ? null : parseDollars(reserveRaw);
    const local: Record<string, string[]> = {};
    if (startPriceCents == null) local.startPriceCents = ["Enter a start price"];
    if (minIncrementCents == null) local.minIncrementCents = ["Enter an increment"];
    if (reserveRaw !== "" && reservePriceCents == null) local.reservePriceCents = ["Enter a valid reserve or leave it empty"];
    // datetime-local is in the artisan's time zone; send an absolute instant.
    const startsAt = new Date(String(f.get("startsAt")));
    const endsAt = new Date(String(f.get("endsAt")));
    if (Number.isNaN(startsAt.getTime())) local.startsAt = ["Pick a start time"];
    if (Number.isNaN(endsAt.getTime())) local.endsAt = ["Pick an end time"];
    if (Object.keys(local).length) {
      setErrors(local);
      return;
    }

    startTransition(async () => {
      const res = await createAuction({
        productId: mode === "existing" ? String(f.get("productId") || "") || null : null,
        newProduct:
          mode === "new"
            ? {
                title: String(f.get("title") ?? ""),
                description: String(f.get("description") ?? ""),
                categoryId: String(f.get("categoryId") ?? "") || null,
                images,
              }
            : null,
        startPriceCents: startPriceCents!,
        minIncrementCents: minIncrementCents!,
        reservePriceCents,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
      });
      setErrors(res?.fieldErrors ?? {});
      if (res?.error) toast.error(res.error);
      if (res?.ok && res.auctionId) {
        toast.success("Auction scheduled");
        router.push(`/dashboard/auctions/${res.auctionId}`);
        router.refresh();
      }
    });
  }

  const err = (k: string) => errors[k]?.[0] && <p className="text-sm text-destructive">{errors[k]![0]}</p>;

  return (
    <form onSubmit={onSubmit} className="grid max-w-2xl gap-6">
      <fieldset className="grid gap-3">
        <legend className="mb-2 font-medium">What are you auctioning?</legend>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" name="mode" checked={mode === "existing"} onChange={() => setMode("existing")} disabled={!products.length} />
            One of my products
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="mode" checked={mode === "new"} onChange={() => setMode("new")} />
            A new one-off piece
          </label>
        </div>

        {mode === "existing" ? (
          <div className="grid gap-2">
            <Label htmlFor="productId">Product</Label>
            <select id="productId" name="productId" className={selectClass} required>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
            {err("productId")}
          </div>
        ) : (
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="title">Title</Label>
              <Input id="title" name="title" required />
              {err("newProduct") ?? err("title")}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" name="description" rows={4} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="categoryId">Category</Label>
              <select id="categoryId" name="categoryId" className={selectClass} defaultValue="">
                <option value="">None</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {err("categoryId")}
            </div>
            <div className="grid gap-2">
              <Label>Photos</Label>
              {images.length > 0 && (
                <ul className="grid grid-cols-4 gap-2">
                  {images.map((img) => (
                    <li key={img.key} className="relative aspect-square overflow-hidden rounded-lg bg-muted">
                      <Image src={img.url} alt="" fill sizes="120px" className="object-cover" />
                      <button
                        type="button"
                        className="absolute right-1 top-1 rounded bg-background/80 px-1.5 text-xs"
                        onClick={() => setImages((prev) => prev.filter((p) => p.key !== img.key))}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {images.length < 8 && (
                <UploadDropzone
                  endpoint="productImage"
                  config={{ mode: "auto" }}
                  onClientUploadComplete={(files) =>
                    setImages((prev) => [...prev, ...files.map((f) => ({ key: f.key, url: f.ufsUrl }))].slice(0, 8))
                  }
                  onUploadError={(e) => {
                    toast.error(e.message);
                  }}
                  className="ut-button:bg-primary ut-button:text-primary-foreground ut-label:text-foreground border-dashed"
                />
              )}
            </div>
          </div>
        )}
      </fieldset>

      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <legend className="mb-2 font-medium">Pricing</legend>
        <div className="grid gap-2">
          <Label htmlFor="startPrice">Start price (USD)</Label>
          <Input id="startPrice" name="startPrice" inputMode="decimal" required />
          {err("startPriceCents")}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="minIncrement">Min increment (USD)</Label>
          <Input id="minIncrement" name="minIncrement" inputMode="decimal" defaultValue="5.00" required />
          {err("minIncrementCents")}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="reserve">Reserve (optional)</Label>
          <Input id="reserve" name="reserve" inputMode="decimal" placeholder="Hidden from buyers" />
          {err("reservePriceCents")}
        </div>
      </fieldset>

      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <legend className="mb-2 font-medium">Schedule</legend>
        <div className="grid gap-2">
          <Label htmlFor="startsAt">Starts</Label>
          <Input id="startsAt" name="startsAt" type="datetime-local" ref={startRef} required />
          {err("startsAt")}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="endsAt">Ends</Label>
          <Input id="endsAt" name="endsAt" type="datetime-local" ref={endRef} required />
          {err("endsAt")}
        </div>
        <p className="text-xs text-muted-foreground sm:col-span-2">
          Auctions must run for more than 5 minutes. A bid in the final 2 minutes extends the end by 2 minutes.
        </p>
      </fieldset>

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Scheduling…" : "Schedule auction"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
