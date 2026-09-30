"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-renders the page every few seconds (up to ~1 minute) while a payment is being confirmed. */
export function RefreshWhilePending({ intervalMs = 3000, maxTries = 20 }: { intervalMs?: number; maxTries?: number }) {
  const router = useRouter();
  useEffect(() => {
    let tries = 0;
    const id = setInterval(() => {
      if (++tries > maxTries) return clearInterval(id);
      router.refresh();
    }, intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs, maxTries]);
  return null;
}
