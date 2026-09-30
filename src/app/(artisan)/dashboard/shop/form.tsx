"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { updateShop } from "@/server/actions/profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function ShopForm({ shopName, bio }: { shopName: string; bio: string }) {
  const [state, action, pending] = useActionState(updateShop, undefined);
  useEffect(() => {
    if (state?.ok) toast.success("Shop updated");
  }, [state]);

  return (
    <form action={action} className="grid max-w-xl gap-4">
      <div className="grid gap-2">
        <Label htmlFor="shopName">Shop name</Label>
        <Input id="shopName" name="shopName" defaultValue={shopName} required />
        {state?.fieldErrors?.shopName && <p className="text-sm text-destructive">{state.fieldErrors.shopName[0]}</p>}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="bio">About your work</Label>
        <Textarea id="bio" name="bio" rows={5} defaultValue={bio} />
      </div>
      <div>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
      </div>
    </form>
  );
}
