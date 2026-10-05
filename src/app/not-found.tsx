import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-24 text-center">
      <p className="text-sm font-medium text-muted-foreground">404</p>
      <h1 className="display text-4xl">We couldn&apos;t find that page</h1>
      <p className="text-muted-foreground">It may have sold, been removed, or never existed.</p>
      <div className="flex gap-2">
        <Link href="/products" className={buttonVariants()}>Browse the shop</Link>
        <Link href="/auctions" className={buttonVariants({ variant: "outline" })}>Live auctions</Link>
      </div>
    </div>
  );
}
