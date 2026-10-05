import Link from "next/link";
import { ShoppingCartIcon } from "lucide-react";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/rbac";
import { buttonVariants } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";
import { NavLinks } from "@/components/shop/nav-links";
import { UserMenu } from "@/components/shop/user-menu";
import { NotificationBell } from "@/components/shop/notification-bell";
import { getCartCount, getNotificationSummary } from "@/server/queries/notifications";

export async function SiteHeader() {
  const session = await getSession();
  const role = session?.user.role;
  const [bell, cartCount, liveCount] = await Promise.all([
    session ? getNotificationSummary(session.user.id) : null,
    session ? getCartCount(session.user.id) : 0,
    prisma.auction.count({ where: { status: "LIVE" } }),
  ]);

  const items = [
    { href: "/products", label: "Shop" },
    { href: "/auctions", label: "Auctions" },
    ...(role === "artisan" ? [{ href: "/dashboard", label: "My studio" }] : []),
    ...(role === "admin" ? [{ href: "/admin", label: "Admin" }] : []),
  ];

  return (
    // `dark` scopes the dark tokens to the indigo bar, so ghost buttons, the bell
    // and the sign-up button read correctly on it; portalled popovers stay light.
    <header className="dark indigo-cloth sticky top-0 z-40 text-white shadow-[0_1px_0_rgb(255_255_255/0.06)]">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6">
        <Logo />
        <div className="hidden md:block">
          <NavLinks items={items} liveCount={liveCount} />
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {session && bell ? (
            <>
              <Link
                href="/cart"
                className={buttonVariants({ variant: "ghost", size: "sm", className: "relative text-white" })}
                aria-label={cartCount ? `Cart, ${cartCount} items` : "Cart"}
              >
                <ShoppingCartIcon />
                <span className="hidden sm:inline">Cart</span>
                {cartCount > 0 && (
                  <span
                    key={cartCount}
                    data-testid="cart-count"
                    className="numeric inline-flex min-w-5 animate-bump items-center justify-center rounded-full bg-saffron px-1.5 text-[11px] font-bold leading-5 text-saffron-ink"
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
              <Link href="/sign-in" className={buttonVariants({ variant: "ghost", size: "sm", className: "text-white" })}>
                Sign in
              </Link>
              <Link href="/sign-up" className={buttonVariants({ variant: "bid", size: "sm" })}>
                Join
              </Link>
            </>
          )}
        </div>
      </div>
      <div className="border-t border-white/10 md:hidden">
        <div className="mx-auto max-w-7xl overflow-x-auto px-2 py-1.5">
          <NavLinks items={items} liveCount={liveCount} />
        </div>
      </div>
    </header>
  );
}
