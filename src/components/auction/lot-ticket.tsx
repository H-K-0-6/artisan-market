import { formatCents } from "@/lib/money";
import { formatDuration, URGENT_MS } from "@/lib/time";
import { LiveDot, lotLabel } from "@/components/brand/live";
import type { LotStatus } from "@/hooks/use-live-lot";
import { cn } from "@/lib/utils";

const SURFACE: Record<LotStatus, string> = {
  LIVE: "bg-saffron text-saffron-ink",
  SCHEDULED: "bg-indigo text-white dark:text-indigo-deep",
  ENDED: "bg-weld text-white dark:text-indigo-deep",
  PAID: "bg-weld text-white dark:text-indigo-deep",
  UNSOLD: "bg-muted text-foreground",
  CANCELLED: "bg-madder-soft text-madder",
};

const STATE_LABEL: Record<LotStatus, string> = {
  LIVE: "Bidding open",
  SCHEDULED: "Opens soon",
  ENDED: "Sold",
  PAID: "Sold",
  UNSOLD: "Closed, unsold",
  CANCELLED: "Withdrawn",
};

/**
 * The lot ticket: the signature element. A notched ticket showing the lot number,
 * the price (which flashes when a bid lands) and the time left.
 */
export function LotTicket(props: {
  lotNumber: number;
  status: LotStatus;
  priceCents: number;
  hasBids: boolean;
  bidCount: number;
  reserve: "none" | "met" | "not-met";
  msLeft: number | null;
  msToStart: number | null;
  extended?: boolean;
  finalPriceCents?: number | null;
  size?: "lg" | "md";
  className?: string;
}) {
  const { status, msLeft, msToStart } = props;
  const lg = props.size !== "md";
  const urgent = status === "LIVE" && msLeft != null && msLeft > 0 && msLeft < URGENT_MS;
  const closing = status === "LIVE" && msLeft != null && msLeft <= 0;
  const sold = status === "ENDED" || status === "PAID";
  const priceLabel = sold ? "Hammer price" : props.hasBids ? "Current bid" : "Opening bid";
  const price = sold && props.finalPriceCents != null ? props.finalPriceCents : props.priceCents;

  return (
    <div className={cn("ticket relative overflow-hidden rounded-2xl shadow-[0_18px_40px_-18px_rgb(18_24_54/0.45)]", SURFACE[status], props.className)}>
      <div className={cn("grid gap-1", lg ? "px-7 pb-5 pt-6" : "px-5 pb-4 pt-5")}>
        <div className="flex items-center justify-between gap-3 text-sm font-semibold">
          <span className="numeric opacity-80">{lotLabel(props.lotNumber)}</span>
          <span className="inline-flex items-center gap-2">
            {status === "LIVE" && !closing && <LiveDot className="[&>span]:bg-saffron-ink" />}
            {closing ? "Closing" : STATE_LABEL[status]}
          </span>
        </div>
        <div className="mt-2 text-sm font-medium opacity-80">{priceLabel}</div>
        <div
          key={price}
          data-testid="current-price"
          className={cn(
            "display numeric -mx-1 w-fit rounded-md px-1",
            lg ? "text-6xl sm:text-7xl" : "text-5xl",
            status === "LIVE" && props.hasBids && "animate-bid-flash",
          )}
        >
          {formatCents(price)}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm font-medium opacity-85">
          <span data-testid="bid-count">
            {props.bidCount} {props.bidCount === 1 ? "bid" : "bids"}
          </span>
          <span>{props.reserve === "none" ? "No reserve" : props.reserve === "met" ? "Reserve met" : "Reserve not yet met"}</span>
        </div>
      </div>

      <div className={cn("ticket-perforation", lg ? "mx-7" : "mx-5")} aria-hidden />

      <div className={cn("flex items-end justify-between gap-3", lg ? "px-7 pb-6 pt-4" : "px-5 pb-4 pt-3")}>
        {status === "LIVE" && (
          <div>
            <div className="text-sm font-medium opacity-80">{props.extended ? "Extended by 2 minutes" : "Time left"}</div>
            <div
              data-testid="time-left"
              className={cn(
                "display numeric",
                lg ? "text-4xl" : "text-3xl",
                urgent && "text-madder",
                props.extended && "animate-bump",
              )}
            >
              {closing ? "Closing" : msLeft == null ? "--:--" : formatDuration(msLeft)}
            </div>
          </div>
        )}
        {status === "SCHEDULED" && (
          <div>
            <div className="text-sm font-medium opacity-80">Opens in</div>
            <div className={cn("display numeric", lg ? "text-4xl" : "text-3xl")}>
              {msToStart == null ? "--:--" : msToStart > 0 ? formatDuration(msToStart) : "Opening"}
            </div>
          </div>
        )}
        {status !== "LIVE" && status !== "SCHEDULED" && (
          <div className="text-sm font-medium opacity-85">
            {sold ? "This lot has found a home." : status === "UNSOLD" ? "Bidding closed without a sale." : "The maker withdrew this lot."}
          </div>
        )}
      </div>
    </div>
  );
}
