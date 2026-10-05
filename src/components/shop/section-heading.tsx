import Link from "next/link";
import { cn } from "@/lib/utils";

export function SectionHeading({
  title,
  description,
  href,
  linkLabel,
  className,
}: {
  title: string;
  description?: string;
  href?: string;
  linkLabel?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-x-6 gap-y-2", className)}>
      <div className="grid gap-1.5">
        <h2 className="display text-3xl sm:text-4xl">{title}</h2>
        {description && <p className="max-w-xl text-muted-foreground">{description}</p>}
      </div>
      {href && linkLabel && (
        <Link href={href} className="text-sm font-semibold text-indigo underline decoration-indigo/30 decoration-2 underline-offset-4 hover:decoration-saffron">
          {linkLabel}
        </Link>
      )}
    </div>
  );
}
