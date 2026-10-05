import { cn } from "@/lib/utils";

/** Saffron dot with a slow radiating ring: something is happening right now. */
export function LiveDot({ className }: { className?: string }) {
  return (
    <span className={cn("relative inline-flex size-2.5 shrink-0", className)} aria-hidden>
      <span className="absolute inset-0 animate-live-ring rounded-full bg-saffron" />
      <span className="relative inline-flex size-2.5 rounded-full bg-saffron ring-2 ring-saffron/30" />
    </span>
  );
}

/** "Lot 014": auction lots are numbered in the order they were catalogued. */
export function lotLabel(lotNumber: number) {
  return `Lot ${String(lotNumber).padStart(3, "0")}`;
}

export function LotNumber({ n, className }: { n: number; className?: string }) {
  return <span className={cn("numeric font-semibold tracking-tight", className)}>{lotLabel(n)}</span>;
}
