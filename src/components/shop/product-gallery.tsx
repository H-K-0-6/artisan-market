"use client";

import { useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

export function ProductGallery({ images, title }: { images: { id: string; url: string }[]; title: string }) {
  const [active, setActive] = useState(0);
  const current = images[active];

  return (
    <div className="grid gap-3">
      <div className="relative aspect-[4/5] overflow-hidden rounded-[1.75rem] bg-indigo-soft">
        {current ? (
          <Image
            key={current.id}
            src={current.url}
            alt={title}
            fill
            loading="eager"
            fetchPriority="high"
            sizes="(min-width: 1024px) 55vw, 100vw"
            className="object-cover animate-in fade-in duration-300"
          />
        ) : (
          <div className="grid h-full place-items-center text-sm text-muted-foreground">No photo yet</div>
        )}
      </div>
      {images.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {images.map((img, i) => (
            <button
              key={img.id}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`Show photo ${i + 1} of ${images.length}`}
              aria-current={i === active}
              className={cn(
                "relative size-20 overflow-hidden rounded-xl bg-indigo-soft ring-offset-2 ring-offset-background transition",
                i === active ? "ring-2 ring-indigo" : "opacity-60 hover:opacity-100",
              )}
            >
              <Image src={img.url} alt="" fill sizes="80px" className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
