"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { signIn, signUp } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [asArtisan, setAsArtisan] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));

    const { error } =
      mode === "sign-in"
        ? await signIn.email({ email, password })
        : await signUp.email({ email, password, name: String(form.get("name")) });

    setPending(false);
    if (error) {
      setError(error.message ?? "Something went wrong");
      return;
    }
    const next = params.get("next");
    router.push(asArtisan ? "/become-artisan" : next?.startsWith("/") ? next : "/");
    router.refresh();
  }

  const isSignUp = mode === "sign-up";
  return (
    <div className="grid gap-8">
      <div className="grid gap-2">
        <h1 className="display text-4xl">{isSignUp ? "Join Artisan Market" : "Welcome back"}</h1>
        <p className="text-muted-foreground">
          {isSignUp ? "Collect handmade pieces, bid on lots, or open a shop of your own." : "Sign in to buy, bid and follow your orders."}
        </p>
      </div>
      <form onSubmit={onSubmit} className="grid gap-5">
        {isSignUp && (
          <div className="grid gap-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" required autoComplete="name" className="h-11 bg-card" />
          </div>
        )}
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required autoComplete="email" className="h-11 bg-card" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete={isSignUp ? "new-password" : "current-password"}
            className="h-11 bg-card"
          />
          {isSignUp && <p className="text-xs text-muted-foreground">At least 8 characters.</p>}
        </div>
        {isSignUp && (
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border bg-card p-4 text-sm has-[:checked]:border-saffron has-[:checked]:bg-saffron-soft">
            <input type="checkbox" className="mt-0.5 size-4 accent-[var(--indigo)]" checked={asArtisan} onChange={(e) => setAsArtisan(e.target.checked)} />
            <span>
              <span className="block font-semibold">I make things and want to sell</span>
              <span className="text-muted-foreground">We&apos;ll help you open your shop next.</span>
            </span>
          </label>
        )}
        {error && (
          <p className="rounded-lg bg-madder-soft px-3 py-2 text-sm font-medium text-madder" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "One moment…" : isSignUp ? "Create account" : "Sign in"}
        </Button>
        <p className="text-sm text-muted-foreground">
          {isSignUp ? (
            <>
              Already have an account?{" "}
              <Link href="/sign-in" className="font-semibold text-indigo underline underline-offset-4">
                Sign in
              </Link>
            </>
          ) : (
            <>
              New here?{" "}
              <Link href="/sign-up" className="font-semibold text-indigo underline underline-offset-4">
                Create an account
              </Link>
            </>
          )}
        </p>
      </form>
    </div>
  );
}
