"use client";

import { useActionState } from "react";
import { becomeArtisan } from "@/server/actions/profile";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function BecomeArtisanForm() {
  const [state, action, pending] = useActionState(becomeArtisan, undefined);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Open your shop</CardTitle>
        <CardDescription>You can list products and run auctions once your shop exists.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="shopName">Shop name</Label>
            <Input id="shopName" name="shopName" required />
            {state?.fieldErrors?.shopName && (
              <p className="text-sm text-destructive">{state.fieldErrors.shopName[0]}</p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="bio">About your work</Label>
            <Textarea id="bio" name="bio" rows={4} />
          </div>
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create shop"}</Button>
        </form>
      </CardContent>
    </Card>
  );
}
