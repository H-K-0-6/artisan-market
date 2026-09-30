import { requireRolePage } from "@/lib/rbac";
import { listUsers, USER_SORTS } from "@/server/queries/admin";
import { ROLES } from "@/lib/permissions";
import { first, parseTableState, pickEnum, toView, type SearchParams } from "@/lib/table-params";
import { UsersTable } from "@/components/admin/tables/users-table";

export const metadata = { title: "Users · Admin" };

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireRolePage("admin");
  const sp = await searchParams;
  const state = parseTableState(sp, { sortable: USER_SORTS, defaultSort: "createdAt" });
  const banned = pickEnum(sp, "banned", ["true", "false"] as const);
  const result = await listUsers({
    ...state,
    role: pickEnum(sp, "role", ROLES),
    banned: banned === undefined ? undefined : banned === "true",
    q: first(sp, "q"),
  });

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">Users</h1>
      <UsersTable rows={result.rows} view={toView(result, state, sp)} />
    </div>
  );
}
