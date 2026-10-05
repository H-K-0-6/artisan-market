import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * The mark is a lot ticket: a saffron ticket with notches on both sides (the same
 * shape as the auction lot tickets across the site) carrying an indigo "A".
 * Fixed brand colours, not theme tokens, so it is identical everywhere; the same
 * drawing is the browser tab icon (src/app/icon.svg).
 */
export const TICKET_PATH =
  "M6 5h20a3 3 0 0 1 3 3v5.2a2.8 2.8 0 0 0 0 5.6V24a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-5.2a2.8 2.8 0 0 0 0-5.6V8a3 3 0 0 1 3-3z";
export const LETTER_A_PATH = "M13.6 8.5h4.8l5 14.5h-4.2l-.9-2.9h-4.6l-.9 2.9H8.6zM16 12.4l-1.4 4.6h2.8z";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-8 shrink-0", className)}>
      <path d={TICKET_PATH} fill="#f3b21b" />
      <path d={LETTER_A_PATH} fill="#22306b" fillRule="evenodd" />
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
