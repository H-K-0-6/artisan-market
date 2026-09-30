const dateTime = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });
const dateOnly = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

export const formatDateTime = (d: Date | string) => dateTime.format(new Date(d));
export const formatDate = (d: Date | string) => dateOnly.format(new Date(d));

/** "just now", "5m ago", "3h ago", "2d ago", then a date. */
export function timeAgo(d: Date | string, now = Date.now()) {
  const s = Math.max(0, Math.round((now - new Date(d).getTime()) / 1000));
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86_400) return `${Math.round(s / 3600)}h ago`;
  if (s < 7 * 86_400) return `${Math.round(s / 86_400)}d ago`;
  return formatDate(d);
}
