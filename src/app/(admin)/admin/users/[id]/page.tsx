import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRolePage } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/format";
import { getUserDetail } from "@/server/queries/admin";
import { RoleBadge, StatusBadge } from "@/components/admin/status-badge";
import { BanUserButton, RoleSelect, UnbanUserButton } from "@/components/admin/moderation";
import { auditTargetHref } from "@/lib/audit-links";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata = { title: "User · Admin" };

export default async function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRolePage("admin");
  const { id } = await params;
  const detail = await getUserDetail(id);
  if (!detail) notFound();
  const { user, orders, bids, audit, activeSessions } = detail;
  const isSelf = user.id === session.user.id;
  const activeProducts = user.artisan
    ? await prisma.product.count({ where: { artisanId: user.artisan.id, status: "ACTIVE" } })
    : null;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <Link href="/admin/users" className="text-sm text-muted-foreground hover:underline">
            ← Users
          </Link>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            {user.name} <RoleBadge role={user.role} />
            {user.banned && <Badge variant="destructive">Banned</Badge>}
          </h1>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </div>
        {isSelf ? (
          <p className="text-sm text-muted-foreground">This is your account; you can&apos;t moderate yourself.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <RoleSelect userId={user.id} role={user.role} />
            {user.banned ? (
              <UnbanUserButton userId={user.id} />
            ) : user.role !== "admin" ? (
              <BanUserButton userId={user.id} name={user.name} activeProducts={activeProducts} />
            ) : null}
          </div>
        )}
      </div>

      {user.banned && (
        <Card className="border-destructive/40">
          <CardContent className="text-sm">
            <span className="font-medium">Ban reason:</span> {user.banReason ?? "—"}
            {user.banExpires && <> · expires {formatDateTime(user.banExpires)}</>}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
              <dt className="text-muted-foreground">User id</dt>
              <dd className="font-mono text-xs">{user.id}</dd>
              <dt className="text-muted-foreground">Joined</dt>
              <dd>{formatDate(user.createdAt)}</dd>
              <dt className="text-muted-foreground">Email verified</dt>
              <dd>{user.emailVerified ? "Yes" : "No"}</dd>
              <dt className="text-muted-foreground">Active sessions</dt>
              <dd className="tabular-nums">{activeSessions}</dd>
              <dt className="text-muted-foreground">Orders</dt>
              <dd className="tabular-nums">{user._count.orders}</dd>
              <dt className="text-muted-foreground">Bids</dt>
              <dd className="tabular-nums">{user._count.bids}</dd>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Shop</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {user.artisan ? (
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
                <dt className="text-muted-foreground">Name</dt>
                <dd className="font-medium">{user.artisan.shopName}</dd>
                <dt className="text-muted-foreground">Slug</dt>
                <dd className="font-mono text-xs">{user.artisan.slug}</dd>
                <dt className="text-muted-foreground">Commission</dt>
                <dd>{(user.artisan.commissionBps / 100).toFixed(1)}%</dd>
                <dt className="text-muted-foreground">Products</dt>
                <dd>
                  <Link href={`/admin/products?artisan=${user.artisan.id}`} className="underline">
                    {user.artisan._count.products} ({activeProducts} active)
                  </Link>
                </dd>
                <dt className="text-muted-foreground">Auctions</dt>
                <dd className="tabular-nums">{user.artisan._count.auctions}</dd>
                {user.artisan.bio && (
                  <>
                    <dt className="text-muted-foreground">Bio</dt>
                    <dd>{user.artisan.bio}</dd>
                  </>
                )}
              </dl>
            ) : (
              <p className="text-muted-foreground">No shop.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Orders</CardTitle>
          <Link href={`/admin/orders?q=${encodeURIComponent(user.email)}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
            All orders
          </Link>
        </CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <p className="text-sm text-muted-foreground">No orders.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Placed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>
                      <Link href={`/admin/orders/${o.id}`} className="font-mono text-xs hover:underline">
                        {o.id.slice(-10)}
                      </Link>
                    </TableCell>
                    <TableCell><StatusBadge status={o.status} /></TableCell>
                    <TableCell>{o.source === "AUCTION" ? "Auction" : "Cart"}</TableCell>
                    <TableCell className="text-right tabular-nums">{o._count.items}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCents(o.totalCents)}</TableCell>
                    <TableCell className="tabular-nums">{formatDateTime(o.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent bids</CardTitle>
        </CardHeader>
        <CardContent>
          {bids.length === 0 ? (
            <p className="text-sm text-muted-foreground">No bids.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Auction</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bids.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell>
                      <Link href={`/admin/auctions/${b.auction.id}`} className="hover:underline">
                        {b.auction.product.title}
                      </Link>
                    </TableCell>
                    <TableCell><StatusBadge status={b.auction.status} /></TableCell>
                    <TableCell className="text-right tabular-nums">{formatCents(b.amountCents)}</TableCell>
                    <TableCell className="tabular-nums">{formatDateTime(b.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Audit history</CardTitle>
          <Link href={`/admin/audit?targetId=${user.id}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
            In audit log
          </Link>
        </CardHeader>
        <CardContent>
          {audit.length === 0 ? (
            <p className="text-sm text-muted-foreground">No moderation history.</p>
          ) : (
            <ul className="grid gap-3 text-sm">
              {audit.map((a) => {
                const href = auditTargetHref(a.targetType, a.targetId);
                const onThisUser = a.targetType === "user" && a.targetId === user.id;
                return (
                  <li key={a.id} className="flex flex-wrap items-baseline gap-x-2">
                    <span className="tabular-nums text-muted-foreground">{formatDateTime(a.createdAt)}</span>
                    <Badge variant="secondary" className="font-mono">{a.action}</Badge>
                    {onThisUser ? (
                      <span>
                        by{" "}
                        <Link href={`/admin/users/${a.actor.id}`} className="underline">
                          {a.actor.name}
                        </Link>
                      </span>
                    ) : (
                      <span>
                        performed on{" "}
                        {href ? (
                          <Link href={href} className="underline">
                            {a.targetType}
                          </Link>
                        ) : (
                          a.targetType
                        )}
                      </span>
                    )}
                    {a.reason && <span className="text-muted-foreground">— {a.reason}</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
