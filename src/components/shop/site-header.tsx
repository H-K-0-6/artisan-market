import Link from "next/link";
import { getSession } from "@/lib/rbac";
import { buttonVariants } from "@/components/ui/button";
import { UserMenu } from "@/components/shop/user-menu";

export async function SiteHeader() {
  const session = await getSession();
  const role = session?.user.role;

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
          {session ? (
            <>
              <Link href="/cart" className={buttonVariants({ variant: "ghost", size: "sm" })}>Cart</Link>
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
