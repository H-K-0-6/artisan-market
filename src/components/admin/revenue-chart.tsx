"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import type { RevenuePoint } from "@/server/queries/admin";
import { formatCents } from "@/lib/money";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

// Brand dyes: indigo (payouts, the bulk) and saffron (commission, the top slice).
// Far apart in hue and lightness, stepped separately for light and dark.
const config = {
  payout: { label: "Artisan payouts", theme: { light: "#22306b", dark: "#9fadf0" } },
  commission: { label: "Platform commission", theme: { light: "#f3b21b", dark: "#f6bf3c" } },
} satisfies ChartConfig;

const dayLabel = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

const compactUsd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 });

/**
 * Daily gross revenue as a stacked bar: artisan payouts + platform commission = gross.
 * Stacking keeps one y-axis while showing both measures honestly.
 */
export function RevenueChart({ data }: { data: RevenuePoint[] }) {
  const rows = data.map((d) => ({ day: d.day, payout: d.gross - d.commission, commission: d.commission, gross: d.gross }));

  return (
    <ChartContainer config={config} className="aspect-auto h-72 w-full">
      <BarChart data={rows} margin={{ left: 4, right: 4, top: 8 }} barCategoryGap={3}>
        <CartesianGrid vertical={false} strokeOpacity={0.5} />
        <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} tickFormatter={dayLabel} />
        <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => compactUsd.format(v / 100)} />
        <ChartTooltip
          cursor={{ fillOpacity: 0.15 }}
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => {
                const p = payload?.[0]?.payload as (typeof rows)[number] | undefined;
                return p ? `${dayLabel(p.day)}: ${formatCents(p.gross)} gross` : "";
              }}
              formatter={(value, name, item) => (
                <div className="flex w-full items-center gap-2">
                  <span className="size-2.5 shrink-0 rounded-[2px]" style={{ background: item.color }} />
                  <span className="text-muted-foreground">{config[name as keyof typeof config]?.label ?? name}</span>
                  <span className="numeric ml-auto font-semibold text-foreground">{formatCents(Number(value))}</span>
                </div>
              )}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="payout" stackId="gross" fill="var(--color-payout)" stroke="var(--background)" strokeWidth={1} radius={[0, 0, 0, 0]} />
        <Bar dataKey="commission" stackId="gross" fill="var(--color-commission)" stroke="var(--background)" strokeWidth={1} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}
