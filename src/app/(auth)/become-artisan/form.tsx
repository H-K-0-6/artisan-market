"use client";

import { useActionState } from "react";
import { becomeArtisan } from "@/server/actions/profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function BecomeArtisanForm() {
  const [state, action, pending] = useActionState(becomeArtisan, undefined);
  return (
    <div className="grid gap-8">
      <div className="grid gap-2">
        <h1 className="display text-4xl">Open your shop</h1>
        <p className="text-muted-foreground">Name your studio and tell collectors about your work. You can list pieces and schedule auctions straight after.</p>
      </div>
      <form action={action} className="grid gap-5">
        <div className="grid gap-2">
          <Label htmlFor="shopName">Shop name</Label>
          <Input id="shopName" name="shopName" required placeholder="e.g. Hollow Oak Woodworks" className="h-11 bg-card" />
          {state?.fieldErrors?.shopName && <p className="text-sm font-medium text-madder">{state.fieldErrors.shopName[0]}</p>}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="bio">About your work</Label>
          <Textarea id="bio" name="bio" rows={4} placeholder="What you make, how, and where." className="bg-card" />
        </div>
        {state?.error && <p className="rounded-lg bg-madder-soft px-3 py-2 text-sm font-medium text-madder">{state.error}</p>}
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Opening your shop…" : "Open my shop"}
        </Button>
      </form>
    </div>
  );
}
