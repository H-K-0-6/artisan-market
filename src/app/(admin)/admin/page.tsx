import Link from "next/link";
import { requireRolePage } from "@/lib/rbac";
import { formatCents } from "@/lib/money";
import { getAdminOverview } from "@/server/queries/admin";
import { RevenueChart } from "@/components/admin/revenue-chart";
import { ActivityFeed } from "@/components/admin/activity-feed";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatTile } from "@/components/dashboard/dashboard-shell";

export const metadata = { title: "Admin" };

function Stat(props: { label: string; value: string; sub?: string; href?: string; tone?: "indigo" | "saffron" | "weld" | "madder" }) {
  const tile = <StatTile label={props.label} value={props.value} note={props.sub} tone={props.tone} />;
  return props.href ? (
    <Link href={props.href} className="rounded-2xl transition-transform hover:-translate-y-0.5">
      {tile}
    </Link>
  ) : (
    tile
  );
}

/** The product title or user email recorded in an audit row's meta, if any. */
function targetLabel(meta: unknown): string | null {
  if (!meta || typeof meta !== "object") return null;
  const m = meta as { title?: unknown; email?: unknown };
  const v = m.title ?? m.email;
  return typeof v === "string" ? `"${v}"` : null;
}

export default async function AdminOverviewPage() {
  await requireRolePage("admin");
  const o = await getAdminOverview();

  return (
    <div className="grid gap-6">
      <h1 className="display text-4xl">Overview</h1>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Sales, last 30 days" value={formatCents(o.last30.gross)} sub={`${o.last30.orders} paid orders`} href="/admin/orders?status=PAID" tone="weld" />
        <Stat label="Commission, last 30 days" value={formatCents(o.last30.commission)} sub={`${formatCents(o.allTime.commission)} all time`} tone="weld" />
        <Stat label="Live auctions" value={String(o.liveAuctions)} sub={`${o.pendingOrders} won lots awaiting payment`} href="/admin/auctions?status=LIVE" tone="saffron" />
        <Stat label="Hidden products" value={String(o.hiddenProducts)} sub="Removed from the shop by an admin" href="/admin/products?status=HIDDEN" tone={o.hiddenProducts ? "madder" : "indigo"} />
        <Stat label="Users" value={String(o.users)} sub={`${o.bannedUsers} banned`} href="/admin/users" />
        <Stat label="Artisan shops" value={String(o.artisans)} href="/admin/users?role=artisan" />
        <Stat label="Active products" value={String(o.activeProducts)} href="/admin/products?status=ACTIVE" />
        <Stat label="Sales, all time" value={formatCents(o.allTime.gross)} sub={`${o.allTime.orders} orders`} tone="weld" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Daily revenue</CardTitle>
            <CardDescription>Paid, shipped and delivered orders over the last 30 days (UTC). Bar height is gross sales.</CardDescription>
          </CardHeader>
          <CardContent>
            <RevenueChart data={o.revenue} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Activity</CardTitle>
            <CardDescription>
              Moderation events as they happen. <Link href="/admin/audit" className="underline">Audit log</Link>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ActivityFeed
              initial={o.recent.map((r) => ({
                kind: r.action,
                message: `${r.actor.name}: ${r.action} ${targetLabel(r.meta) ?? r.targetType}${r.reason ? ` — ${r.reason}` : ""}`,
                at: r.createdAt.toISOString(),
              }))}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
