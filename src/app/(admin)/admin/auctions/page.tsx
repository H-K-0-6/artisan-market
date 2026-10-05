import { requireRolePage } from "@/lib/rbac";
import { AUCTION_SORTS, listAuctions } from "@/server/queries/admin";
import { first, parseTableState, pickEnum, toView, type SearchParams } from "@/lib/table-params";
import { AuctionsTable } from "@/components/admin/tables/auctions-table";

export const metadata = { title: "Auctions · Admin" };

const STATUSES = ["DRAFT", "SCHEDULED", "LIVE", "ENDED", "PAID", "UNSOLD", "CANCELLED"] as const;

export default async function AdminAuctionsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireRolePage("admin");
  const sp = await searchParams;
  const state = parseTableState(sp, { sortable: AUCTION_SORTS, defaultSort: "startsAt" });
  const result = await listAuctions({ ...state, status: pickEnum(sp, "status", STATUSES), q: first(sp, "q") });

  return (
    <div className="grid gap-6">
      <h1 className="display text-4xl">Auctions</h1>
      <AuctionsTable rows={result.rows} view={toView(result, state, sp)} />
    </div>
  );
}
