import { requireRolePage } from "@/lib/rbac";
import { AUDIT_TARGETS, listAuditActions, listAuditLogs } from "@/server/queries/admin";
import { first, parseTableState, pickEnum, toView, type SearchParams } from "@/lib/table-params";
import { AuditTable } from "@/components/admin/tables/audit-table";

export const metadata = { title: "Audit log · Admin" };

export default async function AdminAuditPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireRolePage("admin");
  const sp = await searchParams;
  const state = parseTableState(sp, { sortable: ["createdAt"] as const, defaultSort: "createdAt", defaultPageSize: 50 });
  const [result, actions] = await Promise.all([
    listAuditLogs({
      ...state,
      action: first(sp, "action"),
      targetType: pickEnum(sp, "target", AUDIT_TARGETS),
      actorId: first(sp, "actor"),
      targetId: first(sp, "targetId"),
    }),
    listAuditActions(),
  ]);

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="display text-4xl">Audit log</h1>
        <p className="text-sm text-muted-foreground">Every moderation action, newest first.</p>
      </div>
      <AuditTable rows={result.rows} view={toView(result, state, sp)} actions={actions} />
    </div>
  );
}
