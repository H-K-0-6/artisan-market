import { requireRolePage } from "@/lib/rbac";
import { AccountTabs } from "@/components/shop/account-tabs";

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRolePage();
  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">My account</h1>
        <p className="text-sm text-muted-foreground">{session.user.email}</p>
      </div>
      <AccountTabs />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
