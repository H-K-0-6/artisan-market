import "server-only";
import { prisma } from "@/lib/db";
import { getIO } from "@/lib/io";
import { ROLES, type Role } from "@/lib/permissions";
import { rooms } from "@/server/realtime/rooms";
import { disconnectUser, emitToAdmins } from "@/server/realtime/emit";
import { recordAudit } from "@/server/services/audit.service";
import { createNotification, pushNotifications } from "@/server/services/notification.service";
import { cancelAuction } from "@/server/services/auction.service";

// Moderation logic behind src/server/actions/admin.ts. Every function here assumes
// the caller has already checked that `actorId` is an admin (requireRole("admin")).
// Better Auth calls need request headers, so they're injected by the action; tests
// pass fakes.

/** A user-facing refusal (bad target, self-action, wrong state). */
export class AdminActionError extends Error {}

export function assertNotSelf(actorId: string, targetUserId: string, message = "You can't do that to your own account") {
  if (actorId === targetUserId) throw new AdminActionError(message);
}

// ---------- Products ----------

export async function hideProduct(input: { actorId: string; productId: string; reason: string }) {
  const product = await prisma.product.findUnique({
    where: { id: input.productId },
    include: { artisan: { select: { userId: true } } },
  });
  if (!product) throw new AdminActionError("Product not found");
  assertNotSelf(input.actorId, product.artisan.userId, "You can't moderate your own listing");
  if (product.status === "HIDDEN") throw new AdminActionError("This product is already hidden");

  const notification = await prisma.$transaction(async (tx) => {
    await tx.product.update({
      where: { id: product.id },
      data: { status: "HIDDEN", hiddenReason: input.reason },
    });
    await recordAudit(
      {
        actorId: input.actorId,
        action: "product.hide",
        targetType: "product",
        targetId: product.id,
        reason: input.reason,
        meta: { title: product.title, previousStatus: product.status },
      },
      tx,
    );
    return createNotification(
      {
        userId: product.artisan.userId,
        type: "LISTING_HIDDEN",
        title: `"${product.title}" was hidden`,
        body: `An admin removed this listing from the store. Reason: ${input.reason}`,
        link: `/dashboard/products/${product.id}`,
      },
      tx,
    );
  });

  pushNotifications([notification]);
  emitToAdmins("product.hide", `Product "${product.title}" hidden: ${input.reason}`);
}

export async function restoreProduct(input: { actorId: string; productId: string }) {
  const product = await prisma.product.findUnique({
    where: { id: input.productId },
    include: { artisan: { select: { userId: true } } },
  });
  if (!product) throw new AdminActionError("Product not found");
  assertNotSelf(input.actorId, product.artisan.userId, "You can't moderate your own listing");
  if (product.status !== "HIDDEN") throw new AdminActionError("Only hidden products can be restored");

  const notification = await prisma.$transaction(async (tx) => {
    await tx.product.update({ where: { id: product.id }, data: { status: "ACTIVE", hiddenReason: null } });
    await recordAudit(
      {
        actorId: input.actorId,
        action: "product.restore",
        targetType: "product",
        targetId: product.id,
        meta: { title: product.title, previousReason: product.hiddenReason },
      },
      tx,
    );
    return createNotification(
      {
        userId: product.artisan.userId,
        type: "SYSTEM",
        title: `"${product.title}" is listed again`,
        body: "An admin restored this listing. It is visible in the store again.",
        link: `/dashboard/products/${product.id}`,
      },
      tx,
    );
  });

  pushNotifications([notification]);
  emitToAdmins("product.restore", `Product "${product.title}" restored`);
}

// ---------- Users ----------

export type BanDeps = { banInAuth: (userId: string, reason: string) => Promise<unknown> };

/**
 * Bans a user: Better Auth marks them banned and deletes their sessions, then their
 * open sockets are dropped. Optionally hides every ACTIVE product in their shop.
 */
