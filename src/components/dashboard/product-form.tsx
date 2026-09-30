"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveProduct } from "@/server/actions/product";
import { UploadDropzone } from "@/lib/uploadthing";
import { parseDollars } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Img = { key: string; url: string };
type Category = { id: string; name: string };

export type ProductFormValues = {
  title: string;
  description: string;
  priceCents: number;
  stock: number;
  categoryId: string | null;
  status: "DRAFT" | "ACTIVE" | "HIDDEN";
  images: Img[];
};

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function ProductForm({
  productId,
  initial,
  categories,
}: {
  productId: string | null;
  initial?: ProductFormValues;
  categories: Category[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [images, setImages] = useState<Img[]>(initial?.images ?? []);
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const hidden = initial?.status === "HIDDEN";

  function move(i: number, dir: -1 | 1) {
    setImages((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const priceCents = parseDollars(String(form.get("price")));
    if (priceCents === null) {
      setErrors({ priceCents: ["Enter a valid price"] });
      return;
    }
    startTransition(async () => {
      const res = await saveProduct(productId, {
        title: String(form.get("title")),
        description: String(form.get("description")),
        priceCents,
        stock: Number(form.get("stock")),
        categoryId: String(form.get("categoryId")) || null,
        status: form.get("status") === "ACTIVE" ? "ACTIVE" : "DRAFT",
        images,
      });
      setErrors(res?.fieldErrors ?? {});
      if (res?.error) toast.error(res.error);
      if (res?.ok) {
        toast.success(productId ? "Product updated" : "Product created");
        router.push("/dashboard/products");
        router.refresh();
      }
    });
  }

  const err = (k: string) => errors[k]?.[0] && <p className="text-sm text-destructive">{errors[k]![0]}</p>;

  return (
    <form onSubmit={onSubmit} className="grid max-w-2xl gap-5">
      {hidden && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
          An admin has hidden this product from the store. You can still edit it.
        </p>
      )}
      <div className="grid gap-2">
        <Label htmlFor="title">Title</Label>
        <Input id="title" name="title" defaultValue={initial?.title} required />
        {err("title")}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" name="description" rows={5} defaultValue={initial?.description} required />
        {err("description")}
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="grid gap-2">
          <Label htmlFor="price">Price (USD)</Label>
          <Input
            id="price"
            name="price"
            inputMode="decimal"
            defaultValue={initial ? (initial.priceCents / 100).toFixed(2) : ""}
            required
          />
          {err("priceCents")}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="stock">Stock</Label>
          <Input id="stock" name="stock" type="number" min={0} defaultValue={initial?.stock ?? 1} required />
          {err("stock")}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="categoryId">Category</Label>
          <select id="categoryId" name="categoryId" defaultValue={initial?.categoryId ?? ""} className={selectClass}>
            <option value="">None</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="status">Visibility</Label>
          <select
            id="status"
            name="status"
            defaultValue={initial?.status === "DRAFT" ? "DRAFT" : "ACTIVE"}
            className={selectClass}
            disabled={hidden}
          >
            <option value="ACTIVE">Listed</option>
            <option value="DRAFT">Draft</option>
          </select>
        </div>
      </div>

      <div className="grid gap-2">
        <Label>Photos (first photo is the cover)</Label>
        {images.length > 0 && (
          <ul className="grid grid-cols-3 gap-3 md:grid-cols-4">
            {images.map((img, i) => (
              <li key={img.key} className="grid gap-1">
                <div className="relative aspect-square overflow-hidden rounded-lg bg-muted">
                  <Image src={img.url} alt="" fill sizes="160px" className="object-cover" />
                </div>
                <div className="flex gap-1">
                  <Button type="button" variant="ghost" size="xs" onClick={() => move(i, -1)} disabled={i === 0}>←</Button>
                  <Button type="button" variant="ghost" size="xs" onClick={() => move(i, 1)} disabled={i === images.length - 1}>→</Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    className="ml-auto text-destructive"
                    onClick={() => setImages((prev) => prev.filter((p) => p.key !== img.key))}
                  >
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {images.length < 8 && (
          <UploadDropzone
            endpoint="productImage"
            config={{ mode: "auto" }}
            onClientUploadComplete={(files) => {
              setImages((prev) => [...prev, ...files.map((f) => ({ key: f.key, url: f.ufsUrl }))].slice(0, 8));
            }}
            onUploadError={(e) => {
              toast.error(e.message);
            }}
            className="ut-button:bg-primary ut-button:text-primary-foreground ut-label:text-foreground border-dashed"
          />
        )}
        {err("images")}
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : productId ? "Save changes" : "Create product"}</Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
      </div>
    </form>
  );
}
