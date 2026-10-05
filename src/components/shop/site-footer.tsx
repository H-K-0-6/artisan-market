import Link from "next/link";
import { LogoMark } from "@/components/brand/logo";

const COLUMNS = [
  {
    title: "Shop",
    links: [
      { href: "/products", label: "All pieces" },
      { href: "/products?category=ceramics", label: "Ceramics" },
      { href: "/products?category=textiles", label: "Textiles" },
      { href: "/products?category=woodwork", label: "Woodwork" },
      { href: "/products?category=jewelry", label: "Jewelry" },
    ],
  },
  {
    title: "Auctions",
    links: [
      { href: "/auctions", label: "On the block now" },
      { href: "/auctions?tab=upcoming", label: "Coming up" },
      { href: "/account/auctions", label: "Your bids" },
    ],
  },
  {
    title: "Makers",
    links: [
      { href: "/become-artisan", label: "Open a shop" },
      { href: "/dashboard", label: "Studio dashboard" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mt-24 bg-indigo-deep text-white/70">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="grid content-start gap-4">
          <div className="flex items-center gap-2.5 text-white">
            <LogoMark />
            <span className="display text-xl" style={{ fontVariationSettings: '"opsz" 48, "wdth" 82' }}>
              Artisan Market
            </span>
          </div>
          <p className="max-w-xs text-sm leading-relaxed">
            Every piece here was made by hand by the person selling it. Buy outright, or bid on one-of-a-kind lots.
          </p>
        </div>
        {COLUMNS.map((col) => (
          <div key={col.title} className="grid content-start gap-3">
            <h2 className="font-sans text-sm font-semibold tracking-normal text-white">{col.title}</h2>
            <ul className="grid gap-2 text-sm">
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="hover:text-saffron">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10">
        <p className="mx-auto max-w-7xl px-4 py-5 text-xs text-white/45 sm:px-6">
          Demo photography from Wikimedia Commons, public domain and CC0.
        </p>
      </div>
    </footer>
  );
}
