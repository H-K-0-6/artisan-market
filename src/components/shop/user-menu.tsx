"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function UserMenu({ name, email, role }: { name: string; email: string; role: string }) {
  const router = useRouter();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>{name}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <div className="px-2 py-1.5">
          <div className="text-sm font-medium">{name}</div>
          <div className="text-xs text-muted-foreground">{email} · {role}</div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/account/orders" />}>My orders</DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/account/auctions" />}>My auctions</DropdownMenuItem>
        {role === "buyer" && (
          <DropdownMenuItem render={<Link href="/become-artisan" />}>Open a shop</DropdownMenuItem>
        )}
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
