import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * The mark is a carved printing block: a saffron square with an indigo dye drop,
 * cut slightly off-true like a hand-carved stamp.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-8 shrink-0", className)}>
      <path d="M3.5 5.2 Q3.3 3.4 5.2 3.3 L26.9 2.9 Q28.8 2.9 28.8 4.8 L29.1 26.7 Q29.1 28.7 27.1 28.7 L5 29.1 Q3.1 29.1 3.1 27.2 Z" fill="var(--saffron)" />
      <path d="M16 8.2 C19.6 12.4 21.6 15.2 21.6 18.1 A5.6 5.6 0 0 1 10.4 18.1 C10.4 15.2 12.4 12.4 16 8.2 Z" fill="var(--indigo-deep)" />
      <circle cx="13.9" cy="18.6" r="1.4" fill="var(--saffron)" opacity="0.9" />
    </svg>
  );
}

export function Logo({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={cn("group inline-flex items-center gap-2.5", className)} aria-label="Artisan Market home">
      <LogoMark className="transition-transform duration-300 group-hover:-rotate-6" />
      <span className="display text-[1.35rem] leading-none" style={{ fontVariationSettings: '"opsz" 48, "wdth" 82' }}>
        Artisan Market
      </span>
    </Link>
  );
}
