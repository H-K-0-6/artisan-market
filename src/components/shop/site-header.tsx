import Link from "next/link";
import { ShoppingCartIcon } from "lucide-react";
import { getSession } from "@/lib/rbac";
import { buttonVariants } from "@/components/ui/button";
import { UserMenu } from "@/components/shop/user-menu";
import { NotificationBell } from "@/components/shop/notification-bell";
import { getCartCount, getNotificationSummary } from "@/server/queries/notifications";

export async function SiteHeader() {
  const session = await getSession();
  const role = session?.user.role;
  const [bell, cartCount] = session
    ? await Promise.all([getNotificationSummary(session.user.id), getCartCount(session.user.id)])
    : [null, 0];

  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
        <Link href="/" className="font-semibold tracking-tight">
          Artisan Market
        </Link>
        <nav className="flex items-center gap-4 text-sm text-muted-foreground">
          <Link href="/products" className="hover:text-foreground">Shop</Link>
          <Link href="/auctions" className="hover:text-foreground">Live auctions</Link>
          {role === "artisan" && <Link href="/dashboard" className="hover:text-foreground">Dashboard</Link>}
          {role === "admin" && <Link href="/admin" className="hover:text-foreground">Admin</Link>}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {session && bell ? (
            <>
              <Link
                href="/cart"
                className={buttonVariants({ variant: "ghost", size: "sm", className: "relative" })}
                aria-label={cartCount ? `Cart (${cartCount} items)` : "Cart"}
              >
                <ShoppingCartIcon />
                Cart
                {cartCount > 0 && (
                  <span
                    data-testid="cart-count"
                    className="ml-0.5 rounded-full bg-primary px-1.5 text-[10px] font-semibold leading-4 text-primary-foreground tabular-nums"
                  >
                    {cartCount > 99 ? "99+" : cartCount}
                  </span>
                )}
              </Link>
              {/* Remounts when the server's view changes (e.g. after router.refresh()). */}
              <NotificationBell
                key={`${bell.unread}:${bell.items[0]?.id ?? ""}`}
                initialItems={bell.items}
                initialUnread={bell.unread}
              />
              <UserMenu name={session.user.name} email={session.user.email} role={role ?? "buyer"} />
            </>
          ) : (
            <>
              <Link href="/sign-in" className={buttonVariants({ variant: "ghost", size: "sm" })}>Sign in</Link>
              <Link href="/sign-up" className={buttonVariants({ size: "sm" })}>Sign up</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
