"use client";

import { useState } from "react";
import Image from "next/image";
import { cn } from "cn";

export function ProductGallery({ images, title }: { images: { id: string; url: string }[]; title: string }) {
  const [active, setActive] = useState(0);
  const current = images[active];

  return (
    <div className="grid gap-3">
      <div className="relative aspect-square overflow-hidden rounded-lg bg-muted">
        {current ? (
          <Image src={current.url} alt={title} fill priority sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" />
        ) : (
          <div className="grid h-full place-items-center text-sm text-muted-foreground">No photo</div>
        )}
      </div>
      {images.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {images.map((img, i) => (
            <button
              key={img.id}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`Show photo ${i + 1}`}
              aria-current={i === active}
              className={cn(
                "relative size-16 overflow-hidden rounded-md bg-muted ring-offset-2 ring-offset-background",
                i === active ? "ring-2 ring-ring" : "opacity-70 hover:opacity-100",
              )}
            >
              <Image src={img.url} alt="" fill sizes="64px" className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
