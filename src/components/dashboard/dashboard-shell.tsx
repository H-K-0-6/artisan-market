import { SiteHeader } from "@/components/shop/site-header";
import { DashboardNav, type DashboardNavItem } from "@/components/dashboard/dashboard-nav";

/** Shared frame for the maker studio and the admin console. */
export function DashboardShell({
  title,
  subtitle,
  items,
  children,
}: {
  title: string;
  subtitle?: string;
  items: DashboardNavItem[];
  children: React.ReactNode;
}) {
  return (
    <>
      <SiteHeader />
      <div className="mx-auto grid w-full max-w-7xl flex-1 gap-8 px-4 py-8 sm:px-6 md:grid-cols-[220px_minmax(0,1fr)] md:gap-10">
        <aside className="grid content-start gap-5 md:sticky md:top-24 md:self-start">
          <div className="grid gap-0.5 px-3">
            <span className="text-sm font-semibold">{title}</span>
            {subtitle && <span className="truncate text-xs text-muted-foreground">{subtitle}</span>}
          </div>
          <DashboardNav items={items} />
        </aside>
        <main className="min-w-0">{children}</main>
      </div>
    </>
  );
}

/** Page title row used at the top of every dashboard page. */
export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="grid gap-1">
        <h1 className="display text-4xl">{title}</h1>
        {description && <p className="max-w-2xl text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const TONES = {
  indigo: "before:bg-indigo",
  saffron: "before:bg-saffron",
  weld: "before:bg-weld",
  madder: "before:bg-madder",
} as const;

/**
 * A figure with a dye-coloured rule on its left edge. The colour carries meaning:
 * saffron = live activity, weld = money in, madder = needs attention, indigo = counts.
 */
export function StatTile({
  label,
  value,
  note,
  tone = "indigo",
}: {
  label: string;
  value: string;
  note?: string;
  tone?: keyof typeof TONES;
}) {
  return (
    <div
      className={`relative grid gap-1 overflow-hidden rounded-2xl border bg-card px-5 py-4 before:absolute before:inset-y-3 before:left-0 before:w-1 before:rounded-r-full ${TONES[tone]}`}
    >
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="display numeric text-3xl">{value}</span>
      {note && <span className="text-xs text-muted-foreground">{note}</span>}
    </div>
  );
}
