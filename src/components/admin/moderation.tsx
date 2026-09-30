"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  banUserAction,
  cancelAuctionAction,
  hideProductAction,
  restoreProductAction,
  setUserRoleAction,
  unbanUserAction,
  type AdminActionResult,
} from "@/server/actions/admin";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

function report(res: AdminActionResult) {
  if (res.ok) toast.success(res.message ?? "Done");
  else toast.error(res.error);
  return res.ok;
}

/** A button that opens a dialog asking for a reason, then runs `onConfirm`. */
function ReasonDialog({
  trigger,
  triggerLabel,
  title,
  description,
  confirmLabel,
  placeholder,
  onConfirm,
  children,
}: {
  trigger: React.ReactElement;
  triggerLabel: React.ReactNode;
  title: string;
  description: string;
  confirmLabel: string;
  placeholder: string;
  onConfirm: (reason: string) => Promise<AdminActionResult>;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const valid = reason.trim().length >= 3;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setReason("");
      }}
    >
      <DialogTrigger render={trigger}>{triggerLabel}</DialogTrigger>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            startTransition(async () => {
              if (report(await onConfirm(reason.trim()))) {
                setOpen(false);
                setReason("");
              }
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="moderation-reason">Reason</Label>
            <Textarea
              id="moderation-reason"
              name="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={placeholder}
              maxLength={500}
              required
              autoFocus
            />
            <p className="text-xs text-muted-foreground">Recorded in the audit log.</p>
          </div>
          {children}
          <DialogFooter>
            <Button type="submit" variant="destructive" disabled={!valid || pending}>
              {pending ? "Working…" : confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function HideProductButton({ productId, title }: { productId: string; title: string }) {
  return (
    <ReasonDialog
      trigger={<Button variant="ghost" size="sm" className="text-destructive" data-action="hide-product" />}
      triggerLabel="Hide"
      title={`Hide "${title}"?`}
      description="The listing disappears from the store and the artisan is notified. They can't re-list it until you restore it."
      confirmLabel="Hide product"
      placeholder="e.g. Violates the handmade-only policy"
      onConfirm={(reason) => hideProductAction({ productId, reason })}
    />
  );
}

export function RestoreProductButton({ productId }: { productId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      data-action="restore-product"
      disabled={pending}
      onClick={() => startTransition(async () => void report(await restoreProductAction({ productId })))}
    >
      {pending ? "Restoring…" : "Restore"}
    </Button>
  );
}

export function BanUserButton({
  userId,
  name,
  activeProducts,
}: {
  userId: string;
  name: string;
  /** ACTIVE products in their shop, or null if they have no shop. */
  activeProducts: number | null;
}) {
  const [hideProducts, setHideProducts] = useState(activeProducts !== null && activeProducts > 0);
  return (
    <ReasonDialog
      trigger={<Button variant="destructive" size="sm" data-action="ban-user" />}
      triggerLabel="Ban user"
      title={`Ban ${name}?`}
      description="They are signed out everywhere immediately, their live connections are dropped, and they can't sign in or bid until unbanned."
      confirmLabel="Ban user"
      placeholder="e.g. Shill bidding on own auctions"
      onConfirm={(reason) => banUserAction({ userId, reason, hideProducts: activeProducts !== null && hideProducts })}
    >
      {activeProducts !== null && (
        <label className="flex items-start gap-2 text-sm">
          <Checkbox checked={hideProducts} onCheckedChange={(c) => setHideProducts(c === true)} name="hideProducts" />
          <span>
            Also hide their {activeProducts} active product{activeProducts === 1 ? "" : "s"}
            <span className="block text-xs text-muted-foreground">Restore them individually from the Products page.</span>
          </span>
        </label>
      )}
    </ReasonDialog>
  );
}

export function UnbanUserButton({ userId }: { userId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      data-action="unban-user"
      disabled={pending}
      onClick={() => startTransition(async () => void report(await unbanUserAction({ userId })))}
    >
      {pending ? "Unbanning…" : "Unban"}
    </Button>
  );
}

const ROLE_ITEMS = [
  { value: "buyer", label: "Buyer" },
  { value: "artisan", label: "Artisan" },
  { value: "admin", label: "Admin" },
];

export function RoleSelect({ userId, role, disabled }: { userId: string; role: string; disabled?: boolean }) {
  const [value, setValue] = useState(role);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex items-center gap-2">
      <Select value={value} items={ROLE_ITEMS} onValueChange={(v) => v && setValue(String(v))} disabled={disabled || pending}>
        <SelectTrigger size="sm" className="w-28" aria-label="Role" data-action="role-select">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ROLE_ITEMS.map((r) => (
            <SelectItem key={r.value} value={r.value}>
              {r.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        size="sm"
        data-action="role-save"
        disabled={disabled || pending || value === role}
        onClick={() => {
          if (!confirm(`Change role from ${role} to ${value}?`)) return;
          startTransition(async () => {
            if (!report(await setUserRoleAction({ userId, role: value }))) setValue(role);
          });
        }}
      >
        {pending ? "Saving…" : "Change role"}
      </Button>
    </div>
  );
}

export function CancelAuctionButton({ auctionId }: { auctionId: string }) {
  return (
    <ReasonDialog
      trigger={<Button variant="destructive" size="sm" data-action="cancel-auction" />}
      triggerLabel="Cancel auction"
      title="Cancel this auction?"
      description="Bidding stops, bidders are notified, and any unpaid winner order is cancelled. This can't be undone."
      confirmLabel="Cancel auction"
      placeholder="e.g. Item is not handmade"
      onConfirm={(reason) => cancelAuctionAction({ auctionId, reason })}
    />
  );
}
