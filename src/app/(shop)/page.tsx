import Image from "next/image";
import Link from "next/link";
import { getHomeData } from "@/server/queries/home";
import { HeroLot } from "@/components/auction/hero-lot";
import { AuctionCard } from "@/components/auction/auction-card";
import { ProductCard } from "@/components/shop/product-card";
import { SectionHeading } from "@/components/shop/section-heading";
import { buttonVariants } from "@/components/ui/button";

export default async function HomePage() {
  const { featured, moreLots, newest, makers, materials } = await getHomeData();

  return (
    <div className="grid gap-24">
      {featured ? (
        <HeroLot
          auctionId={featured.id}
          lotNumber={featured.lotNumber}
          title={featured.product.title}
          description={leadSentence(featured.product.description, featured.product.title)}
          shopName={featured.artisan.shopName}
          shopSlug={featured.artisan.slug}
          imageUrl={featured.product.images[0]?.url ?? null}
          hasReserve={featured.reservePriceCents != null}
          initial={{
            status: featured.status as "LIVE" | "SCHEDULED",
            currentPriceCents: featured.currentPriceCents,
            minNextBidCents: featured.minNextBidCents,
            bidCount: featured.bidCount,
            reserveMet: featured.reserveMet,
            startsAt: featured.startsAt.toISOString(),
            endsAt: featured.endsAt.toISOString(),
            serverNow: featured.serverNow,
          }}
        />
      ) : (
        <section className="grid gap-5 py-6">
          <h1 className="display max-w-3xl text-5xl sm:text-7xl">Made by hand, sold by the hands that made it.</h1>
          <p className="max-w-xl text-lg text-muted-foreground">
            Buy pieces outright from independent makers, or bid on one-of-a-kind lots when an auction opens.
          </p>
          <div>
            <Link href="/products" className={buttonVariants({ size: "lg" })}>
              Browse the shop
            </Link>
          </div>
        </section>
      )}

      {moreLots.length > 0 && (
        <section className="grid gap-8">
          <SectionHeading title="More lots" description="Live now and opening soon. Each lot is a single piece." href="/auctions" linkLabel="All auctions" />
          <div className={`grid grid-cols-2 gap-x-5 gap-y-10 ${moreLots.length >= 3 ? "md:grid-cols-4" : "md:grid-cols-3"}`}>
            {moreLots.map((a) => (
              <AuctionCard key={a.id} a={a} />
            ))}
          </div>
        </section>
      )}

      <section className="grid gap-8">
        <SectionHeading title="Shop by material" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {materials.map((m) => (
            <Link
              key={m.key}
              href={`/products?category=${m.category}`}
              className="group relative flex aspect-[3/4] items-end overflow-hidden rounded-[1.5rem] bg-indigo-deep p-5 text-white sm:p-6"
            >
              <Image
                src={m.image}
                alt=""
                fill
                sizes="(min-width: 1024px) 25vw, 50vw"
                className="object-cover opacity-70 mix-blend-luminosity transition duration-500 group-hover:scale-105 group-hover:opacity-90 group-hover:mix-blend-normal"
              />
              <span className="absolute inset-0 bg-gradient-to-t from-indigo-deep via-indigo-deep/40 to-transparent" aria-hidden />
              <span className="relative grid gap-1">
                <span className="display text-4xl sm:text-5xl">{m.label}</span>
                <span className="text-sm text-white/80">{m.line}</span>
                <span className="mt-2 text-sm font-semibold text-saffron">
                  {m.count} {m.count === 1 ? "piece" : "pieces"}
                </span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-8">
        <SectionHeading title="New in the shop" description="Ready to ship from the makers' own studios." href="/products" linkLabel="Browse everything" />
        <div className="grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
          {newest.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>

      <section className="indigo-cloth -mx-4 grid gap-10 rounded-none px-6 py-14 text-white sm:mx-0 sm:rounded-[2rem] sm:px-12">
        <div className="grid gap-2">
          <h2 className="display text-4xl text-white sm:text-5xl">How bidding works</h2>
          <p className="max-w-lg text-white/75">Every lot is one piece. The highest bid when the clock runs out takes it home.</p>
        </div>
        <ol className="grid gap-8 md:grid-cols-3">
          {[
            { title: "Pick a lot", body: "Lots open at a set time with an opening bid. Watch the price move live, no refreshing." },
            { title: "Bid before the clock runs out", body: "Each bid must clear the last by the lot's increment. A bid in the final 2 minutes adds 2 more, so nobody wins by sniping." },
            { title: "Pay within 48 hours", body: "If you win, you'll get a link to pay securely. The maker ships it straight from their studio." },
          ].map((step, i) => (
            <li key={step.title} className="grid content-start gap-3 border-t border-white/15 pt-5">
              <span className="display numeric text-5xl text-saffron">{i + 1}</span>
              <h3 className="font-sans text-lg font-semibold tracking-normal">{step.title}</h3>
              <p className="text-white/75">{step.body}</p>
            </li>
          ))}
        </ol>
        <div>
          <Link href="/auctions" className={buttonVariants({ variant: "bid", size: "lg" })}>
            See what&apos;s on the block
          </Link>
        </div>
      </section>

      {makers.length > 0 && (
        <section className="grid gap-8">
          <SectionHeading title="Meet the makers" description="Every shop is run by the person at the wheel, the loom or the bench." />
          <div className="grid gap-6 md:grid-cols-3">
            {makers.map((m) => (
              <Link
                key={m.slug}
                href={`/shops/${m.slug}`}
                className="group grid content-start gap-5 rounded-[1.5rem] border bg-card p-5 transition-colors hover:border-indigo/40"
              >
                <div className="grid grid-cols-3 gap-2">
                  {m.products.map((p) => (
                    <div key={p.slug} className="relative aspect-square overflow-hidden rounded-xl bg-indigo-soft">
                      {p.images[0] && <Image src={p.images[0].url} alt={p.title} fill sizes="12vw" className="object-cover" />}
                    </div>
                  ))}
                </div>
                <div className="grid gap-1.5">
                  <h3 className="display text-2xl group-hover:text-indigo">{m.shopName}</h3>
                  {m.bio && <p className="line-clamp-2 text-sm text-muted-foreground">{m.bio}</p>}
                  <p className="text-sm font-semibold text-indigo">
                    {m._count.products} {m._count.products === 1 ? "piece" : "pieces"} in the shop
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function leadSentence(text: string, title: string) {
  // Seeded descriptions open by repeating the title; skip that sentence.
  const body = text.startsWith(title) ? text.slice(title.length).replace(/^[.,]?\s*/, "") : text;
  const m = body.match(/^.*?[.!?](\s|$)/);
  return (m ? m[0] : body).trim();
}