export async function banUser(
  input: { actorId: string; userId: string; reason: string; hideProducts: boolean },
  deps: BanDeps,
) {
  assertNotSelf(input.actorId, input.userId, "You can't ban yourself");
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    include: { artisan: { select: { id: true } } },
  });
  if (!user) throw new AdminActionError("User not found");
  if (user.banned) throw new AdminActionError("This user is already banned");
  if (user.role === "admin") throw new AdminActionError("Change this admin's role before banning them");

  await deps.banInAuth(user.id, input.reason);
  disconnectUser(user.id);

  const hiddenProducts = await prisma.$transaction(async (tx) => {
    let hidden = 0;
    if (input.hideProducts && user.artisan) {
      const res = await tx.product.updateMany({
        where: { artisanId: user.artisan.id, status: "ACTIVE" },
        data: { status: "HIDDEN", hiddenReason: `Shop suspended: ${input.reason}` },
      });
      hidden = res.count;
    }
    await recordAudit(
      {
        actorId: input.actorId,
        action: "user.ban",
        targetType: "user",
        targetId: user.id,
        reason: input.reason,
        meta: { email: user.email, hideProducts: input.hideProducts, hiddenProducts: hidden },
      },
      tx,
    );
    return hidden;
  });

  emitToAdmins(
    "user.ban",
    `${user.name} (${user.email}) banned: ${input.reason}${hiddenProducts ? ` · ${hiddenProducts} products hidden` : ""}`,
  );
  return { hiddenProducts };
}

export type UnbanDeps = { unbanInAuth: (userId: string) => Promise<unknown> };

export async function unbanUser(input: { actorId: string; userId: string }, deps: UnbanDeps) {
  assertNotSelf(input.actorId, input.userId);
  const user = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!user) throw new AdminActionError("User not found");
  if (!user.banned) throw new AdminActionError("This user isn't banned");

  await deps.unbanInAuth(user.id);
  await recordAudit({
    actorId: input.actorId,
    action: "user.unban",
    targetType: "user",
    targetId: user.id,
    meta: { email: user.email, previousReason: user.banReason },
  });
  emitToAdmins("user.unban", `${user.name} (${user.email}) unbanned`);
}

export type SetRoleDeps = { setRoleInAuth: (userId: string, role: Role) => Promise<unknown> };

export async function setUserRole(input: { actorId: string; userId: string; role: Role }, deps: SetRoleDeps) {
  assertNotSelf(input.actorId, input.userId, "You can't change your own role");
  if (!ROLES.includes(input.role)) throw new AdminActionError("Unknown role");
  const user = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!user) throw new AdminActionError("User not found");
  if (user.role === input.role) throw new AdminActionError(`This user is already ${input.role === "admin" ? "an" : "a"} ${input.role}`);

  await deps.setRoleInAuth(user.id, input.role);
  // A demoted admin's open sockets must stop receiving the admin feed.
  if (user.role === "admin") getIO()?.in(rooms.user(user.id)).socketsLeave(rooms.admin);

  await recordAudit({
    actorId: input.actorId,
    action: "user.role",
    targetType: "user",
    targetId: user.id,
    meta: { email: user.email, from: user.role, to: input.role },
  });
  emitToAdmins("user.role", `${user.name} (${user.email}) role changed: ${user.role} → ${input.role}`);
}

// ---------- Auctions ----------

/** Cancels via the auction service (which owns the lifecycle), then audits it. */
export async function cancelAuctionAsAdmin(input: { actorId: string; auctionId: string; reason: string }) {
  const auction = await prisma.auction.findUnique({
    where: { id: input.auctionId },
    include: { product: { select: { title: true } }, artisan: { select: { userId: true } } },
  });
  if (!auction) throw new AdminActionError("Auction not found");
  assertNotSelf(input.actorId, auction.artisan.userId, "You can't moderate your own auction");
  if (auction.status === "CANCELLED") throw new AdminActionError("This auction is already cancelled");

  try {
    await cancelAuction({ auctionId: auction.id, actorId: input.actorId, reason: input.reason });
  } catch (err) {
    throw new AdminActionError(err instanceof Error ? err.message : "The auction could not be cancelled");
  }

  await recordAudit({
    actorId: input.actorId,
    action: "auction.cancel",
    targetType: "auction",
    targetId: auction.id,
    reason: input.reason,
    meta: { title: auction.product.title, previousStatus: auction.status },
  });
  emitToAdmins("auction.cancel", `Auction for "${auction.product.title}" cancelled: ${input.reason}`);
}
