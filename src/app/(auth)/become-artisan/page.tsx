import { redirect } from "next/navigation";
import { requireRolePage } from "@/lib/rbac";
import { BecomeArtisanForm } from "./form";

export const metadata = { title: "Open your shop" };

export default async function BecomeArtisanPage() {
  const session = await requireRolePage("buyer", "artisan");
  if (session.user.role === "artisan") redirect("/dashboard");
  return <BecomeArtisanForm />;
}
