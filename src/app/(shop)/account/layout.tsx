import { requireRolePage } from "@/lib/rbac";
import { AccountTabs } from "@/components/shop/account-tabs";

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRolePage();
  return (
    <div className="grid gap-8">
      <header className="grid gap-2">
        <h1 className="display text-4xl sm:text-5xl">Your account</h1>
        <p className="text-muted-foreground">
          Signed in as <span className="font-semibold text-foreground">{session.user.name}</span> ({session.user.email})
        </p>
      </header>
      <AccountTabs />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
