import Image from "next/image";
import { Logo } from "@/components/brand/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside className="dark indigo-cloth relative hidden flex-col justify-between overflow-hidden p-12 text-white lg:flex">
        <Logo />
        <div className="relative z-10 grid max-w-md gap-4">
          <p className="display text-5xl leading-[0.95]">Made by hand, sold by the hands that made it.</p>
          <p className="text-white/70">Buy from independent makers, or bid on one-of-a-kind lots when an auction opens.</p>
        </div>
        <figure className="relative z-10 flex items-center gap-4">
          <div className="relative size-16 overflow-hidden rounded-2xl bg-white/10">
            <Image src="/demo/anagama-wood-fired-moon-jar.jpg" alt="" fill sizes="64px" className="object-cover" />
          </div>
          <figcaption className="text-sm text-white/70">
            <span className="block font-semibold text-white">Anagama Moon Jar</span>
            Wood-fired by Mira&apos;s Clay Studio
          </figcaption>
        </figure>
        <div className="pointer-events-none absolute -right-24 top-1/2 size-[28rem] -translate-y-1/2 rounded-full bg-saffron/10 blur-3xl" aria-hidden />
      </aside>
      <main className="flex flex-col items-center justify-center gap-8 px-4 py-12 sm:px-8">
        <div className="lg:hidden">
          <Logo />
        </div>
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
