import Image from "next/image";
import Link from "next/link";
import { requireRolePage } from "@/lib/rbac";
import { formatCents } from "@/lib/money";
import { listMyBidding } from "@/server/queries/auctions";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";

export const metadata = { title: "My auctions" };

const MESSAGES: Record<string, { text: string; tone: "ok" | "warn" }> = {
  paid: { text: "That order is already paid. Thank you!", tone: "ok" },
  expired: { text: "The payment window for that auction has closed.", tone: "warn" },
  "not-found": { text: "We couldn't find that order on your account.", tone: "warn" },
  unavailable: { text: "That order can no longer be paid.", tone: "warn" },
  error: { text: "We couldn't start the payment. Please try again in a moment.", tone: "warn" },
};

const dateFmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

export default async function MyAuctionsPage({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const session = await requireRolePage();
  const { msg } = await searchParams;
  const all = await listMyBidding(session.user.id);
  const me = session.user.id;

  const won = all.filter((a) => a.winnerId === me);
  const active = all.filter((a) => a.status === "LIVE" || a.status === "SCHEDULED");
  const lost = all.filter((a) => a.winnerId !== me && !["LIVE", "SCHEDULED"].includes(a.status));
  const message = msg ? MESSAGES[msg] : undefined;

  return (
    <div className="grid gap-8">
      <h2 className="text-xl font-semibold">Auctions</h2>
      {message && (
        <p
          role="status"
          className={
            message.tone === "ok"
              ? "rounded-lg border border-emerald-500/40 bg-emerald-50 p-3 text-sm dark:bg-emerald-950/30"
              : "rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm"
          }
        >
          {message.text}
        </p>
      )}

      <Section title="Won" empty="You haven't won any auctions yet.">
        {won.map((a) => {
          const o = a.order;
          const pending = o?.status === "PENDING";
          return (
            <Row key={a.id} a={a}>
              <div className="text-sm">Winning bid {formatCents(a.currentPriceCents ?? 0)}</div>
              <div className="flex flex-wrap items-center gap-2">
                <OrderBadge status={o?.status ?? (a.status === "CANCELLED" ? "CANCELLED" : "PENDING")} />
                {pending && o?.payDeadline && (
                  <span className="text-xs text-muted-foreground">Pay by {dateFmt.format(o.payDeadline)}</span>
                )}
              </div>
              {pending && o && (
                <a href={`/pay/${o.id}`} className={buttonVariants({ size: "sm" })}>
                  Pay now
                </a>
              )}
            </Row>
          );
        })}
      </Section>

      <Section title="Bidding" empty="You're not bidding on any live auctions.">
        {active.map((a) => {
          const winning = a.highBidderId === me;
          return (
            <Row key={a.id} a={a}>
              <div className="text-sm">
                Current {formatCents(a.currentPriceCents ?? a.startPriceCents)} · your max {formatCents(a.myTopBidCents ?? 0)}
              </div>
              <Badge variant={winning ? "default" : "destructive"}>{winning ? "Winning" : "Outbid"}</Badge>
              <span className="text-xs text-muted-foreground">Ends {dateFmt.format(a.endsAt)}</span>
            </Row>
          );
        })}
      </Section>

      <Section title="Didn't win" empty="Nothing here.">
        {lost.map((a) => (
          <Row key={a.id} a={a}>
            <div className="text-sm">
              Your max {formatCents(a.myTopBidCents ?? 0)}
              {a.status === "CANCELLED" ? " · auction cancelled" : a.status === "UNSOLD" ? " · ended unsold" : ` · sold for ${formatCents(a.currentPriceCents ?? 0)}`}
            </div>
          </Row>
        ))}
      </Section>
    </div>
  );
}

function Section({ title, empty, children }: { title: string; empty: string; children: React.ReactNode[] }) {
  return (
    <section className="grid gap-3">
      <h3 className="text-lg font-medium">{title}</h3>
      {children.length === 0 ? <p className="text-sm text-muted-foreground">{empty}</p> : <ul className="grid gap-3">{children}</ul>}
    </section>
  );
}

function Row({ a, children }: { a: Awaited<ReturnType<typeof listMyBidding>>[number]; children: React.ReactNode }) {
  const img = a.product.images[0];
  return (
    <li className="flex items-center gap-4 rounded-lg border p-3">
      <div className="relative size-16 shrink-0 overflow-hidden rounded bg-muted">
        {img && <Image src={img.url} alt="" fill sizes="64px" className="object-cover" />}
      </div>
      <div className="grid flex-1 gap-1">
        <Link href={`/auctions/${a.id}`} className="font-medium hover:underline">
          {a.product.title}
        </Link>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">{children}</div>
      </div>
    </li>
  );
}

function OrderBadge({ status }: { status: string }) {
  const label: Record<string, string> = {
    PENDING: "Awaiting payment",
    PAID: "Paid",
    SHIPPED: "Shipped",
    DELIVERED: "Delivered",
    EXPIRED: "Payment window closed",
    CANCELLED: "Cancelled",
    REFUNDED: "Refunded",
  };
  const variant = status === "PENDING" ? "secondary" : status === "EXPIRED" || status === "CANCELLED" ? "destructive" : "default";
  return <Badge variant={variant}>{label[status] ?? status}</Badge>;
}
