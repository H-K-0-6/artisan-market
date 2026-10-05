"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "@/lib/auth-client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const ROLE_LABEL: Record<string, string> = { buyer: "Collector", artisan: "Maker", admin: "Admin" };

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");

export function UserMenu({ name, email, role }: { name: string; email: string; role: string }) {
  const router = useRouter();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Account menu for ${name}`}
        className="ml-1 inline-flex size-9 items-center justify-center rounded-full bg-saffron text-sm font-bold text-saffron-ink ring-2 ring-white/20 transition hover:ring-white/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        {initials(name)}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <div className="px-2 py-2">
          <div className="text-sm font-semibold">{name}</div>
          <div className="truncate text-xs text-muted-foreground">{email}</div>
          <div className="mt-1.5 inline-flex rounded-full bg-indigo-soft px-2 py-0.5 text-[11px] font-semibold text-indigo">
            {ROLE_LABEL[role] ?? role}
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/account/orders" />}>Orders</DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/account/auctions" />}>Bids and wins</DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/account/notifications" />}>Notifications</DropdownMenuItem>
        {role === "artisan" && <DropdownMenuItem render={<Link href="/dashboard" />}>My studio</DropdownMenuItem>}
        {role === "admin" && <DropdownMenuItem render={<Link href="/admin" />}>Admin</DropdownMenuItem>}
        {role === "buyer" && <DropdownMenuItem render={<Link href="/become-artisan" />}>Open a shop</DropdownMenuItem>}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={async () => {
            await signOut();
            router.push("/");
            router.refresh();
          }}
        >
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
